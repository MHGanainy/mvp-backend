// src/services/otp.service.ts
import crypto from 'crypto'

export class OTPService {
  // Generate a 6-digit OTP
  generateOTP(): string {
    return crypto.randomInt(100000, 999999).toString()
  }

  // Generate OTP expiry time (10 minutes from now)
  generateOTPExpiry(): Date {
    const expiry = new Date()
    expiry.setMinutes(expiry.getMinutes() + 10)
    return expiry
  }

  // Verify if OTP is valid and not expired
  verifyOTP(storedOTP: string | null, storedExpiry: Date | null, providedOTP: string): boolean {
    if (!storedOTP || !storedExpiry) {
      return false
    }

    // Check if OTP has expired
    if (new Date() > storedExpiry) {
      return false
    }

    // Check if OTP matches
    return storedOTP === providedOTP
  }

  // Generate a secure random token for password reset
  generateResetToken(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  // Generate reset token expiry time (1 hour from now)
  generateResetTokenExpiry(): Date {
    const expiry = new Date()
    expiry.setHours(expiry.getHours() + 1)
    return expiry
  }

  // Verify if reset token is valid and not expired
  verifyResetToken(storedExpiry: Date | null): boolean {
    if (!storedExpiry) {
      return false
    }

    // Check if token has expired
    return new Date() <= storedExpiry
  }
}

// Singleton instance
export const otpService = new OTPService()

