import React from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Workspace } from '@/components/Workspace';

export default function SandboxPage() {
  return (
    <ErrorBoundary>
      <Workspace forceLocalDemo />
    </ErrorBoundary>
  );
}
