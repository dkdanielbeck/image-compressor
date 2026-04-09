import { encode as encodeAvif, decode as decodeAvif } from '@jsquash/avif';
import { encode as encodeWebp, decode as decodeWebp } from '@jsquash/webp';
import { encode as encodeJpeg, decode as decodeJpeg } from '@jsquash/jpeg';
import resize from '@jsquash/resize';
import { ssim } from 'ssim.js';

export interface CodecConfig {
  avif: { quality: number; speed: number; subsample: number; denoiseLevel: number; sharpness: number; minQuality: number; targetSsim: number };
  webp: { quality: number; method: number; lossless: boolean | number; minQuality: number; targetSsim: number };
  jpeg: { quality: number; trellisMultipass: boolean; minQuality: number; targetSsim: number };
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

const MAX_AREA = 3686400; // 2560 * 1440

async function encodeWithSizeLimit(
  encoder: (q: number) => Promise<ArrayBuffer>,
  startQuality: number,
  minQuality: number,
  targetBytes: number
): Promise<ArrayBuffer> {
  let low = minQuality;
  let high = startQuality;
  
  let bestBufferValid: ArrayBuffer | null = null;
  let bestBufferFallback: ArrayBuffer | null = null;
  let fallbackQ = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const buffer = await encoder(mid);
    const size = buffer.byteLength;
    
    if (size > targetBytes) {
      high = mid - 1;
    } else {
      if (mid > fallbackQ) {
        fallbackQ = mid;
        bestBufferFallback = buffer;
      }
      bestBufferValid = buffer;
      low = mid + 1;
    }
  }

  if (bestBufferValid) return bestBufferValid;
  if (bestBufferFallback) return bestBufferFallback;
  return await encoder(minQuality);
}

async function encodeWithSSIMAndSizeLimit(
  encoder: (q: number) => Promise<ArrayBuffer>,
  decoder: (buffer: ArrayBuffer) => Promise<ImageData | null>,
  originalImageData: ImageData,
  startQuality: number,
  minQuality: number,
  targetSsim: number,
  targetBytes: number
): Promise<ArrayBuffer> {
  let low = minQuality;
  let high = startQuality;
  
  let bestBufferValid: ArrayBuffer | null = null;
  let bestBufferFallback: ArrayBuffer | null = null;
  let fallbackQ = -1;
  let minValidQ = 101; 

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const buffer = await encoder(mid);
    const size = buffer.byteLength;
    
    if (size > targetBytes) {
      high = mid - 1;
    } else {
      if (mid > fallbackQ) {
        fallbackQ = mid;
        bestBufferFallback = buffer;
      }
      
      const decodedImageData = await decoder(buffer);
      if (decodedImageData && decodedImageData.width === originalImageData.width && decodedImageData.height === originalImageData.height) {
        const { mssim } = ssim(originalImageData, decodedImageData, { ssim: 'fast' });
        if (mssim >= targetSsim) {
          if (mid < minValidQ) {
            minValidQ = mid;
            bestBufferValid = buffer;
          }
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      } else {
         low = mid + 1;
      }
    }
  }

  if (bestBufferValid) return bestBufferValid;
  if (bestBufferFallback) return bestBufferFallback;
  return await encoder(minQuality);
}

export async function compressImage(file: File, config: CodecConfig, mode: 'fast' | 'advanced', targetBytes: number): Promise<CompressedPayload> {
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
  const imageArea = imageData.width * imageData.height;
  if (imageArea > MAX_AREA) {
    const mathScale = Math.sqrt(MAX_AREA / imageArea);
    const newWidth = Math.round(imageData.width * mathScale);
    const newHeight = Math.round(imageData.height * mathScale);
    finalImageData = await resize(imageData, { width: newWidth, height: newHeight });
  }

  let avifPromise: Promise<ArrayBuffer>;
  let webpPromise: Promise<ArrayBuffer>;
  let jpegPromise: Promise<ArrayBuffer>;

  if (mode === 'fast') {
    avifPromise = encodeWithSizeLimit(
      (q) => {
        const cqLevel = Math.round(63 * (100 - q) / 100);
        return encodeAvif(finalImageData, { speed: 6, subsample: 2, denoiseLevel: 0, sharpness: 1, cqLevel } as any);
      },
      80, // Start quality bound for binary search
      10, // Min fallback
      targetBytes
    );

    webpPromise = encodeWithSizeLimit(
      (q) => encodeWebp(finalImageData, { method: 6, lossless: 0, quality: q }),
      100, // Max quality bound
      10,
      targetBytes
    );

    jpegPromise = encodeWithSizeLimit(
      (q) => encodeJpeg(finalImageData, { trellis_multipass: true, quality: q }),
      100, // Max quality bound
      10,
      targetBytes
    );
  } else {
    avifPromise = encodeWithSSIMAndSizeLimit(
      (q) => {
        const cqLevel = Math.round(63 * (100 - q) / 100);
        const { quality, minQuality, targetSsim, ...avifOpts } = config.avif;
        return encodeAvif(finalImageData, { ...avifOpts, cqLevel } as any);
      },
      decodeAvif,
      finalImageData,
      config.avif.quality,
      config.avif.minQuality,
      config.avif.targetSsim,
      targetBytes
    );

    webpPromise = encodeWithSSIMAndSizeLimit(
      (q) => encodeWebp(finalImageData, { ...config.webp, quality: q, lossless: config.webp.lossless ? 1 : 0 }),
      decodeWebp,
      finalImageData,
      config.webp.quality,
      config.webp.minQuality,
      config.webp.targetSsim,
      targetBytes
    );

    jpegPromise = encodeWithSSIMAndSizeLimit(
      (q) => encodeJpeg(finalImageData, { ...config.jpeg, quality: q }),
      decodeJpeg,
      finalImageData,
      config.jpeg.quality,
      config.jpeg.minQuality,
      config.jpeg.targetSsim,
      targetBytes
    );
  }

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
