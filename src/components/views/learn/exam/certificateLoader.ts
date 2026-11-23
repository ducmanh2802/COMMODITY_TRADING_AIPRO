/** Lazy browser loader: pulls the PDF module and the Vietnamese TTF assets only when a certificate is requested. */
import type { CertificateData } from './certificatePdf';

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function fetchFont(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font ${res.status}`);
  return toBase64(await res.arrayBuffer());
}

export async function downloadCertificate(data: CertificateData, fileName: string): Promise<void> {
  const [{ buildCertificatePdf }, regular, bold] = await Promise.all([
    import('./certificatePdf'),
    import('./fonts/BeVietnamPro_400Regular.ttf?url'),
    import('./fonts/BeVietnamPro_600SemiBold.ttf?url'),
  ]);
  const [regularBase64, boldBase64] = await Promise.all([fetchFont(regular.default), fetchFont(bold.default)]);
  const blob = await buildCertificatePdf(data, { regularBase64, boldBase64 });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
