import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#F5F2EB] text-[#181715] dark:bg-[#121110] dark:text-[#F3EFE8] flex items-center justify-center px-6 py-16">
      <div className="max-w-sm w-full space-y-4 text-center">
        <p className="font-mono text-xs text-[#787268] dark:text-[#8A8378] tabular-nums">404</p>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-medium tracking-tight [text-wrap:balance]">
          Page not found
        </h1>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center h-10 px-5 rounded-lg bg-[#181715] hover:bg-[#2E2C28] dark:bg-[#F3EFE8] dark:hover:bg-[#E2DBD0] text-[#FCFBF8] dark:text-[#121110] text-sm font-medium transition-colors"
          >
            Back to NTW Relay
          </Link>
        </div>
      </div>
    </main>
  );
}
