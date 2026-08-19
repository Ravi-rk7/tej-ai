export const MAX_SCAN_FILE_BYTES = 8 * 1024 * 1024;
export const MIN_SCAN_DIMENSION = 200;
export const MAX_SCAN_INPUT_DIMENSION = 8192;
export const RECOMMENDED_FACE_DIMENSION = 400;

export const validateScanFile = (file) => {
  if (!file) {
    return "Choose a JPG or JPEG photo to continue.";
  }

  if (file.type !== "image/jpeg") {
    return "Only JPG or JPEG photos are supported.";
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "This JPG is empty or could not be read.";
  }

  if (file.size > MAX_SCAN_FILE_BYTES) {
    return "Your photo must be 8 MB or smaller.";
  }

  return null;
};

export const inspectScanDimensions = async (
  file,
  decodeImage = globalThis.createImageBitmap,
) => {
  if (typeof decodeImage !== "function") {
    return { width: null, height: null, meetsRecommendation: null };
  }

  let bitmap;

  try {
    bitmap = await decodeImage(file);
    const width = bitmap.width || 0;
    const height = bitmap.height || 0;

    if (width < MIN_SCAN_DIMENSION || height < MIN_SCAN_DIMENSION) {
      throw new Error(
        `Photo dimensions must be at least ${MIN_SCAN_DIMENSION}x${MIN_SCAN_DIMENSION}px.`,
      );
    }

    if (width > MAX_SCAN_INPUT_DIMENSION || height > MAX_SCAN_INPUT_DIMENSION) {
      throw new Error(
        `Photo dimensions must not exceed ${MAX_SCAN_INPUT_DIMENSION}px.`,
      );
    }

    return {
      width,
      height,
      meetsRecommendation:
        width >= RECOMMENDED_FACE_DIMENSION &&
        height >= RECOMMENDED_FACE_DIMENSION,
    };
  } catch (error) {
    if (error?.message?.startsWith("Photo dimensions")) {
      throw error;
    }

    throw new Error("This JPG is corrupted or could not be decoded.");
  } finally {
    bitmap?.close?.();
  }
};
