// src/services/oauth.service.ts
import { OAuth2Client } from 'google-auth-library'

export interface GoogleProfile {
  id: string
  email: string
  name: string
  picture?: string
  emailVerified: boolean
}

export class OAuthService {
  private googleClient: OAuth2Client

  constructor() {
    const clientId = process.env.GOOGLE_CLIENT_ID || ''
    this.googleClient = new OAuth2Client(clientId)
  }

  /**
   * Verify Google ID token and extract user profile
   * @param token Google ID token from frontend
   * @returns Google profile information
   */
  async verifyGoogleToken(token: string): Promise<GoogleProfile> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      })

      const payload = ticket.getPayload()
      
      if (!payload) {
        throw new Error('Invalid token payload')
      }

      return {
        id: payload.sub,
        email: payload.email || '',
        name: payload.name || '',
        picture: payload.picture,
        emailVerified: payload.email_verified || false,
      }
    } catch (error) {
      console.error('Google token verification failed:', error)
      throw new Error('Invalid Google token')
    }
  }

  /**
   * Validate Google client configuration
   */
  isConfigured(): boolean {
    return !!process.env.GOOGLE_CLIENT_ID
  }
}

// Singleton instance
export const oauthService = new OAuthService()

