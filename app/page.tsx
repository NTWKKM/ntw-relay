import React from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Workspace } from '@/components/Workspace';

export default function HomePage() {
  return (
    <ErrorBoundary>
      <AuthGuard>
        <Workspace />
      </AuthGuard>
    </ErrorBoundary>
  );
}
