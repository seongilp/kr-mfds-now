import 'server-only';

import raw from '@/data/catalog.json';
import type { Category, Dataset } from '@/lib/catalog-types';

const ALL = raw as unknown as Dataset[];

/** 사람이 볼 수 있는 데이터셋: 숨김(R&D 행정) 제외, LINK 짝이 있는 쪽은 실제 호출되는 fsk 원본만 */
const VISIBLE = ALL.filter((d) => !d.hidden && !(d.linkOnly || (d.source === 'datagokr' && d.pairedWith)));

const BY_ID = new Map(ALL.map((d) => [d.id, d]));

export interface DatasetSummary {
  id: string;
  title: string;
  category: Category;
  provider: string;
  source: Dataset['source'];
  updatedAt?: string;
}

export function summarize(d: Dataset): DatasetSummary {
  return {
    id: d.id,
    title: d.title,
    category: d.category,
    provider: d.provider,
    source: d.source,
    updatedAt: d.updatedAt,
  };
}

export function allDatasets(): readonly Dataset[] {
  return VISIBLE;
}

export function getDataset(id: string): Dataset | undefined {
  return BY_ID.get(id);
}

export function datasetsIn(category: Category): Dataset[] {
  return VISIBLE.filter((d) => d.category === category).sort((a, b) => a.title.localeCompare(b.title, 'ko'));
}

export function countByCategory(): Map<Category, number> {
  const counts = new Map<Category, number>();
  for (const d of VISIBLE) counts.set(d.category, (counts.get(d.category) ?? 0) + 1);
  return counts;
}

/** 클라이언트 검색용 최소 인덱스 */
export function searchIndex(): DatasetSummary[] {
  return VISIBLE.map(summarize);
}
