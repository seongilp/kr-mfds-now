/**
 * 데이터셋 카탈로그 스키마.
 *
 * `data/catalog.json` 은 이 타입의 배열이며, `scripts/build-catalog.py` 가 생성한다.
 * 앱은 이 카탈로그만 보고 모든 데이터셋의 조회 화면(파라미터 입력 폼 + 결과 표)을 자동 생성하므로,
 * 필드 하나하나가 실제 호출 가능한 값과 정확히 일치해야 한다.
 */

export type Category =
  | 'food'
  | 'restaurant'
  | 'drug'
  | 'device'
  | 'cosmetic'
  | 'narcotic'
  | 'bio'
  | 'import'
  | 'livestock'
  | 'standard'
  | 'stats'
  | 'etc';

export interface OpParam {
  /** 실제 쿼리스트링 키 (data.go.kr) 또는 식품안전나라 필터 필드명 */
  name: string;
  /** 한글 라벨 */
  label: string;
  required: boolean;
  /** 원문 사이트에 적힌 샘플 값 */
  sample?: string;
  /**
   * serviceKey/pageNo/numOfRows/type(data.go.kr), keyId/serviceId/dataType/startIdx/endIdx(식품안전나라) 등
   * 상위 레이어(lib/upstream.ts)가 이미 채워 넣는 값이면 true — 입력 폼에서 숨긴다.
   */
  system?: boolean;
}

export interface OpField {
  /** 응답 원문 필드명 (영문) */
  name: string;
  /** 한글 라벨 */
  label: string;
}

export interface Op {
  /** data.go.kr: operationId 또는 oprtinSeqNo. 식품안전나라: svc_no (endpoint 와 동일) */
  id: string;
  /** 오퍼레이션 한글명 */
  name: string;
  /**
   * data.go.kr: 전체 요청 URL (예: 'https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList')
   * 식품안전나라: svc_no (예: 'I0600') — lib/upstream.ts 가 `${FSK_BASE}/${key}/${op.endpoint}/json/...` 로 조립한다.
   */
  endpoint: string;
  params: OpParam[];
  fields: OpField[];
}

export interface Dataset {
  /** 'dg-{pk}' | 'fsk-{svc_no}' */
  id: string;
  source: 'datagokr' | 'fsk';
  title: string;
  /** 식품의약품안전처 / 식품의약품안전처 식품의약품안전평가원 / 행정안전부 ... */
  provider: string;
  category: Category;
  updatedAt?: string;
  /** 식품의약품안전평가원 연구관리 행정(R&D 내부업무) 데이터 — 목록에서 감춘다 */
  hidden?: boolean;
  /**
   * data.go.kr 상 실제 호출 가능한 오퍼레이션이 없고(ops 가 비어 있거나 의미 없고),
   * 식품안전나라 등 외부 서비스로 안내만 하는 경우 true. LINK(ty=PRDE04) 항목이 대표적.
   */
  linkOnly?: boolean;
  /** LINK(ty=PRDE04) ↔ 식품안전나라 서비스 짝. 매칭된 fsk Dataset 의 id */
  pairedWith?: string;
  /** 원 데이터 페이지(data.go.kr 상세 또는 식품안전나라 openApiInfo.do) */
  sourceUrl: string;
  /** 식품안전나라 필드 한글 라벨을 못 찾은 경우 true — 영문 필드명을 그대로 라벨로 사용했다는 표시 */
  labelsMissing?: boolean;
  ops: Op[];
}
