import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { unlink } from 'fs/promises';
import sharp from 'sharp';
import env from '../config/env.js';
import logger from '../utils/logger.js';

const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`;
const MIN_FACE_SIZE = 400; // Minimum 400x400px for AILabTools

const safeUnlink = async (filePath) => {
    try {
        await unlink(filePath);
    } catch {
        // File may already be removed; ignore cleanup failures.
    }
};

/**
 * Upload image to Cloudinary and return URL
 */
export const uploadToCloudinary = async (filePath, fileName) => {
    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));
        form.append('upload_preset', 'tej_ai_scan'); // Must be pre-configured in Cloudinary
        form.append('folder', 'tej_ai_scans');
        form.append('resource_type', 'auto');

        const response = await axios.post(CLOUDINARY_UPLOAD_URL, form, {
            headers: form.getHeaders(),
            timeout: 30000,
        });

        const publicUrl = response.data.secure_url;
        const publicId = response.data.public_id;

        logger.info('Image uploaded to Cloudinary', { publicId, size: response.data.bytes });

        // Clean up local file
        await safeUnlink(filePath);

        return { url: publicUrl, publicId };
    } catch (error) {
        logger.error('Cloudinary upload error', {
            message: error.message,
            status: error.response?.status,
        });

        // Clean up local file on error
        await safeUnlink(filePath);

        throw new Error(`Image upload failed: ${error.message}`);
    }
};

/**
 * Validate image dimensions (face must be at least 400x400px)
 * This is a simplified validation; in production, use sharp or similar
 */
export const validateImageDimensions = async (filePath) => {
    try {
        const metadata = await sharp(filePath).metadata();
        const width = metadata.width || 0;
        const height = metadata.height || 0;

        if (width < MIN_FACE_SIZE || height < MIN_FACE_SIZE) {
            throw new Error(
                `Image is too small for analysis. Minimum required dimensions are ${MIN_FACE_SIZE}x${MIN_FACE_SIZE}px.`
            );
        }

        return true;
    } catch (error) {
        logger.error('Image validation error', { message: error.message });
        throw error;
    }
};

export default {
    uploadToCloudinary,
    validateImageDimensions,
};
