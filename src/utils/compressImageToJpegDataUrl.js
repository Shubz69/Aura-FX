/** Keep data URLs small so checklist JSON fits in localStorage. */
export const CHECKLIST_IMAGE_MAX_FILE_BYTES = 12 * 1024 * 1024;

export const COMPRESS_PRESETS = {
  /** Checklist example images (localStorage). */
  checklist: {
    maxFileBytes: CHECKLIST_IMAGE_MAX_FILE_BYTES,
    maxEdge: 1280,
    targetMaxDataUrlLen: 380_000,
  },
  /** Trade journal / API screenshot verification (JSON POST). */
  tradeVerify: {
    maxFileBytes: CHECKLIST_IMAGE_MAX_FILE_BYTES,
    maxEdge: 1680,
    targetMaxDataUrlLen: 1_400_000,
  },
};

/**
 * Resize and encode as JPEG for upload or storage.
 * @param {File} file
 * @param {{ maxFileBytes?: number, maxEdge?: number, targetMaxDataUrlLen?: number }} [opts]
 * @returns {Promise<string>} JPEG data URL
 */
export async function compressImageToJpegDataUrl(file, opts = {}) {
  const maxFileBytes = opts.maxFileBytes ?? CHECKLIST_IMAGE_MAX_FILE_BYTES;
  const maxEdge = opts.maxEdge ?? 1280;
  const targetMaxDataUrlLen = opts.targetMaxDataUrlLen ?? 380_000;

  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Please use an image file (JPEG, PNG, WebP, or GIF).');
  }
  if (file.size > maxFileBytes) {
    throw new Error('That file is too large. Try an image under 12 MB.');
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images here.');

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = null;
  }

  if (bitmap) {
    try {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height, 1));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(bitmap, 0, 0, w, h);
    } finally {
      bitmap.close();
    }
  } else {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Could not read this image. Try JPEG or PNG from your device.'));
        el.src = url;
      });
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      const scale = Math.min(1, maxEdge / Math.max(nw, nh, 1));
      const w = Math.max(1, Math.round(nw * scale));
      const h = Math.max(1, Math.round(nh * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  let quality = 0.82;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  let guard = 0;
  while (dataUrl.length > targetMaxDataUrlLen && quality > 0.42 && guard < 16) {
    quality -= 0.06;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    guard += 1;
  }
  if (dataUrl.length > targetMaxDataUrlLen * 1.25) {
    throw new Error('Image is still too large after compression. Try a smaller screenshot.');
  }
  return dataUrl;
}
