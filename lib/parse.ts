/** 원천 응답(data.go.kr JSON/XML, 식품안전나라 JSON)을 한 모양으로 맞춘다. 네트워크 없음 — 테스트 대상. */

export type Row = Record<string, string>;

export type ParseResult =
  | { ok: true; rows: Row[]; total: number }
  | { ok: false; reason: 'upstream'; message: string };

type Json = Record<string, unknown>;

export function parseDataGoKr(body: string): ParseResult {
  return body.trimStart().startsWith('<') ? parseDataGoKrXml(body) : parseDataGoKrJson(body);
}

function parseDataGoKrJson(body: string): ParseResult {
  let j: Json;
  try {
    j = JSON.parse(body) as Json;
  } catch {
    return { ok: false, reason: 'upstream', message: '응답을 해석하지 못했습니다.' };
  }
  const gatewayError = (j.OpenAPI_ServiceResponse as Json | undefined)?.cmmMsgHeader as Json | undefined;
  if (gatewayError) return upstreamError(String(gatewayError.returnReasonCode), String(gatewayError.returnAuthMsg ?? ''));

  const envelope = (j.response as Json | undefined) ?? j;
  const header = envelope.header as Json | undefined;
  const code = String(header?.resultCode ?? '00');
  if (!isOkCode(code)) return upstreamError(code, String(header?.resultMsg ?? ''));

  const bodyNode = (envelope.body as Json | undefined) ?? {};
  const rows = toRows(extractItems(bodyNode.items));
  const total = Number(bodyNode.totalCount ?? rows.length) || 0;
  return { ok: true, rows, total };
}

function extractItems(items: unknown): unknown[] {
  if (Array.isArray(items)) return items;
  if (items && typeof items === 'object') {
    const inner = (items as Json).item;
    if (Array.isArray(inner)) return inner;
    if (inner && typeof inner === 'object') return [inner];
  }
  return [];
}

function parseDataGoKrXml(body: string): ParseResult {
  const code = tagText(body, 'resultCode') ?? tagText(body, 'returnReasonCode') ?? '00';
  if (!isOkCode(code)) {
    return upstreamError(code, tagText(body, 'resultMsg') ?? tagText(body, 'returnAuthMsg') ?? '');
  }
  const rows: Row[] = [];
  for (const [, inner] of body.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const row: Row = {};
    for (const [, name, value] of inner.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)) row[name] = decodeXml(value);
    rows.push(row);
  }
  const total = Number(tagText(body, 'totalCount') ?? rows.length) || 0;
  return { ok: true, rows, total };
}

export function parseFsk(body: string, serviceId: string): ParseResult {
  let j: Json;
  try {
    j = JSON.parse(body) as Json;
  } catch {
    return { ok: false, reason: 'upstream', message: '응답을 해석하지 못했습니다.' };
  }
  const node = (j[serviceId] as Json | undefined) ?? j;
  const result = node.RESULT as Json | undefined;
  const code = String(result?.CODE ?? 'INFO-000');
  // INFO-200 = 해당하는 데이터 없음 → 빈 결과
  if (code === 'INFO-200') return { ok: true, rows: [], total: 0 };
  if (!isOkCode(code)) return upstreamError(code, String(result?.MSG ?? ''));
  const rows = toRows(Array.isArray(node.row) ? node.row : []);
  return { ok: true, rows, total: Number(node.total_count ?? rows.length) || 0 };
}

function tagText(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXml(m[1]).trim() : undefined;
}

function decodeXml(s: string): string {
  return s
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function isOkCode(code: string): boolean {
  return ['00', '0', '000', '0000', 'INFO-000'].includes(code);
}

function upstreamError(code: string, msg: string): ParseResult {
  const hint =
    code === '30' ? '이 데이터의 활용신청 승인이 아직 반영되지 않았습니다.' :
    code === '22' ? '오늘 호출 한도를 모두 썼습니다. 내일 다시 시도해 주세요.' :
    code === '23' ? '잠시 호출이 몰렸습니다. 조금 뒤 다시 시도해 주세요.' :
    msg || '원천 서버가 오류를 반환했습니다.';
  return { ok: false, reason: 'upstream', message: `${hint} (코드 ${code})` };
}

function toRows(items: unknown[]): Row[] {
  return items
    .filter((it): it is Json => !!it && typeof it === 'object')
    .map((it) => Object.fromEntries(Object.entries(it).map(([k, v]) => [k, stringify(v)])));
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
