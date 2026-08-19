import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sharp from 'sharp';
import errorMiddleware from '../middleware/errorMiddleware.js';
import {
    prepareScanImage,
    uploadScanImage,
} from '../middleware/imageUploadMiddleware.js';
import {
    MAX_IMAGE_BYTES,
    clearImageBuffer,
    processScanImage,
} from '../services/imageService.js';
import { createProviderForm } from '../services/skinAnalysisService.js';

let server;
let baseUrl;
let providerCalls;
let releasedBuffer;

const testApp = express();
testApp.post('/upload', uploadScanImage, prepareScanImage, (req, res) => {
    providerCalls += 1;
    releasedBuffer = req.scanImage.buffer;
    res.json({
        success: true,
        data: {
            width: req.scanImage.width,
            height: req.scanImage.height,
            keys: Object.keys(req.scanImage).sort(),
        },
    });
});
testApp.use(errorMiddleware);

const jpegFixture = (width = 600, height = 600) => sharp({
    create: {
        width,
        height,
        channels: 3,
        background: { r: 130, g: 105, b: 90 },
    },
}).jpeg().toBuffer();

const postImage = async ({
    buffer,
    type = 'image/jpeg',
    filename = 'scan.jpg',
    extraFile,
    addUrlField = false,
}) => {
    const form = new FormData();
    if (addUrlField) {
        form.append('imageUrl', 'http://127.0.0.1/admin');
    }
    if (buffer) {
        form.append('image', new Blob([buffer], { type }), filename);
    }
    if (extraFile) {
        form.append('image', new Blob([extraFile], { type }), 'second.jpg');
    }

    return fetch(`${baseUrl}/upload`, { method: 'POST', body: form });
};

before(async () => {
    await new Promise((resolve, reject) => {
        server = testApp.listen(0, '127.0.0.1', () => {
            const address = server.address();
            baseUrl = `http://127.0.0.1:${address.port}`;
            resolve();
        });
        server.on('error', reject);
    });
});

after(async () => {
    await new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
    });
});

beforeEach(() => {
    providerCalls = 0;
    releasedBuffer = null;
});

test('normalizes orientation, constrains resolution, and strips metadata', async () => {
    const input = await sharp({
        create: {
            width: 5000,
            height: 500,
            channels: 3,
            background: { r: 40, g: 70, b: 110 },
        },
    })
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer();

    const result = await processScanImage(input);
    const metadata = await sharp(result.buffer).metadata();

    assert.equal(metadata.format, 'jpeg');
    assert.ok(result.width <= 4096);
    assert.ok(result.height <= 4096);
    assert.ok(result.width >= 200);
    assert.ok(result.height >= 200);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);

    clearImageBuffer(result.buffer);
});

test('reports when the image canvas misses the recommended face size', async () => {
    const input = await jpegFixture(250, 250);
    const result = await processScanImage(input);

    assert.equal(result.meetsRecommendedFaceCanvas, false);
    clearImageBuffer(result.buffer);
});

test('builds a provider multipart body with only a fixed image filename', async () => {
    const image = await jpegFixture();
    const form = createProviderForm(image);
    const body = form.getBuffer().toString('latin1');

    assert.match(form.getHeaders()['content-type'], /^multipart\/form-data; boundary=/);
    assert.match(body, /name="image"; filename="scan\.jpg"/);
    assert.doesNotMatch(body, /image_url|imageUrl|\.\.\/|private/);
    clearImageBuffer(image);
});

test('accepts one JPEG without trusting its filename and clears it after use', async () => {
    const response = await postImage({
        buffer: await jpegFixture(),
        filename: '../../private/portrait.php.jpg',
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(providerCalls, 1);
    assert.equal(body.success, true);
    assert.deepEqual(body.data.keys, [
        'buffer',
        'bytes',
        'height',
        'meetsRecommendedFaceCanvas',
        'width',
    ]);

    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(releasedBuffer.every((byte) => byte === 0));
});

test('rejects a spoofed JPEG before the provider handler', async () => {
    const response = await postImage({
        buffer: Buffer.from('not really a jpeg'),
    });
    const body = await response.json();

    assert.equal(response.status, 415);
    assert.equal(body.code, 'IMAGE_TYPE_UNSUPPORTED');
    assert.equal(providerCalls, 0);
});

test('rejects a corrupted JPEG before the provider handler', async () => {
    const response = await postImage({
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]),
    });
    const body = await response.json();

    assert.equal(response.status, 415);
    assert.equal(body.code, 'IMAGE_CONTENT_INVALID');
    assert.equal(providerCalls, 0);
});

test('rejects non-JPEG MIME types before decoding', async () => {
    const png = await sharp({
        create: {
            width: 400,
            height: 400,
            channels: 3,
            background: 'white',
        },
    }).png().toBuffer();
    const response = await postImage({ buffer: png, type: 'image/png' });
    const body = await response.json();

    assert.equal(response.status, 415);
    assert.equal(body.code, 'IMAGE_TYPE_UNSUPPORTED');
    assert.equal(providerCalls, 0);
});

test('rejects files over 8 MB before the provider handler', async () => {
    const response = await postImage({
        buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1, 0x41),
    });
    const body = await response.json();

    assert.equal(response.status, 413);
    assert.equal(body.code, 'IMAGE_TOO_LARGE');
    assert.equal(providerCalls, 0);
});

test('rejects images below the minimum resolution', async () => {
    const response = await postImage({ buffer: await jpegFixture(199, 300) });
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.code, 'IMAGE_DIMENSIONS_TOO_SMALL');
    assert.equal(providerCalls, 0);
});

test('rejects extreme dimensions before the provider handler', async () => {
    const response = await postImage({ buffer: await jpegFixture(8193, 300) });
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.code, 'IMAGE_DIMENSIONS_TOO_LARGE');
    assert.equal(providerCalls, 0);
});

test('requires the image multipart field', async () => {
    const response = await postImage({});
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.code, 'IMAGE_REQUIRED');
    assert.equal(providerCalls, 0);
});

test('rejects arbitrary URL fields and multiple-file payloads', async () => {
    const urlResponse = await postImage({ addUrlField: true });
    const urlBody = await urlResponse.json();

    assert.equal(urlResponse.status, 400);
    assert.equal(urlBody.code, 'IMAGE_UPLOAD_INVALID');
    assert.equal(providerCalls, 0);

    const valid = await jpegFixture();
    const multipleResponse = await postImage({ buffer: valid, extraFile: valid });
    const multipleBody = await multipleResponse.json();

    assert.equal(multipleResponse.status, 400);
    assert.equal(multipleBody.code, 'IMAGE_FIELD_INVALID');
    assert.equal(providerCalls, 0);
});
