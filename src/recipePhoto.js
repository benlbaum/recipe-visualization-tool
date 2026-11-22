const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_PHOTO_BYTES = 180 * 1024;
const FORMATS = /^data:image\/(jpeg|png|webp);base64,/;
const formatError = 'Choose a JPEG, PNG or WebP photo.';

function rasterType(header) {
  if (header.startsWith('\xff\xd8\xff')) return 'image/jpeg';
  if (header.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png';
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function isRecipePhoto(value) {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(MAX_PHOTO_BYTES / 3) + 32) return false;
  const prefix = value.match(FORMATS);
  if (!prefix) return false;
  const payload = value.slice(prefix[0].length);
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const bytes = payload.length * 3 / 4 - padding;
  if (bytes < 16 || bytes > MAX_PHOTO_BYTES || payload.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
    return false;
  }
  const header = atob(payload.slice(0, 32));
  if (rasterType(header) !== `image/${prefix[1]}`) return false;
  if (prefix[1] === 'webp') {
    // RIFF stores the file length, excluding its initial eight bytes.
    const length = new DataView(Uint8Array.from(header.slice(4, 8), c => c.charCodeAt(0)).buffer);
    return length.getUint32(0, true) + 8 === bytes && ['VP8 ', 'VP8L', 'VP8X'].includes(header.slice(12, 16));
  }
  const tail = atob(payload.slice(-16));
  return prefix[1] === 'jpeg'
    ? tail.endsWith('\xff\xd9')
    : header.slice(12, 16) === 'IHDR' && tail.endsWith('IEND\xaeB`\x82');
}

export async function prepareRecipePhoto(file) {
  if (!(file instanceof Blob) || !file.size) throw new Error(formatError);
  if (file.size > MAX_INPUT_BYTES) throw new Error('Choose a photo of 12 MB or less.');
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const type = rasterType(String.fromCharCode(...header));
  if (!type || (file.type && file.type !== type)) throw new Error(formatError);

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error('The photo could not be opened. Choose another image.');
    }
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not resize the photo.');
    for (const [longSide, quality] of [[1000, 0.8], [800, 0.72], [600, 0.65], [400, 0.6]]) {
      const scale = Math.min(1, longSide / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
      if (!blob || !blob.size || blob.size > MAX_PHOTO_BYTES) continue;
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('The resized photo could not be read.'));
        reader.readAsDataURL(blob);
      });
      if (isRecipePhoto(dataUrl)) return dataUrl;
    }
    throw new Error('The photo is too large to save. Choose a smaller image.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
