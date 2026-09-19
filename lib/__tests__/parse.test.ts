import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseDataGoKr, parseFsk } from '../parse';

test('data.go.kr JSON: header/body 가 최상위에 있는 식약처 형식', () => {
  const body = JSON.stringify({
    header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
    body: { pageNo: 1, totalCount: 4743, numOfRows: 1, items: [{ itemName: '타이레놀정500밀리그람', itemSeq: 202106092 }] },
  });
  const r = parseDataGoKr(body);
  assert.deepEqual(r, { ok: true, total: 4743, rows: [{ itemName: '타이레놀정500밀리그람', itemSeq: '202106092' }] });
});

test('data.go.kr JSON: response 로 감싸고 items.item 이 객체 하나인 형식', () => {
  const body = JSON.stringify({
    response: { header: { resultCode: '00' }, body: { totalCount: 1, items: { item: { A: 'x', B: null } } } },
  });
  assert.deepEqual(parseDataGoKr(body), { ok: true, total: 1, rows: [{ A: 'x', B: '' }] });
});

test('data.go.kr 게이트웨이 오류(미신청 code 30)는 사람이 읽을 메시지로', () => {
  const body = JSON.stringify({
    OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: '30', returnAuthMsg: '등록되지 않은 서비스키' } },
  });
  const r = parseDataGoKr(body);
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.message : '', /활용신청.*코드 30/);
});

test('data.go.kr XML 응답과 CDATA·엔티티', () => {
  const body = `<?xml version="1.0"?><response><header><resultCode>00</resultCode></header><body><items>
    <item><PRDUCT><![CDATA[김 & 밥]]></PRDUCT><ENTRPS>A&amp;B</ENTRPS></item>
    <item><PRDUCT>둘째</PRDUCT><ENTRPS></ENTRPS></item>
  </items><totalCount>2</totalCount></body></response>`;
  assert.deepEqual(parseDataGoKr(body), {
    ok: true,
    total: 2,
    rows: [
      { PRDUCT: '김 & 밥', ENTRPS: 'A&B' },
      { PRDUCT: '둘째', ENTRPS: '' },
    ],
  });
});

test('식품안전나라: 정상 응답', () => {
  const body = JSON.stringify({
    C004: { total_count: '46399', row: [{ BSSH_NM: '스타벅스', HG_ASGN_LV: '매우우수' }], RESULT: { CODE: 'INFO-000', MSG: '정상' } },
  });
  assert.deepEqual(parseFsk(body, 'C004'), { ok: true, total: 46399, rows: [{ BSSH_NM: '스타벅스', HG_ASGN_LV: '매우우수' }] });
});

test('식품안전나라: INFO-200 은 오류가 아니라 빈 결과', () => {
  const body = JSON.stringify({ I1100: { total_count: '0', RESULT: { CODE: 'INFO-200', MSG: '해당하는 데이터가 없습니다.' } } });
  assert.deepEqual(parseFsk(body, 'I1100'), { ok: true, total: 0, rows: [] });
});

test('식품안전나라: 잘못된 서비스(ERROR-310)는 HTTP 200 이어도 오류', () => {
  const body = JSON.stringify({ RESULT: { CODE: 'ERROR-310', MSG: '해당하는 서비스를 찾을 수 없습니다.' } });
  const r = parseFsk(body, 'I9999');
  assert.equal(r.ok, false);
});
