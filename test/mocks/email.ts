import { vi } from 'vitest';

export const mockEmailService = {
  sendOTPEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
};

// Returns the OTP that was "sent" to a given email address.
// Call this after an action that triggers sendOTPEmail.
export function getCapturedOTP(email: string): string {
  const calls = mockEmailService.sendOTPEmail.mock.calls;
  const call = [...calls].reverse().find((c) => c[0] === email);
  if (!call) {
    throw new Error(`No OTP captured for ${email}`);
  }
  return call[1] as string;
}
