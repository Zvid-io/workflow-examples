import { writeFileSync, renameSync } from 'node:fs';

export function checkMediaBytes(bytes, format, contentLength = null) {
  if (contentLength !== null && /^\d+$/.test(String(contentLength)) && bytes.length !== Number(contentLength)) throw new Error('Downloaded length does not match the response. Retry the existing job download.');
  const valid = format === 'mp4' ? bytes.length > 12 && bytes.subarray(4, 8).toString() === 'ftyp'
    : format === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : format === 'webp' ? bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
        : ['jpg', 'jpeg'].includes(format) && bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!valid) throw new Error(`Download is not ${format} media. Retry the existing job download.`);
}

export async function saveMedia(url, file, format, request = fetch) {
  const response = await request(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}). Use --resume for the existing job.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  checkMediaBytes(bytes, format, response.headers.get('content-length'));
  writeFileSync(`${file}.part`, bytes);
  renameSync(`${file}.part`, file);
}
