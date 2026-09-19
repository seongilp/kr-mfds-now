/**
 * 식약처 이미지 서버(nedrug 등)는 Content-Type 없이 `X-Content-Type-Options: nosniff` 로 응답해서
 * 브라우저가 <img> 로 그리지 않는다. 허용 호스트만 서버에서 받아 타입을 붙여 다시 내보낸다.
 */

const ALLOWED_HOST = /(^|\.)(mfds\.go\.kr|foodsafetykorea\.go\.kr)$/i;

export function isProxiableImage(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (u.protocol === 'https:' || u.protocol === 'http:') && ALLOWED_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

export function proxiedImageUrl(raw: string): string {
  return isProxiableImage(raw) ? `/api/img?u=${encodeURIComponent(raw)}` : raw;
}

/** 매직 바이트로 이미지 타입 판정. 이미지가 아니면 undefined */
export function sniffImageType(bytes: Uint8Array): string | undefined {
  const hex = Buffer.from(bytes.subarray(0, 12)).toString('hex');
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('89504e47')) return 'image/png';
  if (hex.startsWith('47494638')) return 'image/gif';
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image/webp';
  if (hex.startsWith('424d')) return 'image/bmp';
  return undefined;
}
