import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';

import { ResultTable } from '@/components/result-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getDataset } from '@/lib/catalog';
import type { Dataset, Op } from '@/lib/catalog-types';
import { categoryMeta } from '@/lib/categories';
import { query } from '@/lib/upstream';

const PAGE_SIZE = 20;
const PARAM_PREFIX = 'p.';

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

function pickOp(d: Dataset, opId: string): Op | undefined {
  return d.ops.find((o) => o.id === opId) ?? d.ops[0];
}

function userParams(op: Op, sp: SearchParams): Record<string, string> {
  const allowed = new Set(op.params.filter((p) => !p.system).map((p) => p.name));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (!k.startsWith(PARAM_PREFIX)) continue;
    const name = k.slice(PARAM_PREFIX.length);
    const value = first(v).trim().slice(0, 200);
    if (allowed.has(name) && value) out[name] = value;
  }
  return out;
}

function hrefWith(id: string, opId: string, params: Record<string, string>, page: number): string {
  const qs = new URLSearchParams({ op: opId, page: String(page) });
  for (const [k, v] of Object.entries(params)) qs.set(PARAM_PREFIX + k, v);
  return `/d/${id}?${qs.toString()}`;
}

export async function generateMetadata({ params }: PageProps<'/d/[id]'>): Promise<Metadata> {
  const d = getDataset((await params).id);
  return d ? { title: d.title } : {};
}

export default async function DatasetPage({ params, searchParams }: PageProps<'/d/[id]'>) {
  const { id } = await params;
  const d = getDataset(id);
  if (!d || d.hidden) notFound();

  const sp = (await searchParams) as SearchParams;
  const op = pickOp(d, first(sp.op));
  const page = Math.max(1, Math.min(10_000, Number(first(sp.page)) || 1));
  const cat = categoryMeta(d.category);

  return (
    <div className="space-y-5">
      <nav className="text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          홈
        </Link>{' '}
        /{' '}
        <Link href={`/c/${d.category}`} className="hover:text-foreground">
          {cat.name}
        </Link>
      </nav>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{d.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">{d.provider}</Badge>
          <Badge variant="outline">{d.source === 'fsk' ? '식품안전나라' : '공공데이터포털'}</Badge>
          {d.updatedAt && <span className="text-muted-foreground">수정 {d.updatedAt}</span>}
          <a
            href={d.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            원문 <ExternalLink className="size-3" />
          </a>
        </div>
      </header>

      {!op ? (
        <p className="rounded-xl border p-4 text-muted-foreground">
          이 데이터는 조회용 API 가 없어 원문 페이지에서만 볼 수 있습니다.
        </p>
      ) : (
        <DatasetBody d={d} op={op} page={page} params={userParams(op, sp)} />
      )}
    </div>
  );
}

async function DatasetBody({ d, op, page, params }: { d: Dataset; op: Op; page: number; params: Record<string, string> }) {
  const inputs = op.params.filter((p) => !p.system);
  const result = await query({ dataset: d, op, params, page, size: PAGE_SIZE });
  const lastPage = result.ok ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  return (
    <>
      {d.ops.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {d.ops.map((o) => (
            <Button key={o.id} asChild size="sm" variant={o.id === op.id ? 'default' : 'outline'}>
              <Link href={hrefWith(d.id, o.id, {}, 1)}>{o.name}</Link>
            </Button>
          ))}
        </div>
      )}

      {inputs.length > 0 && (
        <form action={`/d/${d.id}`} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="op" value={op.id} />
          {inputs.map((p) => (
            <label key={p.name} className="space-y-1 text-sm">
              <span className="text-muted-foreground">
                {p.label}
                {p.required && <span className="text-destructive"> *</span>}
              </span>
              <Input name={PARAM_PREFIX + p.name} defaultValue={params[p.name] ?? ''} placeholder={p.sample ?? ''} />
            </label>
          ))}
          <div className="flex items-end">
            <Button type="submit" className="w-full sm:w-auto">
              조회
            </Button>
          </div>
        </form>
      )}

      {!result.ok ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">{result.message}</p>
      ) : result.rows.length === 0 ? (
        <p className="rounded-xl border p-4 text-muted-foreground">조건에 맞는 결과가 없습니다.</p>
      ) : (
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">
            총 <strong className="text-foreground">{result.total.toLocaleString()}</strong>건 · {page}/
            {lastPage.toLocaleString()} 페이지
          </p>
          <ResultTable op={op} rows={result.rows} />
          <div className="flex justify-between">
            {page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={hrefWith(d.id, op.id, params, page - 1)}>이전</Link>
              </Button>
            ) : (
              <span />
            )}
            {page < lastPage && (
              <Button asChild variant="outline" size="sm">
                <Link href={hrefWith(d.id, op.id, params, page + 1)}>다음</Link>
              </Button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
