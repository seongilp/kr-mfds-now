'use client';

import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import type { DatasetSummary } from '@/lib/catalog';

const MAX_RESULTS = 30;

export function DatasetSearch({ index }: { index: DatasetSummary[] }) {
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q);

  const hits = useMemo(() => {
    const terms = deferred.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    return index.filter((d) => terms.every((t) => d.title.toLowerCase().includes(t))).slice(0, MAX_RESULTS);
  }, [deferred, index]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`${index.length.toLocaleString()}개 데이터에서 찾기 — 예: 낱알, 회수, 위생등급, 공급부족`}
        className="h-12 pl-9 text-base"
        aria-label="데이터 검색"
      />
      {deferred.trim() && (
        <ul className="mt-2 divide-y rounded-lg border bg-card">
          {hits.length === 0 && <li className="p-3 text-sm text-muted-foreground">일치하는 데이터가 없습니다.</li>}
          {hits.map((d) => (
            <li key={d.id}>
              <Link href={`/d/${d.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-accent">
                <span className="text-sm">{d.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {d.source === 'fsk' ? '식품안전나라' : '공공데이터포털'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
