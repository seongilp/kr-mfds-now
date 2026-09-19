import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isProxiableImage, proxiedImageUrl, sniffImageType } from '../image-proxy';

test('식약처 계열 호스트만 프록시한다', () => {
  assert.equal(isProxiableImage('https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1'), true);
  assert.equal(isProxiableImage('http://coop.foodsafetykorea.go.kr/open/commonfileView.do?a=1'), true);
  assert.equal(isProxiableImage('https://evil.example.com/x.png'), false);
  assert.equal(isProxiableImage('https://mfds.go.kr.evil.com/x.png'), false);
  assert.equal(isProxiableImage('javascript:alert(1)'), false);
});

test('프록시 대상이 아니면 원래 주소를 그대로 쓴다', () => {
  assert.equal(proxiedImageUrl('https://a.example/x.png'), 'https://a.example/x.png');
  assert.equal(
    proxiedImageUrl('https://nedrug.mfds.go.kr/i/1'),
    '/api/img?u=https%3A%2F%2Fnedrug.mfds.go.kr%2Fi%2F1',
  );
});

test('매직 바이트로 이미지 타입을 판정한다', () => {
  assert.equal(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1])), 'image/jpeg');
  assert.equal(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d])), 'image/png');
  assert.equal(sniffImageType(new TextEncoder().encode('<html>')), undefined);
});
