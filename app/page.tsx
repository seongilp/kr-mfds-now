import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { DatasetSearch } from '@/components/dataset-search';
import { allDatasets, countByCategory, searchIndex } from '@/lib/catalog';
import { CATEGORIES } from '@/lib/categories';

export default function Home() {
  const counts = countByCategory();
  const total = allDatasets().length;

  return (
    <div className="space-y-10">
      <section className="-mx-4 -mt-6 space-y-4 bg-gradient-to-b from-[var(--brand-soft)] to-white px-4 pt-10 pb-6 sm:rounded-b-3xl">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          식약처가 공개한 데이터 <span className="text-primary">{total.toLocaleString()}종</span>, 전부 여기서 조회
        </h1>
        <p className="text-muted-foreground">
          약 모양으로 약 찾기부터 음식점 위생등급, 회수·판매중지 제품, 의료기기 허가까지. 신청도 키도 필요 없습니다.
        </p>
        <DatasetSearch index={searchIndex()} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">분야별로 보기</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.filter((c) => counts.get(c.id)).map((c) => (
            <Link
              key={c.id}
              href={`/c/${c.id}`}
              className="group flex items-center justify-between rounded-2xl border border-[#E5E8EB] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_4px_16px_rgba(49,130,246,0.12)]"
            >
              <div>
                <div className="font-medium">
                  {c.name} <span className="text-sm font-normal text-muted-foreground">{counts.get(c.id)}</span>
                </div>
                <div className="text-sm text-muted-foreground">{c.blurb}</div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
