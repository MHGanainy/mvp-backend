// src/entities/auth/auth.schema.ts
import { z } from "zod";

// Student Registration Schema - dateOfBirth removed
export const registerStudentSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(50, "First name must be less than 50 characters")
    .trim(),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(50, "Last name must be less than 50 characters")
    .trim(),
  name: z.string().optional(),
  dateOfBirth: z.any().optional(),
  referralCode: z.string().max(30).optional(),
});

// Instructor Registration Schema
export const registerInstructorSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(50, "First name must be less than 50 characters")
    .trim(),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(50, "Last name must be less than 50 characters")
    .trim(),
  bio: z.string().max(500, "Bio must be less than 500 characters").optional(),
  name: z.string().optional(),
  referralCode: z.string().max(30).optional(),
});

// Login Schema - no changes needed
export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  userType: z.enum(["student", "instructor"]),
});

// Token Refresh Schema - no changes needed
export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

// JWT Payload Schema - UPDATED to include isAdmin
export const jwtPayloadSchema = z.object({
  userId: z.number(),
  role: z.enum(["student", "instructor"]), // Keep as-is, admin will use the requested role
  email: z.string().email(),
  isAdmin: z.boolean().optional(), // ADD THIS
  studentId: z.string().uuid().optional(),
  instructorId: z.string().uuid().optional(),
});

// Auth Response Schema - UPDATED to include isAdmin
export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  role: z.enum(["student", "instructor"]),
  isAdmin: z.boolean().optional(), // ADD THIS
  user: z.object({
    id: z.number(),
    email: z.string(),
    name: z.string().nullable(),
    isAdmin: z.boolean().optional(), // ADD THIS
    profile: z.union([
      z.object({
        id: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        creditBalance: z.number(),
      }),
      z.object({
        id: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        bio: z.string().nullable(),
      }),
    ]),
  }),
});

// OTP Verification Schema
export const verifyOTPSchema = z.object({
  email: z.string().email("Invalid email format"),
  otp: z.string().length(6, "OTP must be 6 digits"),
  userType: z.enum(["student", "instructor"]),
});

// Resend OTP Schema
export const resendOTPSchema = z.object({
  email: z.string().email("Invalid email format"),
});

// Forgot Password Schema
export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email format"),
});

// Reset Password Schema
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

// Change Password Schema
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

// Google OAuth Login Schema
export const googleAuthSchema = z.object({
  idToken: z.string().min(1, "Google ID token is required"),
  userType: z.enum(["student", "instructor"]),
  referralCode: z.string().max(30).optional(),
});

// Type exports
export type RegisterStudentInput = z.infer<typeof registerStudentSchema>;
export type RegisterInstructorInput = z.infer<typeof registerInstructorSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type JWTPayload = z.infer<typeof jwtPayloadSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type VerifyOTPInput = z.infer<typeof verifyOTPSchema>;
export type ResendOTPInput = z.infer<typeof resendOTPSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
