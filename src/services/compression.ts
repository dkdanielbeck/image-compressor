import { encode as encodeAvif } from '@jsquash/avif';
import { encode as encodeWebp } from '@jsquash/webp';
import { encode as encodeJpeg } from '@jsquash/jpeg';
import resize from '@jsquash/resize';

export interface CodecConfig {
  avif: { quality: number; speed: number; subsample: number; denoiseLevel: number; sharpness: number };
  webp: { quality: number; method: number; lossless: boolean | number };
  jpeg: { quality: number; trellisMultipass: boolean };
}

export interface CompressedPayload {
  filename: string;
  avif: ArrayBuffer;
  webp: ArrayBuffer;
  jpg: ArrayBuffer;
  sizes: {
    avif: number;
    webp: number;
    jpg: number;
  };
}

const MAX_BYTES = 358400; // 350 KB
const MIN_QUALITY = 75;

async function encodeWithSizeLimit(
  encoder: (q: number) => Promise<ArrayBuffer>,
  startQuality: number
): Promise<ArrayBuffer> {
  let currentQuality = startQuality;
  let buffer = await encoder(currentQuality);
  
  while (buffer.byteLength > MAX_BYTES && currentQuality > MIN_QUALITY) {
    currentQuality -= 2;
    if (currentQuality < MIN_QUALITY) currentQuality = MIN_QUALITY;
    buffer = await encoder(currentQuality);
  }
  return buffer;
}

export async function compressImage(file: File, config: CodecConfig): Promise<CompressedPayload> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = url;
  });

  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  let imageData: ImageData;

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(image.width, image.height);
    ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    if (!ctx) throw new Error("Could not get OffscreenCanvas 2d context");
    ctx.drawImage(image, 0, 0);
    imageData = ctx.getImageData(0, 0, image.width, image.height);
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    if (!ctx) throw new Error("Could not get HTMLCanvasElement 2d context");
    ctx.drawImage(image, 0, 0);
    imageData = ctx.getImageData(0, 0, image.width, image.height);
  }

  URL.revokeObjectURL(url);

  let finalImageData = imageData;
  if (imageData.width > 2560) {
    const scale = 2560 / imageData.width;
    const newHeight = Math.round(imageData.height * scale);
    finalImageData = await resize(imageData, { width: 2560, height: newHeight });
  }

  const avifPromise = encodeWithSizeLimit(
    (q) => {
      const cqLevel = Math.round(63 * (100 - q) / 100);
      const { quality, ...avifOpts } = config.avif;
      return encodeAvif(finalImageData, { ...avifOpts, cqLevel } as any);
    },
    config.avif.quality
  );

  const webpPromise = encodeWithSizeLimit(
    (q) => encodeWebp(finalImageData, { ...config.webp, quality: q, lossless: config.webp.lossless ? 1 : 0 }),
    config.webp.quality
  );

  const jpegPromise = encodeWithSizeLimit(
    (q) => encodeJpeg(finalImageData, { ...config.jpeg, quality: q }),
    config.jpeg.quality
  );

  const [avif, webp, jpg] = await Promise.all([avifPromise, webpPromise, jpegPromise]);

  const rawFilename = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
  const compressedFilename = `${rawFilename}-compressed`;

  return {
    filename: compressedFilename,
    avif,
    webp,
    jpg,
    sizes: {
      avif: avif.byteLength,
      webp: webp.byteLength,
      jpg: jpg.byteLength,
    }
  };
}
