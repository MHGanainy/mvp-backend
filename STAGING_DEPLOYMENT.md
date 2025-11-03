# Staging Deployment Guide

## Latest Changes Pulled from Staging

### New Features Added
1. ✅ **Email Service** - OTP verification, password reset emails
2. ✅ **OAuth Authentication** - Google Sign-In support
3. ✅ **Pending Registrations** - Users only created after OTP verification
4. ✅ **Transcript Processing** - AI feedback generation from database transcripts
5. ✅ **Enhanced .gitignore** - Comprehensive file exclusions

### New Dependencies
- `nodemailer` - Email sending
- `@types/nodemailer` - TypeScript types
- `google-auth-library` - Google OAuth verification

---

## Pre-Deployment Checklist

### 1. Environment Variables (CRITICAL)

Update your **Railway staging environment** with these variables:

#### Required Variables

```bash
# Database (already set)
DATABASE_URL="postgresql://postgres:qwMkCAagSrcUMeTZSRQSBNCmQdMoRbvT@hopper.proxy.rlwy.net:47992/railway"

# Authentication (already set)
JWT_SECRET="your-jwt-secret"
VOICE_AGENT_SHARED_SECRET="2c99e4f256738c811fda12c7702f6886505d8435d6a65ee21e17022b1be208c0"

# LiveKit (update to staging URL)
LIVEKIT_SERVICE_URL="https://orchestrator-staging-c1dc.up.railway.app"

# AI Services - Groq (REQUIRED for feedback generation)
GROQ_API_KEY="gsk_your-groq-api-key"

# AI Services - OpenAI (optional fallback)
OPENAI_API_KEY="sk-proj-your-openai-api-key"

# Stripe (already set)
STRIPE_SECRET_KEY="sk_test_your-stripe-secret-key"
STRIPE_WEBHOOK_SECRET="whsec_your-stripe-webhook-secret"

# Environment
NODE_ENV="staging"
PORT=3000
```

#### NEW Required Variables for Email Features

```bash
# SMTP Email Configuration (REQUIRED for OTP/password reset)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-staging-email@gmail.com"
SMTP_PASS="your-gmail-app-password"

# Application Details
APP_NAME="MedGrader Staging"
FRONTEND_URL="https://your-staging-frontend.vercel.app"
```

#### Optional Variables

```bash
# Google OAuth (optional - only if enabling Google Sign-In)
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
```

---

## Deployment Steps

### Step 1: Set Environment Variables in Railway

**In Railway Dashboard:**

1. Go to your staging backend service
2. Navigate to **Variables** tab
3. Add the following NEW variables:

```
GROQ_API_KEY = gsk_your_actual_groq_key
SMTP_HOST = smtp.gmail.com
SMTP_PORT = 587
SMTP_SECURE = false
SMTP_USER = your-email@gmail.com
SMTP_PASS = your-app-password
APP_NAME = MedGrader Staging
FRONTEND_URL = https://your-staging-frontend-url
```

4. Update existing variable:
```
LIVEKIT_SERVICE_URL = https://orchestrator-staging-c1dc.up.railway.app
NODE_ENV = staging
```

### Step 2: Run Database Migrations

**Option A: Automatic (if Railway auto-deploys)**

Railway will run `npm run postinstall` which includes `prisma generate`.

You need to manually run the SQL migrations:

```bash
# Connect to staging database
psql "postgresql://postgres:qwMkCAagSrcUMeTZSRQSBNCmQdMoRbvT@hopper.proxy.rlwy.net:47992/railway"

# Run migration 1
\i migrations/add_auth_features.sql

# Run migration 2
\i migrations/add_pending_registrations.sql

# Verify tables
\dt
\d users
\d pending_registrations
```

**Option B: Via Railway CLI**

```bash
# Run migrations via Railway
railway run psql $DATABASE_URL < migrations/add_auth_features.sql
railway run psql $DATABASE_URL < migrations/add_pending_registrations.sql
```

**Option C: Via Direct Connection**

```bash
# From your local machine
psql "postgresql://postgres:qwMkCAagSrcUMeTZSRQSBNCmQdMoRbvT@hopper.proxy.rlwy.net:47992/railway" \
  -f migrations/add_auth_features.sql

psql "postgresql://postgres:qwMkCAagSrcUMeTZSRQSBNCmQdMoRbvT@hopper.proxy.rlwy.net:47992/railway" \
  -f migrations/add_pending_registrations.sql
```

### Step 3: Deploy to Railway

**If auto-deploy is enabled:**
```bash
# Push to staging branch (already done)
git push origin staging
```

Railway will automatically:
1. Pull latest staging code
2. Run `npm install` (install new dependencies)
3. Run `npm run postinstall` (prisma generate)
4. Run `npm run build` (compile TypeScript)
5. Run `npm start` (start server)

**If manual deploy:**
```bash
# In Railway dashboard, click "Deploy" on staging service
```

### Step 4: Verify Deployment

**Check logs in Railway:**
```
[Server] Server started on port 3000
[Prisma] Database connection established
[LiveKit] Service URL: https://orchestrator-staging-c1dc.up.railway.app
[Email] SMTP configured: smtp.gmail.com:587
```

**Test health endpoint:**
```bash
curl https://your-staging-backend.railway.app/health
```

**Test new email functionality:**
```bash
# Register new user (should send OTP email)
curl -X POST https://your-staging-backend.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "firstName": "Test",
    "lastName": "User",
    "userType": "student"
  }'

# Should return: "Registration initiated. Please check your email for OTP."
```

---

## Post-Deployment Verification

### 1. Check Database Migrations

```sql
-- Connect to staging database
psql "postgresql://postgres:qwMkCAagSrcUMeTZSRQSBNCmQdMoRbvT@hopper.proxy.rlwy.net:47992/railway"

-- Verify new columns in users table
\d users
-- Should see: oauth_provider, oauth_provider_id, email_verification_otp, etc.

-- Verify pending_registrations table exists
\d pending_registrations

-- Check if any pending registrations exist
SELECT COUNT(*) FROM pending_registrations;
```

### 2. Test Feedback Generation

```bash
# Complete a simulation (with transcript from orchestrator)
curl -X PATCH https://your-staging-backend.railway.app/api/simulation-attempts/{id}/complete-with-transcript \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json"

# Should process transcript and generate AI feedback using Groq
```

### 3. Test Email Service

Check that OTP emails are being sent:
- Register new user
- Check inbox for OTP code
- Verify email template renders correctly

### 4. Monitor Logs

Watch for:
- ✅ `[Email] OTP sent successfully`
- ✅ `[SimulationAttempt] Transcript processed: X messages`
- ✅ `[SimulationAttempt] AI feedback generated successfully`
- ❌ Any errors related to missing env variables

---

## Required External Services

### 1. SMTP Email Service

**Recommended: Gmail with App Password**

Setup steps:
1. Go to Google Account settings
2. Enable 2-Factor Authentication
3. Generate App Password for "Mail"
4. Use in `SMTP_PASS` variable

Alternative SMTP providers:
- SendGrid
- Mailgun
- AWS SES
- Resend

### 2. Groq API Key

**Get API key:**
1. Go to https://console.groq.com
2. Sign up or log in
3. Create API key
4. Add to Railway: `GROQ_API_KEY=gsk_...`

**Cost:** Free tier available, ~$0.10 per 1M tokens

### 3. Google OAuth (Optional)

**Only needed if enabling "Sign in with Google"**

Setup:
1. Go to Google Cloud Console
2. Create OAuth 2.0 credentials
3. Add authorized origins: `https://your-staging-frontend.vercel.app`
4. Add to Railway: `GOOGLE_CLIENT_ID=...`

---

## Troubleshooting

### Issue: "GROQ_API_KEY not set"

**Error:**
```
Failed to generate AI feedback: No API key provided
```

**Fix:**
```bash
# Add to Railway environment variables
GROQ_API_KEY=gsk_your_actual_key
```

### Issue: "Failed to send email"

**Error:**
```
[Email] Failed to send OTP: Invalid login
```

**Fix:**
1. Check SMTP credentials are correct
2. Verify Gmail App Password (not regular password)
3. Check SMTP_HOST and SMTP_PORT
4. Try test email:
   ```bash
   # In Railway shell
   node -e "console.log(process.env.SMTP_USER)"
   ```

### Issue: "Transcript not found"

**Error:**
```
No transcript found in database after session end
```

**Cause:** LiveKit orchestrator didn't save transcript

**Fix:**
1. Check orchestrator is running: `https://orchestrator-staging-c1dc.up.railway.app/health`
2. Verify `LIVEKIT_SERVICE_URL` points to staging orchestrator
3. Check orchestrator logs for errors

### Issue: Migration Fails

**Error:**
```
relation "pending_registrations" already exists
```

**Fix:**
```sql
-- Migrations are idempotent with IF NOT EXISTS
-- Just re-run them, they'll skip existing items
```

---

## Environment Variable Checklist

Use this checklist to verify all variables are set:

### Critical (Required)
- [ ] `DATABASE_URL` - Staging database connection
- [ ] `JWT_SECRET` - Authentication secret
- [ ] `GROQ_API_KEY` - AI feedback generation
- [ ] `LIVEKIT_SERVICE_URL` - Voice orchestrator (staging URL)
- [ ] `VOICE_AGENT_SHARED_SECRET` - Webhook authentication
- [ ] `SMTP_HOST` - Email server
- [ ] `SMTP_PORT` - Email port
- [ ] `SMTP_USER` - Email username
- [ ] `SMTP_PASS` - Email password/app password
- [ ] `APP_NAME` - Application name
- [ ] `FRONTEND_URL` - Frontend URL for email links
- [ ] `NODE_ENV` - Should be "staging"

### Optional
- [ ] `OPENAI_API_KEY` - Fallback AI provider
- [ ] `STRIPE_SECRET_KEY` - Payment processing
- [ ] `STRIPE_WEBHOOK_SECRET` - Stripe webhooks
- [ ] `GOOGLE_CLIENT_ID` - Google OAuth
- [ ] `PORT` - Server port (defaults to 3000)

---

## Quick Deploy Commands

```bash
# 1. Ensure you have latest staging code
git checkout staging
git pull origin staging

# 2. Run migrations on staging database
psql "postgresql://postgres:qwMkCAagSrcUMeTZSRQSBNCmQdMoRbvT@hopper.proxy.rlwy.net:47992/railway" \
  -f migrations/add_auth_features.sql

psql "postgresql://postgres:qwMkCAagSrcUMeTZSRQSBNCmQdMoRbvT@hopper.proxy.rlwy.net:47992/railway" \
  -f migrations/add_pending_registrations.sql

# 3. Railway will auto-deploy from staging branch
# Or manually trigger deploy in Railway dashboard

# 4. Verify deployment
curl https://your-staging-backend.railway.app/health
```

---

## Summary

**What's New in Staging:**
- Email OTP verification
- Password reset via email
- Google OAuth support (optional)
- AI feedback from database transcripts
- Transcript message merging
- Clean transcript format
- Enhanced .gitignore

**What You Need:**
1. ✅ GROQ API key
2. ✅ Gmail SMTP credentials
3. ✅ Frontend URL for email links
4. ✅ Run 2 SQL migrations
5. ⚠️ Google OAuth (optional)

**Deployment Time:** ~5-10 minutes (mostly waiting for Railway)

**Breaking Changes:** None - backward compatible
