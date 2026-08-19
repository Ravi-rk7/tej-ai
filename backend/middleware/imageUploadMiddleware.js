import multer from 'multer';
import { asyncHandler } from '../utils/responseFormatter.js';
import {
    MAX_IMAGE_BYTES,
    clearImageBuffer,
    processScanImage,
} from '../services/imageService.js';

const uploadError = (message, statusCode, publicCode) => {
    const error = new Error(message);
    error.publicMessage = message;
    error.statusCode = statusCode;
    error.publicCode = publicCode;
    return error;
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_IMAGE_BYTES,
        files: 1,
        fields: 0,
        // Busboy emits the parts limit after the allowed part is consumed, so
        // two permits exactly one file while still rejecting any second part.
        parts: 2,
        headerPairs: 50,
    },
    fileFilter: (_req, file, callback) => {
        if (file.mimetype !== 'image/jpeg') {
            callback(uploadError(
                'Only JPG or JPEG images are accepted',
                415,
                'IMAGE_TYPE_UNSUPPORTED'
            ));
            return;
        }

        callback(null, true);
    },
});

const normalizeMulterError = (error) => {
    if (!(error instanceof multer.MulterError)) {
        return error;
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
        return uploadError('Image must be 8 MB or smaller', 413, 'IMAGE_TOO_LARGE');
    }

    if (
        error.code === 'LIMIT_UNEXPECTED_FILE'
        || error.code === 'LIMIT_FILE_COUNT'
        || error.code === 'LIMIT_PART_COUNT'
    ) {
        return uploadError('Upload exactly one image using the image field', 400, 'IMAGE_FIELD_INVALID');
    }

    return uploadError('Invalid multipart image upload', 400, 'IMAGE_UPLOAD_INVALID');
};

export const uploadScanImage = (req, res, next) => {
    upload.single('image')(req, res, (error) => {
        if (error) {
            next(normalizeMulterError(error));
            return;
        }

        if (!req.file) {
            next(uploadError('A JPG image is required', 400, 'IMAGE_REQUIRED'));
            return;
        }

        next();
    });
};

export const releaseScanImage = (req) => {
    clearImageBuffer(req.scanImage?.buffer);
    req.scanImage = undefined;
};

export const prepareScanImage = asyncHandler(async (req, res, next) => {
    try {
        req.scanImage = await processScanImage(req.file?.buffer);

        const release = () => releaseScanImage(req);
        res.once('finish', release);
        res.once('close', release);

        next();
    } finally {
        clearImageBuffer(req.file?.buffer);
        req.file = undefined;
    }
});

export default { uploadScanImage, prepareScanImage, releaseScanImage };
