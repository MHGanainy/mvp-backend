import { vi } from 'vitest';

let cannedProfile = {
  id: 'google-user-123',
  email: 'google-user@example.com',
  name: 'Google User',
  emailVerified: true,
};

export function setGoogleProfile(profile: Partial<typeof cannedProfile>) {
  cannedProfile = { ...cannedProfile, ...profile };
}

export const mockOAuth2Client = {
  verifyIdToken: vi.fn().mockImplementation(async () => ({
    getPayload: () => ({
      sub: cannedProfile.id,
      email: cannedProfile.email,
      name: cannedProfile.name,
      email_verified: cannedProfile.emailVerified,
    }),
  })),
};

export function createGoogleAuthMock() {
  return {
    OAuth2Client: vi.fn().mockImplementation(() => mockOAuth2Client),
  };
}
