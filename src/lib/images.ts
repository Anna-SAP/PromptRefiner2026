import { LIMITS, type ImageMediaType, isImageMediaType } from '../../shared/protocol';
import type { AttachedImage } from '../types';

/** Files at or under this size are sent untouched; it leaves headroom below the API's 5 MB cap. */
const PASSTHROUGH_MAX_BYTES = 3.5 * 1024 * 1024;

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(blob);
  });
}

async function decode(blob: Blob): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    // Some formats (SVG in particular) only decode through an <img> element.
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }
}

function render(image: DecodedImage, scale: number, background?: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available in this browser.');
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function encode(canvas: HTMLCanvasElement, type: ImageMediaType, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Makes an image safe and cheap to send to Claude.
 *
 * Small images in a supported format pass through byte-for-byte. Anything
 * larger than 2000 px, heavier than ~3.5 MB, or in a format Claude does not
 * read (BMP, SVG, AVIF…) is redrawn: PNG when that stays small, which keeps
 * screenshot text crisp, otherwise JPEG. This keeps uploads fast and keeps the
 * request inside the API's per-image limit.
 */
export async function prepareImage(file: Blob): Promise<AttachedImage> {
  let decoded: DecodedImage;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error('This image could not be read. Try a JPEG, PNG, GIF, or WebP file.');
  }

  try {
    const longestEdge = Math.max(decoded.width, decoded.height);
    if (longestEdge === 0) {
      throw new Error('This image has no pixel dimensions and cannot be used.');
    }

    const id = crypto.randomUUID();
    const alreadyFits = longestEdge <= LIMITS.maxImageEdge && file.size <= PASSTHROUGH_MAX_BYTES;
    if (alreadyFits && isImageMediaType(file.type)) {
      return { id, dataUrl: await readAsDataUrl(file), mediaType: file.type };
    }

    const scale = Math.min(1, LIMITS.maxImageEdge / longestEdge);
    let mediaType: ImageMediaType = 'image/png';
    let blob = file.type === 'image/jpeg' ? null : await encode(render(decoded, scale), mediaType);
    if (!blob || blob.size > PASSTHROUGH_MAX_BYTES) {
      mediaType = 'image/jpeg';
      blob = await encode(render(decoded, scale, '#ffffff'), mediaType, 0.9);
    }
    if (!blob || blob.size > LIMITS.maxImageBytes) {
      throw new Error('This image is too large to send, even after resizing.');
    }
    return { id, dataUrl: await readAsDataUrl(blob), mediaType };
  } finally {
    decoded.release();
  }
}

/** Strips the `data:<type>;base64,` prefix, leaving the payload the API expects. */
export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
