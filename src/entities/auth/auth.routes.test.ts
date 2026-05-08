import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';

vi.mock('../../services/email.service', () => ({
  emailService: {
    sendOTPEmail: vi.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

import { emailService } from '../../services/email.service';
import { buildTestApp } from '../../../test/helpers/build-test-app';
import { prisma } from '../../../test/helpers/db';
import { makeUser } from '../../../test/factories/user';
import { makeStudent } from '../../../test/factories/student';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('POST /api/auth/register/student', () => {
  it('creates a pending registration and sends an OTP email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register/student',
      payload: {
        email: 'newstudent@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'Student',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().requiresVerification).toBe(true);
    expect(emailService.sendOTPEmail).toHaveBeenCalledWith(
      'newstudent@example.com',
      expect.any(String),
      expect.any(String),
    );
  });

  it('returns 400 when the email is already registered and verified', async () => {
    await makeUser(prisma, { email: 'existing@example.com', emailVerified: true });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register/student',
      payload: {
        email: 'existing@example.com',
        password: 'password123',
        firstName: 'Dup',
        lastName: 'User',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Email already registered');
  });
});

describe('POST /api/auth/verify-otp', () => {
  it('creates the student and returns a JWT on a valid OTP', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register/student',
      payload: {
        email: 'verify@example.com',
        password: 'password123',
        firstName: 'Verify',
        lastName: 'Me',
      },
    });

    const otp = vi.mocked(emailService.sendOTPEmail).mock.calls.find(
      (c) => c[0] === 'verify@example.com',
    )![1] as string;

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-otp',
      payload: { email: 'verify@example.com', otp, userType: 'student' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.role).toBe('student');
  });

  it('returns 400 for an invalid OTP', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register/student',
      payload: {
        email: 'badotp@example.com',
        password: 'password123',
        firstName: 'Bad',
        lastName: 'Otp',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-otp',
      payload: { email: 'badotp@example.com', otp: '000000', userType: 'student' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Invalid or expired OTP');
  });
});

describe('POST /api/auth/login', () => {
  it('returns a JWT for valid student credentials', async () => {
    await makeStudent(prisma, { email: 'login@example.com', password: 'password123' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'login@example.com', password: 'password123', userType: 'student' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.role).toBe('student');
  });

  it('returns 401 for wrong password', async () => {
    await makeStudent(prisma, { email: 'wrongpass@example.com', password: 'correctpass' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'wrongpass@example.com', password: 'wrongpass', userType: 'student' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('Invalid credentials');
  });

  it('returns 401 for a non-existent email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@example.com', password: 'password123', userType: 'student' },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns the current user for a valid token', async () => {
    const { user, student } = await makeStudent(prisma);
    const token = app.jwt.sign({
      userId: user.id,
      role: 'student' as const,
      email: user.email,
      isAdmin: false,
      studentId: student.id,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe(user.email);
  });
});
