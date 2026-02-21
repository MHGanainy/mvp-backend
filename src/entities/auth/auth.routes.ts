// src/entities/auth/auth.routes.ts
import { FastifyInstance } from "fastify";
import { AuthService } from "./auth.service";
import {
  loginSchema,
  refreshTokenSchema,
  registerStudentSchema,
  registerInstructorSchema,
  verifyOTPSchema,
  resendOTPSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  googleAuthSchema,
} from "./auth.schema";

export default async function authRoutes(fastify: FastifyInstance) {
  const authService = new AuthService(fastify.prisma, fastify);

  // POST /auth/register/student - Student registration (now sends OTP)
  fastify.post("/auth/register/student", async (request, reply) => {
    try {
      const data = registerStudentSchema.parse(request.body);
      const result = await authService.registerStudent(data);
      reply.status(201).send(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Email already registered") {
          reply.status(400).send({ error: "Email already registered" });
        } else {
          reply.status(400).send({ error: "Invalid registration data" });
        }
      } else {
        reply.status(500).send({ error: "Internal server error" });
      }
    }
  });

  // POST /auth/register/instructor - Instructor registration (now sends OTP)
  fastify.post("/auth/register/instructor", async (request, reply) => {
    try {
      const data = registerInstructorSchema.parse(request.body);
      const result = await authService.registerInstructor(data);
      reply.status(201).send(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Email already registered") {
          reply.status(400).send({ error: "Email already registered" });
        } else {
          reply.status(400).send({ error: "Invalid registration data" });
        }
      } else {
        reply.status(500).send({ error: "Internal server error" });
      }
    }
  });

  // POST /auth/verify-otp - Verify email with OTP
  fastify.post("/auth/verify-otp", async (request, reply) => {
    try {
      const data = verifyOTPSchema.parse(request.body);
      const result = await authService.verifyOTP(data);
      reply.send(result);
    } catch (error) {
      if (error instanceof Error) {
        // Show specific error messages for common issues
        if (
          error.message === "No pending registration found for this email" ||
          error.message === "Invalid or expired OTP" ||
          error.message.includes("This registration is for") ||
          error.message === "Profile not found"
        ) {
          reply.status(400).send({ error: error.message });
        } else {
          // Log the actual error for debugging
          request.log.error({ err: error }, 'OTP verification error');
          reply
            .status(400)
            .send({ error: `OTP verification failed: ${error.message}` });
        }
      } else {
        reply.status(500).send({ error: "Internal server error" });
      }
    }
  });

  // POST /auth/resend-otp - Resend OTP
  fastify.post(
    "/auth/resend-otp",
    {
      config: {
        rateLimit: {
          max: 3, // Only 3 resends
          timeWindow: "10 minutes",
        },
      },
    },
    async (request, reply) => {
      try {
        const data = resendOTPSchema.parse(request.body);
        const result = await authService.resendOTP(data);
        reply.send(result);
      } catch (error) {
        if (error instanceof Error) {
          if (
            error.message === "No pending registration found for this email" ||
            error.message === "Failed to send OTP email"
          ) {
            reply.status(400).send({ error: error.message });
          } else {
            request.log.error({ err: error }, 'Resend OTP error');
            reply
              .status(400)
              .send({ error: `Failed to resend OTP: ${error.message}` });
          }
        } else {
          reply.status(500).send({ error: "Internal server error" });
        }
      }
    }
  );

  // POST /auth/login - Login endpoint
  fastify.post("/auth/login", async (request, reply) => {
    try {
      const data = loginSchema.parse(request.body);
      const result = await authService.login(data);
      reply.send(result);
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message === "Invalid credentials" ||
          error.message === "User is not a student" ||
          error.message === "User is not an instructor" ||
          error.message ===
            "Email not verified. Please verify your email before logging in." ||
          error.message ===
            "Please verify your email first. Check your inbox for the OTP code."
        ) {
          reply.status(401).send({ error: error.message });
        } else {
          reply.status(400).send({ error: "Invalid login data" });
        }
      } else {
        reply.status(500).send({ error: "Internal server error" });
      }
    }
  });

  // POST /auth/google - Google OAuth login
  fastify.post("/auth/google", async (request, reply) => {
    try {
      const data = googleAuthSchema.parse(request.body);
      const result = await authService.googleAuth(data);
      reply.send(result);
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message === "Invalid Google token" ||
          error.message === "Google email not verified"
        ) {
          reply.status(401).send({ error: error.message });
        } else {
          reply.status(400).send({ error: "Google authentication failed" });
        }
      } else {
        reply.status(500).send({ error: "Internal server error" });
      }
    }
  });

  // POST /auth/forgot-password - Request password reset
  fastify.post("/auth/forgot-password", async (request, reply) => {
    try {
      const data = forgotPasswordSchema.parse(request.body);
      const result = await authService.forgotPassword(data);
      reply.send(result);
    } catch (error) {
      reply.status(500).send({ error: "Internal server error" });
    }
  });

  // POST /auth/reset-password - Reset password with token
  fastify.post("/auth/reset-password", async (request, reply) => {
    try {
      const data = resetPasswordSchema.parse(request.body);
      const result = await authService.resetPassword(data);
      reply.send(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Invalid or expired reset token") {
          reply.status(400).send({ error: error.message });
        } else {
          reply.status(400).send({ error: "Password reset failed" });
        }
      } else {
        reply.status(500).send({ error: "Internal server error" });
      }
    }
  });

  // POST /auth/change-password - Change password (authenticated)
  fastify.post(
    "/auth/change-password",
    {
      preHandler: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch (err) {
          reply.status(401).send({ error: "Unauthorized" });
        }
      },
    },
    async (request, reply) => {
      try {
        const userId = (request.user as any).userId;
        const data = changePasswordSchema.parse(request.body);
        const result = await authService.changePassword(userId, data);
        reply.send(result);
      } catch (error) {
        if (error instanceof Error) {
          if (
            error.message === "Current password is incorrect" ||
            error.message ===
              "OAuth users cannot change password. Please use your OAuth provider."
          ) {
            reply.status(400).send({ error: error.message });
          } else {
            reply.status(400).send({ error: "Password change failed" });
          }
        } else {
          reply.status(500).send({ error: "Internal server error" });
        }
      }
    }
  );

  // POST /auth/refresh - Refresh token endpoint
  fastify.post("/auth/refresh", async (request, reply) => {
    try {
      const data = refreshTokenSchema.parse(request.body);
      const result = await authService.refreshToken(data.refreshToken);
      reply.send(result);
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid refresh token") {
        reply.status(401).send({ error: "Invalid refresh token" });
      } else {
        reply.status(400).send({ error: "Invalid request" });
      }
    }
  });

  // GET /auth/me - Get current user (requires authentication) - UPDATED
  // This is CORRECT - keep this implementation
  fastify.get(
    "/auth/me",
    {
      preHandler: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch (err) {
          reply.status(401).send({ error: "Unauthorized" });
        }
      },
    },
    async (request, reply) => {
      try {
        // Get info from JWT token
        const userId = (request.user as any).userId;
        const role = (request.user as any).role as "student" | "instructor";
        const isAdmin = (request.user as any).isAdmin || false;

        const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          include: {
            student: true,
            instructor: true,
          },
        });

        if (!user) {
          reply.status(404).send({ error: "User not found" });
          return;
        }

        // Build profile based on role from JWT
        let profile;
        if (role === "student" && user.student) {
          profile = {
            id: user.student.id,
            firstName: user.student.firstName,
            lastName: user.student.lastName,
            creditBalance: isAdmin ? 999999 : user.student.creditBalance,
          };
        } else if (role === "instructor" && user.instructor) {
          profile = {
            id: user.instructor.id,
            firstName: user.instructor.firstName,
            lastName: user.instructor.lastName,
            bio: user.instructor.bio,
          };
        } else {
          reply.status(500).send({ error: "Profile not found for user role" });
          return;
        }

        // Return structure matching old version - everything inside user
        reply.send({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: role, // ✓ Role INSIDE user
            isAdmin: isAdmin, // ✓ isAdmin INSIDE user
            profile,
          },
        });
      } catch (error) {
        reply.status(500).send({ error: "Failed to fetch user information" });
      }
    }
  );

  // POST /auth/logout - Logout endpoint (optional, mainly for client-side token removal)
  fastify.post(
    "/auth/logout",
    {
      preHandler: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch (err) {
          reply.status(401).send({ error: "Unauthorized" });
        }
      },
    },
    async (request, reply) => {
      // In a stateless JWT system, logout is handled client-side
      // You could implement token blacklisting here if needed
      reply.send({ message: "Logged out successfully" });
    }
  );
}
