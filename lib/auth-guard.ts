export type AuthGuardDecision =
  | 'loading'
  | 'redirect_login'
  | 'pending_approval'
  | 'allow_cloud'
  | 'allow_local_demo';

export type AllowlistGateState =
  | 'loading'
  | 'approved'
  | 'pending'
  | 'rejected'
  | 'unverified';

export interface AuthGuardInput {
  isFirebaseConfigured: boolean;
  authReady: boolean;
  hasUser: boolean;
  allowlistState?: AllowlistGateState;
}

/**
 * Pure access-control decision for AuthGuard.
 * Guarantees Workspace & Firestore subscriptions only mount when authenticated
 * and approved on the allowlist
 * (unless Firebase itself is completely unconfigured, in which case Local Demo Mode applies).
 */
export function resolveAuthGuardDecision(input: AuthGuardInput): AuthGuardDecision {
  if (!input.isFirebaseConfigured) {
    return 'allow_local_demo';
  }
  if (!input.authReady) {
    return 'loading';
  }
  if (!input.hasUser) {
    return 'redirect_login';
  }
  if (input.allowlistState === 'loading') {
    return 'loading';
  }
  if (
    input.allowlistState === 'pending' ||
    input.allowlistState === 'rejected' ||
    input.allowlistState === 'unverified'
  ) {
    return 'pending_approval';
  }
  return 'allow_cloud';
}
