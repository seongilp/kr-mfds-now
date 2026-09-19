import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { datasetsIn } from '@/lib/catalog';
import { CATEGORIES, categoryMeta, isCategory } from '@/lib/categories';

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.id }));
}

export async function generateMetadata({ params }: PageProps<'/c/[category]'>): Promise<Metadata> {
  const { category } = await params;
  return isCategory(category) ? { title: `${categoryMeta(category).name} 데이터` } : {};
}

export default async function CategoryPage({ params }: PageProps<'/c/[category]'>) {
  const { category } = await params;
  if (!isCategory(category)) notFound();
  const meta = categoryMeta(category);
  const list = datasetsIn(category);

  return (
    <div className="space-y-4">
      <nav className="text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          홈
        </Link>{' '}
        / {meta.name}
      </nav>
      <h1 className="text-2xl font-bold">
        {meta.name} <span className="text-base font-normal text-muted-foreground">{list.length}종</span>
      </h1>
      <ul className="divide-y rounded-xl border bg-card">
        {list.map((d) => (
          <li key={d.id}>
            <Link href={`/d/${d.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-accent">
              <span>{d.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {d.source === 'fsk' ? '식품안전나라' : '공공데이터포털'}
                {d.updatedAt ? ` · ${d.updatedAt}` : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
