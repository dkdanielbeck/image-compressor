import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { CompressedPayload } from './compression';

export async function archiveImages(payloads: CompressedPayload[]) {
  const zip = new JSZip();

  for (const item of payloads) {
    zip.file(`${item.filename}.avif`, item.avif);
    zip.file(`${item.filename}.webp`, item.webp);
    zip.file(`${item.filename}.jpg`, item.jpg);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, "optimized_assets.zip");
}
