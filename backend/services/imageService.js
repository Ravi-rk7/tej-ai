import sharp from 'sharp';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MIN_IMAGE_DIMENSION = 200;
export const MAX_PROVIDER_DIMENSION = 4096;
export const RECOMMENDED_FACE_DIMENSION = 400;

// Bound decompression work independently from the compressed upload size.
const MAX_INPUT_DIMENSION = 8192;
const MAX_INPUT_PIXELS = 40_000_000;

const imageError = (message, statusCode, publicCode) => {
    const error = new Error(message);
    error.publicMessage = message;
    error.statusCode = statusCode;
    error.publicCode = publicCode;
    return error;
};

const hasJpegSignature = (buffer) => (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
);

const createPipeline = (buffer) => sharp(buffer, {
    failOn: 'error',
    limitInputPixels: MAX_INPUT_PIXELS,
    sequentialRead: true,
});

const encodeNormalizedJpeg = async (buffer, quality) => createPipeline(buffer)
    .rotate()
    .resize({
        width: MAX_PROVIDER_DIMENSION,
        height: MAX_PROVIDER_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
    })
    .jpeg({
        quality,
        chromaSubsampling: '4:2:0',
        progressive: false,
    })
    // Sharp strips EXIF, ICC, XMP, and other metadata unless withMetadata is used.
    .toBuffer();

/**
 * Validate an untrusted in-memory upload and return a provider-safe JPEG.
 */
export const processScanImage = async (inputBuffer) => {
    if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
        throw imageError('A JPG image is required', 400, 'IMAGE_REQUIRED');
    }

    if (inputBuffer.length > MAX_IMAGE_BYTES) {
        throw imageError('Image must be 8 MB or smaller', 413, 'IMAGE_TOO_LARGE');
    }

    if (!hasJpegSignature(inputBuffer)) {
        throw imageError('Only valid JPG or JPEG images are accepted', 415, 'IMAGE_TYPE_UNSUPPORTED');
    }

    let outputBuffer;

    try {
        const metadata = await createPipeline(inputBuffer).metadata();
        const width = metadata.width || 0;
        const height = metadata.height || 0;

        if (metadata.format !== 'jpeg' || width === 0 || height === 0) {
            throw imageError('The uploaded JPG could not be read', 415, 'IMAGE_CONTENT_INVALID');
        }

        if (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION) {
            throw imageError(
                `Image dimensions must be at least ${MIN_IMAGE_DIMENSION}x${MIN_IMAGE_DIMENSION}px`,
                422,
                'IMAGE_DIMENSIONS_TOO_SMALL'
            );
        }

        if (width > MAX_INPUT_DIMENSION || height > MAX_INPUT_DIMENSION) {
            throw imageError(
                `Image dimensions must not exceed ${MAX_INPUT_DIMENSION}px before resizing`,
                422,
                'IMAGE_DIMENSIONS_TOO_LARGE'
            );
        }

        outputBuffer = await encodeNormalizedJpeg(inputBuffer, 88);

        // A noisy image can grow during normalization. Re-encode once at a lower
        // quality before rejecting it at the same provider byte boundary.
        if (outputBuffer.length > MAX_IMAGE_BYTES) {
            clearImageBuffer(outputBuffer);
            outputBuffer = await encodeNormalizedJpeg(inputBuffer, 76);
        }

        if (outputBuffer.length > MAX_IMAGE_BYTES) {
            clearImageBuffer(outputBuffer);
            outputBuffer = undefined;
            throw imageError('Processed image exceeds the 8 MB limit', 413, 'IMAGE_TOO_LARGE');
        }

        const outputMetadata = await sharp(outputBuffer, {
            failOn: 'error',
            limitInputPixels: MAX_INPUT_PIXELS,
        }).metadata();

        const outputWidth = outputMetadata.width || 0;
        const outputHeight = outputMetadata.height || 0;

        if (
            outputMetadata.format !== 'jpeg'
            || outputWidth < MIN_IMAGE_DIMENSION
            || outputHeight < MIN_IMAGE_DIMENSION
            || outputWidth > MAX_PROVIDER_DIMENSION
            || outputHeight > MAX_PROVIDER_DIMENSION
        ) {
            clearImageBuffer(outputBuffer);
            outputBuffer = undefined;
            throw imageError('Image could not be normalized safely', 422, 'IMAGE_NORMALIZATION_FAILED');
        }

        return {
            buffer: outputBuffer,
            width: outputWidth,
            height: outputHeight,
            bytes: outputBuffer.length,
            meetsRecommendedFaceCanvas: (
                outputWidth >= RECOMMENDED_FACE_DIMENSION
                && outputHeight >= RECOMMENDED_FACE_DIMENSION
            ),
        };
    } catch (error) {
        clearImageBuffer(outputBuffer);

        if (error.publicCode) {
            throw error;
        }

        if (/pixel limit|exceeds.*limit/i.test(error.message)) {
            throw imageError('Image resolution is too large to process safely', 422, 'IMAGE_DIMENSIONS_TOO_LARGE');
        }

        throw imageError('The uploaded JPG is corrupted or malformed', 415, 'IMAGE_CONTENT_INVALID');
    }
};

export const clearImageBuffer = (buffer) => {
    if (Buffer.isBuffer(buffer)) {
        buffer.fill(0);
    }
};

export default { processScanImage, clearImageBuffer };
