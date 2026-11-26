export function validateEmailAuthInput(
  email: string,
  password: string
): { valid: boolean; error?: string } {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    return { valid: false, error: 'Please enter your email address.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  if (!password) {
    return { valid: false, error: 'Please enter your password.' };
  }
  return { valid: true };
}

export function mapFirebaseAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password. Make sure the user exists in Firebase Authentication.';
    case 'auth/invalid-email':
      return 'Invalid email format.';
    case 'auth/user-disabled':
      return 'This account has been disabled in Firebase Authentication.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled yet. Enable it in Firebase Console → Authentication → Sign-in method.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error while contacting Firebase Authentication.';
    case 'auth/popup-closed-by-user':
      return '';
    default:
      return error instanceof Error ? error.message : 'Unable to sign in. Please try again.';
  }
}
