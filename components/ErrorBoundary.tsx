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
    console.error('Relay boundary caught error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-desk text-ink flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-card coral-stock p-6 space-y-4">
            <div className="flex items-center gap-3 text-error">
              <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
              <h1 className="font-display text-lg font-semibold text-ink">
                Something went wrong
              </h1>
            </div>
            <p className="text-sm text-ink-2 leading-relaxed break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="coral-btn-ink inline-flex items-center gap-2 h-10 px-4 rounded-stock text-sm font-medium cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Reload Relay
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
