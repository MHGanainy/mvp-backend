// src/entities/auth/auth.service.ts
import { PrismaClient, Prisma } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { FastifyInstance } from "fastify";
import {
  LoginInput,
  JWTPayload,
  RegisterStudentInput,
  RegisterInstructorInput,
  VerifyOTPInput,
  ResendOTPInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
  GoogleAuthInput,
} from "./auth.schema";
import { emailService } from "../../services/email.service";
import { otpService } from "../../services/otp.service";
import { oauthService } from "../../services/oauth.service";
import { CREDITS } from "../../shared/constants";

export class AuthService {
  private fastify: FastifyInstance;

  constructor(private prisma: PrismaClient, fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  // Student Registration
  async registerStudent(data: RegisterStudentInput) {
    // Normalize email to lowercase
    const normalizedEmail = data.email.toLowerCase().trim();

    // Check if email already exists in users table
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { student: true, instructor: true },
    });

    if (existingUser) {
      if (existingUser.emailVerified) {
        throw new Error("Email already registered");
      } else {
        // Clean up old unverified user (from old registration flow)
        if (existingUser.student) {
          await this.prisma.student.delete({
            where: { id: existingUser.student.id },
          });
        }
        if (existingUser.instructor) {
          await this.prisma.instructor.delete({
            where: { id: existingUser.instructor.id },
          });
        }
        await this.prisma.user.delete({ where: { id: existingUser.id } });
      }
    }

    // Hash password
    const passwordHash = await this.hashPassword(data.password);

    // Generate OTP for email verification
    const otp = otpService.generateOTP();
    const otpExpiry = otpService.generateOTPExpiry();

    // Store in pending registrations (upsert to allow re-sending OTP)
    await this.prisma.pendingRegistration.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        name: data.name || `${data.firstName} ${data.lastName}`,
        userType: "student",
        otp,
        otpExpiresAt: otpExpiry,
        referralCode: data.referralCode || null,
      },
      update: {
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        name: data.name || `${data.firstName} ${data.lastName}`,
        otp,
        otpExpiresAt: otpExpiry,
        referralCode: data.referralCode || null,
      },
    });

    // Send OTP email
    try {
      await emailService.sendOTPEmail(
        normalizedEmail,
        otp,
        data.name || data.firstName
      );
    } catch (error) {
      this.fastify.log.error({ err: error }, 'Failed to send OTP email');
      throw new Error("Failed to send verification email");
    }

    return {
      message:
        "Registration successful. Please verify your email with the OTP sent to your email address.",
      email: normalizedEmail,
      requiresVerification: true,
    };
  }

  // Instructor Registration
  async registerInstructor(data: RegisterInstructorInput) {
    // Normalize email to lowercase
    const normalizedEmail = data.email.toLowerCase().trim();

    // Check if email already exists in users table
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { student: true, instructor: true },
    });

    if (existingUser) {
      if (existingUser.emailVerified) {
        throw new Error("Email already registered");
      } else {
        // Clean up old unverified user (from old registration flow)
        if (existingUser.student) {
          await this.prisma.student.delete({
            where: { id: existingUser.student.id },
          });
        }
        if (existingUser.instructor) {
          await this.prisma.instructor.delete({
            where: { id: existingUser.instructor.id },
          });
        }
        await this.prisma.user.delete({ where: { id: existingUser.id } });
      }
    }

    // Hash password
    const passwordHash = await this.hashPassword(data.password);

    // Generate OTP for email verification
    const otp = otpService.generateOTP();
    const otpExpiry = otpService.generateOTPExpiry();

    // Store in pending registrations (upsert to allow re-sending OTP)
    await this.prisma.pendingRegistration.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        name: data.name || `${data.firstName} ${data.lastName}`,
        userType: "instructor",
        bio: data.bio,
        otp,
        otpExpiresAt: otpExpiry,
        referralCode: data.referralCode || null,
      },
      update: {
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        name: data.name || `${data.firstName} ${data.lastName}`,
        bio: data.bio,
        otp,
        otpExpiresAt: otpExpiry,
        referralCode: data.referralCode || null,
      },
    });

    // Send OTP email
    try {
      await emailService.sendOTPEmail(
        normalizedEmail,
        otp,
        data.name || data.firstName
      );
    } catch (error) {
      this.fastify.log.error({ err: error }, 'Failed to send OTP email');
      throw new Error("Failed to send verification email");
    }

    return {
      message:
        "Registration successful. Please verify your email with the OTP sent to your email address.",
      email: normalizedEmail,
      requiresVerification: true,
    };
  }

  async login(data: LoginInput) {
    // Normalize email to lowercase for consistent comparison
    const normalizedEmail = data.email.toLowerCase().trim();

    // Check if user is in pending registration (not yet verified)
    const pending = await this.prisma.pendingRegistration.findUnique({
      where: { email: normalizedEmail },
    });

    if (pending) {
      throw new Error(
        "Please verify your email first. Check your inbox for the OTP code."
      );
    }

    // Find user by normalized email
    let user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        student: true,
        instructor: true,
      },
    });

    if (!user) {
      throw new Error("Invalid credentials");
    }

    // Check if email is verified (skip for OAuth users and admins)
    if (!user.emailVerified && !user.isAdmin && user.oauthProvider === null) {
      throw new Error(
        "Email not verified. Please verify your email before logging in."
      );
    }

    // Verify password first (before creating profiles)
    // OAuth users don't have passwords
    if (!user.passwordHash && !user.oauthProvider) {
      throw new Error("Invalid credentials");
    }

    // Skip password check for OAuth users
    if (user.passwordHash) {
      const isValidPassword = await this.comparePassword(
        data.password,
        user.passwordHash
      );

      if (!isValidPassword) {
        throw new Error("Invalid credentials");
      }
    }

    // Special handling for admin user - create profile if needed
    if (user.isAdmin) {
      if (data.userType === "student" && !user.student) {
        // Create student profile for admin on first student login
        const adminStudent = await this.prisma.student.create({
          data: {
            userId: user.id,
            firstName: "System", // Use consistent naming
            lastName: "Administrator",
            creditBalance: 999999, // Unlimited credits
          },
        });
        user.student = adminStudent; // Update the user object
      } else if (data.userType === "instructor" && !user.instructor) {
        // Create instructor profile for admin on first instructor login
        const adminInstructor = await this.prisma.instructor.create({
          data: {
            userId: user.id,
            firstName: "System", // Use consistent naming
            lastName: "Administrator",
            bio: "System Administrator with full access",
          },
        });
        user.instructor = adminInstructor; // Update the user object
      }
    } else {
      // Regular users must have the correct profile type
      if (data.userType === "student" && !user.student) {
        throw new Error("User is not a student");
      }
      if (data.userType === "instructor" && !user.instructor) {
        throw new Error("User is not an instructor");
      }
    }

    // Build profile based on requested userType
    let profile;
    if (data.userType === "student") {
      if (!user.student) {
        throw new Error("Student profile not found");
      }
      profile = {
        id: user.student.id,
        firstName: user.student.firstName,
        lastName: user.student.lastName,
        creditBalance: user.isAdmin ? 999999 : user.student.creditBalance,
      };
    } else {
      if (!user.instructor) {
        throw new Error("Instructor profile not found");
      }
      profile = {
        id: user.instructor.id,
        firstName: user.instructor.firstName,
        lastName: user.instructor.lastName,
        bio: user.instructor.bio,
      };
    }

    // Generate tokens - include isAdmin flag
    const payload: JWTPayload = {
      userId: user.id,
      role: data.userType, // Always use the requested role
      email: user.email,
      isAdmin: user.isAdmin || false,
      studentId: data.userType === "student" ? user.student?.id : undefined,
      instructorId:
        data.userType === "instructor" ? user.instructor?.id : undefined,
    };

    const accessToken = await this.generateAccessToken(payload);
    const refreshToken = await this.generateRefreshToken(payload);

    // Return consistent structure for all users (admin or not)
    return {
      accessToken,
      refreshToken,
      expiresIn: 3600, // 1 hour
      role: data.userType,
      isAdmin: user.isAdmin || false,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin || false,
        profile,
      },
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      // Verify refresh token
      const decoded = (await this.fastify.jwt.verify(
        refreshToken
      )) as JWTPayload;

      // Check if user still exists
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          student: true,
          instructor: true,
        },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Preserve isAdmin flag in new token
      const newPayload: JWTPayload = {
        ...decoded,
        isAdmin: user.isAdmin || false, // Ensure current isAdmin status
      };

      // Generate new access token
      const newAccessToken = await this.generateAccessToken(newPayload);

      return {
        accessToken: newAccessToken,
        expiresIn: 3600,
      };
    } catch (error) {
      throw new Error("Invalid refresh token");
    }
  }

  async verifyToken(token: string): Promise<JWTPayload> {
    try {
      const decoded = (await this.fastify.jwt.verify(token)) as JWTPayload;
      return decoded;
    } catch (error) {
      throw new Error("Invalid token");
    }
  }

  private async generateAccessToken(payload: JWTPayload): Promise<string> {
    return this.fastify.jwt.sign(payload, {
      expiresIn: "1h",
    });
  }

  private async generateRefreshToken(payload: JWTPayload): Promise<string> {
    return this.fastify.jwt.sign(payload, {
      expiresIn: "7d",
    });
  }

  // OTP Verification - NOW creates the user
  async verifyOTP(data: VerifyOTPInput) {
    const normalizedEmail = data.email.toLowerCase().trim();

    // Find pending registration
    const pending = await this.prisma.pendingRegistration.findUnique({
      where: { email: normalizedEmail },
    });

    if (!pending) {
      throw new Error("No pending registration found for this email");
    }

    // Verify OTP
    const isValidOTP = otpService.verifyOTP(
      pending.otp,
      pending.otpExpiresAt,
      data.otp
    );

    if (!isValidOTP) {
      throw new Error("Invalid or expired OTP");
    }

    // Verify userType matches
    if (pending.userType !== data.userType) {
      throw new Error(
        `This registration is for ${pending.userType}, not ${data.userType}`
      );
    }

    // Create user and profile
    const result = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Check if user already exists (from old registration flow)
        const existingUser = await tx.user.findUnique({
          where: { email: normalizedEmail },
          include: { student: true, instructor: true },
        });

        let user;

        if (existingUser) {
          // User exists from old flow - clean up and recreate
          // Delete existing profiles first
          if (existingUser.student) {
            await tx.student.delete({ where: { id: existingUser.student.id } });
          }
          if (existingUser.instructor) {
            await tx.instructor.delete({
              where: { id: existingUser.instructor.id },
            });
          }

          // Delete the old user
          await tx.user.delete({ where: { id: existingUser.id } });
        }

        // Create user with verified email
        user = await tx.user.create({
          data: {
            email: normalizedEmail,
            name: pending.name,
            passwordHash: pending.passwordHash,
            emailVerified: true, // Already verified via OTP
          },
        });

        // Record referral if a valid code was provided
        if (pending.referralCode) {
          const affiliate = await tx.affiliate.findUnique({
            where: { code: pending.referralCode, isActive: true },
          })
          if (affiliate) {
            await tx.referral.create({
              data: {
                affiliateId: affiliate.id,
                userId: user.id,
                code: pending.referralCode,
              },
            })
          }
        }

        // Create profile based on user type
        if (data.userType === "student") {
          const student = await tx.student.create({
            data: {
              userId: user.id,
              firstName: pending.firstName,
              lastName: pending.lastName,
              creditBalance: CREDITS.WELCOME_BONUS,
            },
          });

          // Create credit transaction
          await tx.creditTransaction.create({
            data: {
              studentId: student.id,
              transactionType: "CREDIT",
              amount: CREDITS.WELCOME_BONUS,
              balanceAfter: CREDITS.WELCOME_BONUS,
              sourceType: "MANUAL",
              description: `Welcome bonus - ${CREDITS.WELCOME_BONUS} complimentary credits`,
            },
          });

          // Delete pending registration
          await tx.pendingRegistration.delete({
            where: { email: normalizedEmail },
          });

          return { user, student, instructor: null };
        } else {
          const instructor = await tx.instructor.create({
            data: {
              userId: user.id,
              firstName: pending.firstName,
              lastName: pending.lastName,
              bio: pending.bio,
            },
          });

          // Delete pending registration
          await tx.pendingRegistration.delete({
            where: { email: normalizedEmail },
          });

          return { user, student: null, instructor };
        }
      }
    );

    // Send welcome email with free credits info for students
    try {
      const freeCredits =
        data.userType === "student" ? CREDITS.WELCOME_BONUS : undefined;
      await emailService.sendWelcomeEmail(
        normalizedEmail,
        result.user.name || undefined,
        freeCredits
      );
    } catch (error) {
      this.fastify.log.error({ err: error }, 'Failed to send welcome email (non-critical)');
    }

    // Build profile
    let profile;
    if (data.userType === "student" && result.student) {
      profile = {
        id: result.student.id,
        firstName: result.student.firstName,
        lastName: result.student.lastName,
        creditBalance: result.student.creditBalance,
      };
    } else if (data.userType === "instructor" && result.instructor) {
      profile = {
        id: result.instructor.id,
        firstName: result.instructor.firstName,
        lastName: result.instructor.lastName,
        bio: result.instructor.bio,
      };
    } else {
      throw new Error("Profile not found");
    }

    // Generate tokens for auto-login after verification
    const payload: JWTPayload = {
      userId: result.user.id,
      role: data.userType,
      email: result.user.email,
      isAdmin: result.user.isAdmin,
      studentId: data.userType === "student" ? result.student?.id : undefined,
      instructorId:
        data.userType === "instructor" ? result.instructor?.id : undefined,
    };

    const accessToken = await this.generateAccessToken(payload);
    const refreshToken = await this.generateRefreshToken(payload);

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
      role: data.userType,
      isAdmin: result.user.isAdmin,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        isAdmin: result.user.isAdmin,
        profile,
      },
    };
  }

  // Resend OTP
  async resendOTP(data: ResendOTPInput) {
    const normalizedEmail = data.email.toLowerCase().trim();

    // Check pending registrations first
    const pending = await this.prisma.pendingRegistration.findUnique({
      where: { email: normalizedEmail },
    });

    if (pending) {
      // Generate new OTP
      const otp = otpService.generateOTP();
      const otpExpiry = otpService.generateOTPExpiry();

      // Update pending registration with new OTP
      await this.prisma.pendingRegistration.update({
        where: { email: normalizedEmail },
        data: {
          otp,
          otpExpiresAt: otpExpiry,
        },
      });

      // Send OTP email
      try {
        await emailService.sendOTPEmail(
          normalizedEmail,
          otp,
          pending.name || undefined
        );
      } catch (error) {
        this.fastify.log.error({ err: error }, 'Failed to send OTP email');
        throw new Error("Failed to send OTP email");
      }

      return {
        message: "OTP resent successfully",
        email: normalizedEmail,
      };
    }

    // If not in pending, maybe they already registered (shouldn't happen but handle it)
    throw new Error("No pending registration found for this email");
  }

  // Google OAuth Authentication
  async googleAuth(data: GoogleAuthInput) {
    // Verify Google token
    const googleProfile = await oauthService.verifyGoogleToken(data.idToken);

    if (!googleProfile.emailVerified) {
      throw new Error("Google email not verified");
    }

    const normalizedEmail = googleProfile.email.toLowerCase().trim();

    // Check if user exists
    let user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        student: true,
        instructor: true,
      },
    });

    // If user doesn't exist, create new user
    if (!user) {
      const result = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const newUser = await tx.user.create({
            data: {
              email: normalizedEmail,
              name: googleProfile.name,
              emailVerified: true, // Google already verified
              oauthProvider: "google",
              oauthProviderId: googleProfile.id,
              passwordHash: null, // OAuth users don't have passwords
            },
          });

          // Record referral if a valid code was provided
          if (data.referralCode) {
            const affiliate = await tx.affiliate.findUnique({
              where: { code: data.referralCode, isActive: true },
            })
            if (affiliate) {
              await tx.referral.create({
                data: {
                  affiliateId: affiliate.id,
                  userId: newUser.id,
                  code: data.referralCode,
                },
              })
            }
          }

          // Create profile based on user type
          if (data.userType === "student") {
            const student = await tx.student.create({
              data: {
                userId: newUser.id,
                firstName: googleProfile.name.split(" ")[0] || "User",
                lastName:
                  googleProfile.name.split(" ").slice(1).join(" ") || "",
                creditBalance: CREDITS.WELCOME_BONUS,
              },
            });

            // Create credit transaction
            await tx.creditTransaction.create({
              data: {
                studentId: student.id,
                transactionType: "CREDIT",
                amount: CREDITS.WELCOME_BONUS,
                balanceAfter: CREDITS.WELCOME_BONUS,
                sourceType: "MANUAL",
                description: `Welcome bonus - ${CREDITS.WELCOME_BONUS} complimentary credits`,
              },
            });

            return { user: newUser, student, instructor: null };
          } else {
            const instructor = await tx.instructor.create({
              data: {
                userId: newUser.id,
                firstName: googleProfile.name.split(" ")[0] || "User",
                lastName:
                  googleProfile.name.split(" ").slice(1).join(" ") || "",
                bio: null,
              },
            });

            return { user: newUser, student: null, instructor };
          }
        }
      );

      user = await this.prisma.user.findUnique({
        where: { id: result.user.id },
        include: {
          student: true,
          instructor: true,
        },
      });

      if (!user) {
        throw new Error("User creation failed");
      }

      // Send welcome email for new user registration
      try {
        const freeCredits =
          data.userType === "student" ? CREDITS.WELCOME_BONUS : undefined;
        await emailService.sendWelcomeEmail(
          normalizedEmail,
          user.name || undefined,
          freeCredits
        );
      } catch (error) {
        this.fastify.log.error({ err: error }, 'Failed to send welcome email (non-critical)');
      }
    } else {
      // User exists - check if they have the required profile
      if (data.userType === "student" && !user.student) {
        // Create student profile
        await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const student = await tx.student.create({
            data: {
              userId: user!.id,
              firstName: googleProfile.name.split(" ")[0] || "User",
              lastName: googleProfile.name.split(" ").slice(1).join(" ") || "",
              creditBalance: CREDITS.WELCOME_BONUS,
            },
          });

          await tx.creditTransaction.create({
            data: {
              studentId: student.id,
              transactionType: "CREDIT",
              amount: CREDITS.WELCOME_BONUS,
              balanceAfter: CREDITS.WELCOME_BONUS,
              sourceType: "MANUAL",
              description: `Welcome bonus - ${CREDITS.WELCOME_BONUS} complimentary credits`,
            },
          });
        });

        user = await this.prisma.user.findUnique({
          where: { id: user.id },
          include: { student: true, instructor: true },
        });

        // Note: We don't send a welcome email here because this is an existing user
        // who is just adding a new profile type. Welcome emails are only for new registrations.
      } else if (data.userType === "instructor" && !user.instructor) {
        // Create instructor profile
        await this.prisma.instructor.create({
          data: {
            userId: user.id,
            firstName: googleProfile.name.split(" ")[0] || "User",
            lastName: googleProfile.name.split(" ").slice(1).join(" ") || "",
            bio: null,
          },
        });

        user = await this.prisma.user.findUnique({
          where: { id: user.id },
          include: { student: true, instructor: true },
        });
      }
    }

    if (!user) {
      throw new Error("User not found");
    }

    // Build profile
    let profile;
    if (data.userType === "student" && user.student) {
      profile = {
        id: user.student.id,
        firstName: user.student.firstName,
        lastName: user.student.lastName,
        creditBalance: user.student.creditBalance,
      };
    } else if (data.userType === "instructor" && user.instructor) {
      profile = {
        id: user.instructor.id,
        firstName: user.instructor.firstName,
        lastName: user.instructor.lastName,
        bio: user.instructor.bio,
      };
    } else {
      throw new Error("Profile not found");
    }

    // Generate tokens
    const payload: JWTPayload = {
      userId: user.id,
      role: data.userType,
      email: user.email,
      isAdmin: user.isAdmin,
      studentId: data.userType === "student" ? user.student?.id : undefined,
      instructorId:
        data.userType === "instructor" ? user.instructor?.id : undefined,
    };

    const accessToken = await this.generateAccessToken(payload);
    const refreshToken = await this.generateRefreshToken(payload);

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
      role: data.userType,
      isAdmin: user.isAdmin,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        profile,
      },
    };
  }

  // Forgot Password
  async forgotPassword(data: ForgotPasswordInput) {
    const normalizedEmail = data.email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Don't reveal if user exists or not (security best practice)
    if (!user) {
      return {
        message:
          "If an account exists with this email, a password reset link has been sent.",
      };
    }

    // Don't allow password reset for OAuth users
    if (user.oauthProvider) {
      return {
        message:
          "This account uses OAuth authentication. Please sign in with your OAuth provider.",
      };
    }

    // Generate reset token
    const resetToken = otpService.generateResetToken();
    const resetExpiry = otpService.generateResetTokenExpiry();

    // Save reset token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpiry,
      },
    });

    // Send reset email
    try {
      await emailService.sendPasswordResetEmail(
        normalizedEmail,
        resetToken,
        user.name || undefined
      );
    } catch (error) {
      this.fastify.log.error({ err: error }, 'Failed to send password reset email (non-critical)');
    }

    return {
      message:
        "If an account exists with this email, a password reset link has been sent.",
    };
  }

  // Reset Password
  async resetPassword(data: ResetPasswordInput) {
    // Find user by reset token
    const user = await this.prisma.user.findUnique({
      where: { passwordResetToken: data.token },
    });

    if (!user) {
      throw new Error("Invalid or expired reset token");
    }

    // Verify token expiry
    const isValidToken = otpService.verifyResetToken(user.passwordResetExpires);

    if (!isValidToken) {
      throw new Error("Invalid or expired reset token");
    }

    // Hash new password
    const passwordHash = await this.hashPassword(data.newPassword);

    // Update password and clear reset token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    // Send confirmation email
    try {
      await emailService.sendPasswordChangedEmail(
        user.email,
        user.name || undefined
      );
    } catch (error) {
      this.fastify.log.error({ err: error }, 'Failed to send password changed email (non-critical)');
    }

    return {
      message: "Password reset successfully",
    };
  }

  // Change Password (for authenticated users)
  async changePassword(userId: number, data: ChangePasswordInput) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Check if user uses OAuth (no password to change)
    if (user.oauthProvider || !user.passwordHash) {
      throw new Error(
        "OAuth users cannot change password. Please use your OAuth provider."
      );
    }

    // Verify current password
    const isValidPassword = await this.comparePassword(
      data.currentPassword,
      user.passwordHash
    );

    if (!isValidPassword) {
      throw new Error("Current password is incorrect");
    }

    // Hash new password
    const newPasswordHash = await this.hashPassword(data.newPassword);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
      },
    });

    // Send confirmation email
    try {
      await emailService.sendPasswordChangedEmail(
        user.email,
        user.name || undefined
      );
    } catch (error) {
      this.fastify.log.error({ err: error }, 'Failed to send password changed email (non-critical)');
    }

    return {
      message: "Password changed successfully",
    };
  }

  // Password hashing utilities
  async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
