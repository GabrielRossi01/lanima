/** Square avatar rendering and encoding, on the device (section 7.1: crop, 512 px, private bucket). */

export const AVATAR_SIZE = 512;
const QUALITY = 0.82;

export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Normalizes a crop from the cropper (in natural image pixels) to a square inside the image.
 * Rounding and pinch-zoom can leave it a pixel off or slightly outside.
 */
export function squareCropWithin(crop: PixelCrop, imageWidth: number, imageHeight: number): PixelCrop {
  const side = Math.max(1, Math.min(Math.round(Math.min(crop.width, crop.height)), imageWidth, imageHeight));
  const x = Math.min(Math.max(0, Math.round(crop.x)), imageWidth - side);
  const y = Math.min(Math.max(0, Math.round(crop.y)), imageHeight - side);
  return { x, y, width: side, height: side };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/**
 * WebP when the browser can encode it; otherwise JPEG. Safari may silently return PNG for an
 * unsupported type, so the result type is checked, not assumed.
 */
export async function encodeAvatar(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await canvasToBlob(canvas, "image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await canvasToBlob(canvas, "image/jpeg");
  if (jpeg && jpeg.type === "image/jpeg") return jpeg;
  throw new Error("Não foi possível processar a foto neste aparelho.");
}

export function avatarExtension(blob: Blob): "webp" | "jpg" {
  return blob.type === "image/webp" ? "webp" : "jpg";
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível abrir a foto."));
    img.src = src;
  });
}

/** Crops `src` to the square and scales it to 512 × 512, ready for upload. */
export async function renderAvatar(src: string, crop: PixelCrop): Promise<Blob> {
  const img = await loadImage(src);
  const area = squareCropWithin(crop, img.naturalWidth, img.naturalHeight);
  const size = Math.min(AVATAR_SIZE, area.width);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a foto neste aparelho.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size);
  return encodeAvatar(canvas);
}

/**
 * Shrinks a camera photo (often 12 MP+) before showing it in the cropper, so pinch-zoom stays
 * smooth on tablets. Runs on the main thread: the library's worker mode loads its code from a CDN,
 * which would fail offline.
 */
export async function prepareForCrop(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha uma imagem (JPG, PNG ou WebP).");
  const { default: imageCompression } = await import("browser-image-compression");
  const small = await imageCompression(file, { maxWidthOrHeight: 1600, useWebWorker: false, initialQuality: 0.9 });
  return URL.createObjectURL(small);
}
