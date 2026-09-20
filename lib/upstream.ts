import 'server-only';

import type { Dataset, Op } from '@/lib/catalog-types';
import { parseDataGoKr, parseFsk, type ParseResult } from '@/lib/parse';

export type { Row } from '@/lib/parse';

export type QueryResult =
  | ParseResult
  | { ok: false; reason: 'no-key' | 'network'; message: string };

export interface QueryInput {
  dataset: Dataset;
  op: Op;
  params: Record<string, string>;
  page: number;
  size: number;
}

const REVALIDATE_SECONDS = 3600;
// 식품안전나라는 서비스당 하루 2,000회 · 시간당 100회 제한이 있어 더 오래 캐시한다
const FSK_REVALIDATE_SECONDS = 21_600;
const TIMEOUT_MS = 15_000;
const FSK_BASE = 'http://openapi.foodsafetykorea.go.kr/api';

export async function query(input: QueryInput): Promise<QueryResult> {
  return input.dataset.source === 'fsk' ? queryFsk(input) : queryDataGoKr(input);
}

async function queryDataGoKr({ op, params, page, size }: QueryInput): Promise<QueryResult> {
  // data.go.kr 인코딩 키는 이미 퍼센트 인코딩된 상태라 그대로 붙여야 한다(재인코딩하면 code 30)
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) return { ok: false, reason: 'no-key', message: '공공데이터포털 인증키가 설정되지 않았습니다.' };

  const qs = [`serviceKey=${key}`, `pageNo=${page}`, `numOfRows=${size}`, 'type=json', '_type=json'];
  for (const [k, v] of Object.entries(params)) qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  const res = await fetchText(`${op.endpoint}?${qs.join('&')}`);
  return res.ok ? parseDataGoKr(res.body) : res.result;
}

async function queryFsk({ op, params, page, size }: QueryInput): Promise<QueryResult> {
  const key = process.env.FOODSAFETY_KEY;
  if (!key) {
    return { ok: false, reason: 'no-key', message: '식품안전나라 인증키가 아직 연결되지 않아 이 데이터는 준비 중입니다.' };
  }
  const start = (page - 1) * size + 1;
  const end = start + size - 1;
  const filters = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const res = await fetchText(
    `${FSK_BASE}/${key}/${op.endpoint}/json/${start}/${end}${filters ? `/${filters}` : ''}`,
    FSK_REVALIDATE_SECONDS,
  );
  return res.ok ? parseFsk(res.body, op.endpoint) : res.result;
}

async function fetchText(
  url: string,
  revalidate: number = REVALIDATE_SECONDS,
): Promise<{ ok: true; body: string } | { ok: false; result: QueryResult }> {
  try {
    const res = await fetch(url, {
      next: { revalidate },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      return { ok: false, result: { ok: false, reason: 'upstream', message: `원천 서버가 HTTP ${res.status} 로 응답했습니다.` } };
    }
    return { ok: true, body: await res.text() };
  } catch (err) {
    console.error('[upstream] fetch failed', redactKey(url), err);
    return { ok: false, result: { ok: false, reason: 'network', message: '원천 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' } };
  }
}

function redactKey(url: string): string {
  return url.replace(/serviceKey=[^&]+/, 'serviceKey=***').replace(/\/api\/[^/]+\//, '/api/***/');
}
