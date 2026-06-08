import { v2 as cloudinary } from 'cloudinary';
import env from '../config/env.js';
import logger from './logger.js';

cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a base64 data URI to Cloudinary and return its HTTPS URL.
 */
export const uploadToCloudinary = async (dataUri) => {
    try {
        const result = await cloudinary.uploader.upload(dataUri, {
            resource_type: 'image',
            folder: 'tej_ai_scans',
        });

        if (!result.secure_url) {
            throw new Error('Cloudinary did not return a secure URL');
        }

        logger.info('Image uploaded to Cloudinary', {
            publicId: result.public_id,
            bytes: result.bytes,
        });

        return result.secure_url;
    } catch (error) {
        logger.error('Cloudinary base64 upload failed', {
            message: error.message,
        });

        const uploadError = new Error('Failed to upload scan image to Cloudinary');
        uploadError.publicMessage = 'Image upload failed';
        uploadError.statusCode = 502;
        throw uploadError;
    }
};

export default uploadToCloudinary;
