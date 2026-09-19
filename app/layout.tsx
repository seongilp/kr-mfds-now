import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';

const NAME = '식약처나우';
const TITLE = `${NAME} — 식약처 공개데이터 전부를 한곳에서`;
const DESCRIPTION =
  '의약품·식품·음식점 위생·의료기기·화장품·마약류까지, 식품의약품안전처가 공개한 데이터를 검색하고 바로 조회합니다.';

export const metadata: Metadata = {
  metadataBase: new URL('https://kr-mfds-now.vercel.app'),
  title: { default: TITLE, template: `%s — ${NAME}` },
  description: DESCRIPTION,
  applicationName: NAME,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: NAME, type: 'website', locale: 'ko_KR' },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  colorScheme: 'light',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-white font-sans text-[#191F28]">
        <header className="sticky top-0 z-20 border-b border-[#F2F4F6] bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid size-7 place-items-center rounded-lg bg-primary text-white">
                <ShieldCheck className="size-4" aria-hidden />
              </span>
              {NAME}
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-[#F2F4F6] bg-[#F9FAFB] py-6 text-center text-xs text-muted-foreground">
          데이터 출처: 식품의약품안전처 (공공데이터포털 · 식품안전나라). 원천 데이터는 공공누리 조건에 따라 제공됩니다.
          <br />
          <a className="underline underline-offset-2" href="https://github.com/seongilp/kr-mfds-now">
            GitHub
          </a>
        </footer>
      </body>
    </html>
  );
}
