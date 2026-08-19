import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import env from '../config/env.js';
import { clearImageBuffer, processScanImage } from '../services/imageService.js';
import { runSkinAnalysis } from '../services/skinAnalysisService.js';

const MINIMUM_IMAGES = 15;
const inputDirectory = process.argv[2];

if (!inputDirectory) {
    console.error('Usage: npm run test:provider -- <consented-jpeg-directory>');
    process.exitCode = 1;
} else if (!env.AILAB_API_KEY) {
    console.error('AILABTOOLS_API_KEY is required for the provider verification gate.');
    process.exitCode = 1;
} else {
    const resolvedDirectory = path.resolve(inputDirectory);
    const entries = await readdir(resolvedDirectory, { withFileTypes: true });
    const imagePaths = entries
        .filter((entry) => entry.isFile() && /\.jpe?g$/i.test(entry.name))
        .map((entry) => path.join(resolvedDirectory, entry.name))
        .sort();

    if (imagePaths.length < MINIMUM_IMAGES) {
        console.error(`Provider verification requires at least ${MINIMUM_IMAGES} consented JPG images.`);
        process.exitCode = 1;
    } else {
        const summary = {
            attempted: imagePaths.length,
            succeeded: 0,
            meaningfulQualityErrors: 0,
            failed: 0,
            errorCategories: {},
        };

        for (const [index, imagePath] of imagePaths.entries()) {
            let sourceBuffer;
            let processedBuffer;

            try {
                sourceBuffer = await readFile(imagePath);
                const processed = await processScanImage(sourceBuffer);
                processedBuffer = processed.buffer;
                await runSkinAnalysis(processedBuffer);
                summary.succeeded += 1;
                console.log(`Scan ${index + 1}: success`);
            } catch (error) {
                const category = error.category || error.publicCode || 'local_validation';
                summary.errorCategories[category] = (summary.errorCategories[category] || 0) + 1;

                if (error.publicCode === 'SCAN_IMAGE_QUALITY') {
                    summary.meaningfulQualityErrors += 1;
                    console.log(`Scan ${index + 1}: meaningful quality error`);
                } else {
                    summary.failed += 1;
                    console.error(`Scan ${index + 1}: failed (${category})`);
                }
            } finally {
                clearImageBuffer(processedBuffer);
                clearImageBuffer(sourceBuffer);
            }
        }

        console.log(JSON.stringify(summary, null, 2));
        if (summary.failed > 0) process.exitCode = 1;
    }
}
