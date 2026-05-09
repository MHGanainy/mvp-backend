# Test Harness — Quick Reference

## Setup

1. Copy `.env.test.example` to `.env.test` and set `DATABASE_URL` to your local test Postgres DB.
2. Run migrations once: `DATABASE_URL=<test-db-url> npx prisma migrate deploy`
3. Run tests: `npm test`

## Running tests

```bash
npm test              # run all tests once
npm run test:watch    # re-run on file save (TDD mode)
npm run test:focus    # verbose output
npx vitest run src/entities/auth/auth.routes.test.ts  # single file
```

## How each test file is structured

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp } from '../../../test/helpers/build-test-app';
import { prisma } from '../../../test/helpers/db';

let app: FastifyInstance;
beforeAll(async () => { app = await buildTestApp(); });
afterAll(async () => { await app.close(); });
```

`beforeEach` in `test/setup.ts` truncates all tables automatically before every test. No manual cleanup needed.

## Factories

Factories live in `test/factories/`. Each creates a real DB row and returns it.

```ts
import { makeStudent } from '../../../test/factories/student';
import { makeInstructor } from '../../../test/factories/instructor';
import { makeExam } from '../../../test/factories/exam';
import { makeCourse } from '../../../test/factories/course';
import { makeSpecialty } from '../../../test/factories/specialty';
import { makeCreditPackage } from '../../../test/factories/credit-package';

// Minimal — defaults fill everything:
const { user, student } = await makeStudent(prisma);

// With overrides:
const { user, student } = await makeStudent(prisma, {
  email: 'alice@example.com',
  password: 'secret123',   // will be bcrypt-hashed
  creditBalance: 100,
});

// Composed — makeCourse creates an instructor + exam if not supplied:
const course = await makeCourse(prisma);

// Shared parent — two courses under the same exam:
const exam = await makeExam(prisma);
const courseA = await makeCourse(prisma, { examId: exam.id, instructorId: exam.instructorId });
const courseB = await makeCourse(prisma, { examId: exam.id, instructorId: exam.instructorId });
```

## Auth helpers

```ts
import { loginAsStudent, loginAsInstructor, loginAsAdmin } from '../../../test/helpers/auth';

const { token, user, student, headers } = await loginAsStudent(app, prisma);
const { headers } = await loginAsInstructor(app, prisma);
const { headers } = await loginAsAdmin(app, prisma);

// Use headers in inject:
await app.inject({ method: 'GET', url: '/api/...', headers });
```

## Mocking external services

Declare the mock at the top of the test file **before** any imports that use it:

```ts
vi.mock('../../services/email.service', () => ({
  emailService: {
    sendOTPEmail: vi.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  },
}));
import { emailService } from '../../services/email.service';
```

Capture the OTP sent during registration:
```ts
const otp = vi.mocked(emailService.sendOTPEmail).mock.calls
  .find((c) => c[0] === 'user@example.com')![1] as string;
```

See `test/mocks/` for pre-built mock factories for Stripe, LiveKit, OpenAI, S3, and Google OAuth.

## Authz checklist

Every route test file **must** include these cases:

```ts
it('requires authentication', async () => { /* no auth header → 401 */ });
it('rejects wrong role', async () => { /* student on instructor route → 403 */ });
it('rejects cross-user access', async () => { /* student A accessing student B's data → 403 */ });
it('allows admin to access any resource', async () => { /* admin → 200 */ });
```
