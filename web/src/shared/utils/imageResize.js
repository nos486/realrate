/**
 * imageResize.js — Client-side image resizing, downscaling, and EXIF orientation normalization
 *
 * Features:
 * - Pure dimension calculation helper without upscaling
 * - EXIF orientation normalization via createImageBitmap(..., { imageOrientation: 'from-image' }) with <img> fallback
 * - Strips EXIF metadata & GPS location tags automatically via canvas export
 * - Progressive compression if output exceeds 1.5 MB limit
 * - Clear Persian error handling for unsupported formats (e.g. HEIC on unsupported browsers)
 */

const MAX_TARGET_BYTES = 1.5 * 1024 * 1024; // 1.5 MB

/**
 * Calculates target dimensions preserving aspect ratio without upscaling.
 * Pure function, testable in any environment.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} [maxSide=1600]
 * @returns {{ width: number, height: number }}
 */
export function calculateTargetDimensions(width, height, maxSide = 1600) {
  if (!width || !height || width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }
  if (!maxSide || maxSide <= 0 || (width <= maxSide && height <= maxSide)) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  const ratio = width / height;
  if (width >= height) {
    const targetWidth = maxSide;
    const targetHeight = Math.max(1, Math.round(maxSide / ratio));
    return { width: targetWidth, height: targetHeight };
  } else {
    const targetHeight = maxSide;
    const targetWidth = Math.max(1, Math.round(maxSide * ratio));
    return { width: targetWidth, height: targetHeight };
  }
}

/**
 * Canvas to Blob helper wrapped in a Promise
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} type
 * @param {number} quality
 * @returns {Promise<Blob>}
 */
function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('تبدیل تصویر با شکست مواجه شد.'));
      },
      type,
      quality
    );
  });
}

/**
 * Resizes an image File/Blob, corrects EXIF orientation, and compresses output.
 *
 * @param {File|Blob} file
 * @param {object} [options]
 * @param {number} [options.maxSide=1600]
 * @param {number} [options.quality=0.8]
 * @param {string} [options.type='image/jpeg']
 * @returns {Promise<{ blob: Blob, width: number, height: number, originalBytes: number, bytes: number }>}
 */
export async function resizeImage(file, options = {}) {
  const { maxSide = 1600, quality = 0.8, type = 'image/jpeg' } = options;
  const originalBytes = file.size || 0;

  // Detect HEIC/HEIF files
  const fileName = (file.name || '').toLowerCase();
  const fileType = (file.type || '').toLowerCase();
  const isHeic = fileType.includes('heic') || fileType.includes('heif') || fileName.endsWith('.heic') || fileName.endsWith('.heif');

  let imageSource = null;
  let isBitmap = false;

  try {
    // 1. Try createImageBitmap with automatic EXIF orientation handling
    if (typeof createImageBitmap === 'function') {
      try {
        imageSource = await createImageBitmap(file, { imageOrientation: 'from-image' });
        isBitmap = true;
      } catch (err) {
        // Fall back to Image element if createImageBitmap options are unsupported
        imageSource = null;
      }
    }

    // 2. Fallback to HTMLImageElement
    if (!imageSource) {
      imageSource = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          if (isHeic) {
            reject(new Error('این فرمت پشتیبانی نمی‌شود؛ عکس را JPEG یا PNG بگیرید.'));
          } else {
            reject(new Error('بارگذاری و خواندن تصویر ناموفق بود.'));
          }
        };
        img.src = url;
      });
    }

    const naturalWidth = isBitmap ? imageSource.width : (imageSource.naturalWidth || imageSource.width);
    const naturalHeight = isBitmap ? imageSource.height : (imageSource.naturalHeight || imageSource.height);

    const { width: targetWidth, height: targetHeight } = calculateTargetDimensions(
      naturalWidth,
      naturalHeight,
      maxSide
    );

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('خطا در دسترسی به محیط گرافیکی مرورگر');
    }

    // Optional fill for transparent PNG to JPEG
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    ctx.drawImage(imageSource, 0, 0, targetWidth, targetHeight);

    // Initial compression
    let currentQuality = quality;
    let blob = await canvasToBlob(canvas, type, currentQuality);

    // If still larger than 1.5MB, progressively degrade quality
    if (blob.size > MAX_TARGET_BYTES && currentQuality > 0.6) {
      currentQuality = 0.6;
      blob = await canvasToBlob(canvas, type, currentQuality);
    }
    if (blob.size > MAX_TARGET_BYTES && currentQuality > 0.4) {
      currentQuality = 0.4;
      blob = await canvasToBlob(canvas, type, currentQuality);
    }

    return {
      blob,
      width: targetWidth,
      height: targetHeight,
      originalBytes,
      bytes: blob.size,
    };
  } catch (err) {
    if (isHeic && !err.message.includes('پشتیبانی نمی‌شود')) {
      throw new Error('این فرمت پشتیبانی نمی‌شود؛ عکس را JPEG یا PNG بگیرید.');
    }
    throw err;
  } finally {
    if (isBitmap && imageSource && typeof imageSource.close === 'function') {
      imageSource.close();
    }
  }
}
