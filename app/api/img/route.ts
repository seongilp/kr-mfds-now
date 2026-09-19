import { isProxiableImage, sniffImageType } from '@/lib/image-proxy';

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('u') ?? '';
  if (!isProxiableImage(raw)) return new Response('허용되지 않은 이미지 주소입니다.', { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetch(raw, { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    console.error('[img] fetch failed', raw, err);
    return new Response('이미지를 가져오지 못했습니다.', { status: 502 });
  }
  if (!upstream.ok) return new Response(null, { status: upstream.status === 404 ? 404 : 502 });

  const bytes = new Uint8Array(await upstream.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) return new Response('이미지가 너무 큽니다.', { status: 413 });
  const type = sniffImageType(bytes);
  if (!type) return new Response('이미지가 아닙니다.', { status: 415 });

  return new Response(bytes, {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
    },
  });
}
