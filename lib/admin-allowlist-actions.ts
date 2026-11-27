import {
  isValidEmailFormat,
  normalizeEmail,
  setAllowedUserStatus,
  type AllowlistStatus,
} from './allowlist-service';

export type UpdateAllowedUserStatusFn = typeof setAllowedUserStatus;

export async function submitPreapprovedEmail(params: {
  email: string;
  adminEmail: string;
  updateStatus?: UpdateAllowedUserStatusFn;
}): Promise<string> {
  const normalized = normalizeEmail(params.email);
  if (!isValidEmailFormat(normalized)) {
    throw new Error('กรุณากรอกอีเมลให้ถูกต้อง');
  }
  const updateStatus = params.updateStatus ?? setAllowedUserStatus;
  await updateStatus({
    email: normalized,
    status: 'approved',
    adminEmail: params.adminEmail,
  });
  return normalized;
}

export async function submitAllowlistStatusChange(params: {
  email: string;
  status: AllowlistStatus;
  adminEmail: string;
  updateStatus?: UpdateAllowedUserStatusFn;
}): Promise<void> {
  const updateStatus = params.updateStatus ?? setAllowedUserStatus;
  await updateStatus({
    email: params.email,
    status: params.status,
    adminEmail: params.adminEmail,
  });
}
