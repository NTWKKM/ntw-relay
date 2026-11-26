'use client';

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let message = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(message) as { error?: string; operationType?: string; path?: string };
      if (parsed && parsed.error) {
        message = `Sync error (${parsed.operationType ?? 'operation'} on ${parsed.path ?? 'drops'}): ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message };
  }

  componentDidCatch(error: Error) {
    console.error('NTW Relay boundary caught error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F5F2EB] text-[#181715] dark:bg-[#121110] dark:text-[#F3EFE8] flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] p-6 space-y-4">
            <div className="flex items-center gap-3 text-[#B91C1C] dark:text-[#FCA5A5]">
              <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
              <h1 className="font-[family-name:var(--font-display)] text-lg font-medium text-[#181715] dark:text-[#F3EFE8]">
                Something went wrong
              </h1>
            </div>
            <p className="text-sm text-[#5D5850] dark:text-[#A8A196] leading-relaxed break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#181715] dark:bg-[#F3EFE8] text-[#FCFBF8] dark:text-[#121110] text-sm font-medium hover:bg-[#2E2C28] dark:hover:bg-[#E2DBD0] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Reload NTW Relay
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
