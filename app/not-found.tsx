import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-dvh bg-desk text-ink flex items-center justify-center px-6 py-16">
      <div className="max-w-sm w-full space-y-4 text-center">
        <p className="font-outlier text-xs text-muted tabular-nums">404</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">
          Page not found
        </h1>
        <div className="pt-2">
          <Link
            href="/"
            className="coral-btn-ink inline-flex items-center justify-center h-10 px-5 rounded-stock text-sm font-medium"
          >
            Back to Relay
          </Link>
        </div>
      </div>
    </main>
  );
}
