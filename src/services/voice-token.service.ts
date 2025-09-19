import jwt from 'jsonwebtoken';

export class VoiceTokenService {
  private readonly secret: string;
  private readonly expiryMinutes: number = 15;

  constructor() {
    if (!process.env.VOICE_AGENT_SHARED_SECRET) {
      throw new Error('VOICE_AGENT_SHARED_SECRET not configured');
    }
    this.secret = process.env.VOICE_AGENT_SHARED_SECRET;
  }

  generateToken(payload: {
    attemptId: string;
    studentId: string;
    correlationToken: string;
  }): string {
    return jwt.sign(
      {
        ...payload,
        type: 'voice_session',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (this.expiryMinutes * 60)
      },
      this.secret,
      { algorithm: 'HS256' }
    );
  }

  verifyToken(token: string): any {
    return jwt.verify(token, this.secret, { algorithms: ['HS256'] });
  }
}

export const voiceTokenService = new VoiceTokenService();