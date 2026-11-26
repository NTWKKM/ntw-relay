export type AuthGuardDecision =
  | 'loading'
  | 'redirect_login'
  | 'allow_cloud'
  | 'allow_local_demo';

export interface AuthGuardInput {
  isFirebaseConfigured: boolean;
  authReady: boolean;
  hasUser: boolean;
}

/**
 * Pure access-control decision for AuthGuard.
 * Guarantees Workspace & Firestore subscriptions only mount when authenticated
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
  return 'allow_cloud';
}
