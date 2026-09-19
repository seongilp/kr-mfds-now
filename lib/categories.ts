import type { Category } from '@/lib/catalog-types';

export interface CategoryMeta {
  id: Category;
  name: string;
  blurb: string;
}

export const CATEGORIES: readonly CategoryMeta[] = [
  { id: 'drug', name: '의약품', blurb: '허가·낱알식별·DUR·공급부족·회수' },
  { id: 'food', name: '식품', blurb: '품목제조·원재료·영양성분·회수·부적합' },
  { id: 'restaurant', name: '음식점·업소', blurb: '식품접객업·위생등급·행정처분·인허가' },
  { id: 'import', name: '수입식품', blurb: '수입신고·한글표시·해외직구 차단' },
  { id: 'livestock', name: '축산·수산', blurb: '축산물 품목·이력추적·HACCP' },
  { id: 'device', name: '의료기기', blurb: '품목허가·UDI·회수·유해사례' },
  { id: 'cosmetic', name: '화장품', blurb: '원료성분·사용제한·기능성·회수' },
  { id: 'narcotic', name: '마약류', blurb: '취급자·품목·의료용 마약류 통계' },
  { id: 'bio', name: '바이오·인체조직', blurb: '백신 출하승인·인체조직·혈액제제' },
  { id: 'standard', name: '기준·규격', blurb: '식품공전·잔류허용기준·코드' },
  { id: 'stats', name: '통계', blurb: '식중독·생산실적·검사 통계' },
  { id: 'etc', name: '기타', blurb: '용어사전·검사기관·연구자료' },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function categoryMeta(id: Category): CategoryMeta {
  return BY_ID.get(id) ?? { id, name: id, blurb: '' };
}

export function isCategory(value: string): value is Category {
  return BY_ID.has(value as Category);
}
