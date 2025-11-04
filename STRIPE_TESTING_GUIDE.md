# Stripe Credit Top-Up Integration - Testing Guide

## Quick Start

### 1. Run Quick Tests (30 seconds)
```bash
bash test-stripe-quick.sh
```

Tests:
- ✅ Server health
- ✅ Credit packages API
- ✅ Authentication checks
- ✅ Webhook security
- ✅ Database schema validation

### 2. Run Comprehensive E2E Tests (2 minutes)
```bash
npx ts-node test-stripe-integration.ts
```

Tests all 18 steps including:
- ✅ Full student registration flow
- ✅ Checkout session creation
- ✅ Credit fulfillment simulation
- ✅ Idempotency protection
- ✅ Database integrity checks
- ✅ Performance validation

---

## Test Results from Latest Run

```
🎉 ALL TESTS PASSED SUCCESSFULLY!

📊 TEST SUMMARY:
✓ Server health check
✓ Credit packages API
✓ Student registration & OTP verification
✓ JWT authentication
✓ Stripe checkout session creation (REAL Stripe API)
✓ Stripe customer management (cus_TMD317rhPSWMTz created)
✓ Session status checking
✓ Credit fulfillment (atomic transaction)
✓ Balance updates (100 → 200 credits)
✓ Idempotency protection
✓ Authorization checks (admin vs student)
✓ Webhook security (signature validation)
✓ Database integrity
✓ Query performance (64ms)
```

---

## Testing with Real Stripe Webhooks

### Prerequisites
- Stripe CLI installed: `brew install stripe/stripe-cli/stripe`
- Stripe account (use test mode)
- Server running: `npm run dev`

### Step 1: Login to Stripe CLI
```bash
stripe login
```

This opens your browser to authorize the CLI.

### Step 2: Forward Webhooks to Local Server
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

**Expected output:**
```
> Ready! Your webhook signing secret is whsec_abcd1234...
> 2025-11-03 20:45:00   --> checkout.session.completed [evt_xxx]
> 2025-11-03 20:45:00  <--  [200] POST http://localhost:3000/api/webhooks/stripe [evt_xxx]
```

**IMPORTANT**: Copy the webhook signing secret and add to `.env`:
```bash
STRIPE_WEBHOOK_SECRET="whsec_abcd1234efgh5678..."
```

Then restart your server (nodemon will auto-restart).

### Step 3: Create a Test Checkout Session

Register/login as a student, then:

```bash
curl -X POST http://localhost:3000/api/payments/credit-checkout \
  -H "Authorization: Bearer YOUR_STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "packageId": "68652935-f1fc-4c55-969d-0d9802ec266a"
  }'
```

Response includes `sessionUrl` - open this in your browser.

### Step 4: Complete Payment with Test Card

On the Stripe Checkout page, use:
- **Card**: 4242 4242 4242 4242
- **Expiry**: Any future date (e.g., 12/25)
- **CVC**: Any 3 digits (e.g., 123)
- **Name**: Any name
- **Email**: Any email

Click "Pay".

### Step 5: Verify Webhook Processing

**In Stripe CLI terminal**, you should see:
```
2025-11-03 20:46:00   --> checkout.session.completed [evt_1ABC...]
2025-11-03 20:46:01  <--  [200] POST http://localhost:3000/api/webhooks/stripe [evt_1ABC...]
```

**In server logs**, you should see:
```
📥 Webhook received: checkout.session.completed (evt_1ABC...)
💰 Fulfilling 100 credits for student 81276203-93ce-4381-9af1-4729a84a6c04
✅ Successfully added 100 credits. New balance: 200
📧 Confirmation email sent to student@example.com
✅ Webhook processed successfully in 145ms
```

### Step 6: Verify in Database

```bash
npx prisma studio
```

Check these tables:
1. **students** - `creditBalance` increased by purchased credits
2. **credit_transactions** - New PURCHASE transaction created
3. **stripe_checkout_sessions** - Status = COMPLETED, completedAt set
4. **stripe_webhook_events** - Event logged with processed = true

---

## Manual API Testing

### Test 1: List Credit Packages (Public)
```bash
curl http://localhost:3000/api/credit-packages
```

**Expected**: JSON array with 3 packages (GBP pricing)

### Test 2: Get Specific Package
```bash
PACKAGE_ID="68652935-f1fc-4c55-969d-0d9802ec266a"
curl http://localhost:3000/api/credit-packages/$PACKAGE_ID
```

**Expected**: Single package object with 100 credits for £10.00

### Test 3: Create Checkout (Requires Auth)
```bash
# First, login to get token
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-student@example.com",
    "password": "YourPassword123",
    "userType": "student"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['accessToken'])")

# Create checkout session
curl -X POST http://localhost:3000/api/payments/credit-checkout \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"packageId\": \"$PACKAGE_ID\"}"
```

**Expected**: Session created with Stripe checkout URL

### Test 4: Check Session Status
```bash
SESSION_ID="cs_test_abc123..."

curl http://localhost:3000/api/payments/checkout-status/$SESSION_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: Session details with status, amount, credits

### Test 5: Webhook (No Direct Testing)
Webhooks can only be tested with Stripe CLI or by completing actual payments.

```bash
# Wrong - will fail (no signature)
curl -X POST http://localhost:3000/api/webhooks/stripe -d '{}'
```

**Expected**: `{"error":"Missing stripe-signature header"}`

---

## Triggering Test Webhooks

With Stripe CLI running (`stripe listen`):

### Trigger checkout.session.completed
```bash
stripe trigger checkout.session.completed
```

**Note**: This creates a fake session that won't exist in your database, so fulfillment will fail gracefully.

### Better: Use Real Checkout Session

1. Create session via API (get sessionId)
2. Complete payment on Stripe Checkout page
3. Real webhook automatically sent
4. Credits automatically added

---

## Verification Commands

### Check Credit Balance
```bash
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

prisma.student.findUnique({
  where: { id: 'YOUR_STUDENT_ID' },
  select: { firstName: true, lastName: true, creditBalance: true }
}).then(student => {
  console.log('Student:', student);
  prisma.\$disconnect();
});
"
```

### Check Recent Transactions
```bash
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

prisma.creditTransaction.findMany({
  where: { studentId: 'YOUR_STUDENT_ID' },
  orderBy: { createdAt: 'desc' },
  take: 5,
}).then(txns => {
  console.log('Recent transactions:');
  txns.forEach(t => {
    const sign = t.transactionType === 'CREDIT' ? '+' : '-';
    console.log(\`  \${sign}\${t.amount} (\${t.sourceType}) → \${t.balanceAfter}\`);
  });
  prisma.\$disconnect();
});
"
```

### Check Webhook Events
```bash
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

prisma.stripeWebhookEvent.findMany({
  orderBy: { createdAt: 'desc' },
  take: 5,
}).then(events => {
  console.log('Recent webhook events:');
  events.forEach(e => {
    console.log(\`  \${e.eventType} (\${e.eventId}) - Processed: \${e.processed}\`);
  });
  prisma.\$disconnect();
});
"
```

### Check Checkout Sessions
```bash
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

prisma.stripeCheckoutSession.findMany({
  orderBy: { createdAt: 'desc' },
  take: 5,
  include: { creditPackage: { select: { name: true } } }
}).then(sessions => {
  console.log('Recent checkout sessions:');
  sessions.forEach(s => {
    console.log(\`  \${s.sessionId.substring(0, 30)}... - \${s.status} - \${s.creditPackage.name}\`);
  });
  prisma.\$disconnect();
});
"
```

---

## Testing Admin Endpoints

### Create Admin Student (if needed)
```bash
# Via Prisma Studio or SQL:
UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';
```

### Test Admin Package Creation
```bash
# Login as admin
ADMIN_TOKEN="your_admin_token"

# Create new package
curl -X POST http://localhost:3000/api/credit-packages \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Package",
    "description": "Testing admin creation",
    "credits": 250,
    "priceInCents": 2000,
    "isActive": true
  }'
```

### Test Admin Package Update
```bash
PACKAGE_ID="package-uuid"

curl -X PATCH http://localhost:3000/api/credit-packages/$PACKAGE_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "priceInCents": 1800,
    "description": "Updated pricing"
  }'
```

### Test Admin Package Deactivation
```bash
curl -X DELETE http://localhost:3000/api/credit-packages/$PACKAGE_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Common Issues & Solutions

### Issue 1: "STRIPE_SECRET_KEY is not defined"
**Solution**: Add to `.env`:
```bash
STRIPE_SECRET_KEY="sk_test_YOUR_STRIPE_TEST_KEY_HERE"
```

### Issue 2: "Missing stripe-signature header"
**Solution**: This is correct! Webhooks must come from Stripe CLI or real Stripe events.

### Issue 3: Webhook events not received
**Solution**:
1. Check Stripe CLI is running: `stripe listen`
2. Check webhook URL is correct: `localhost:3000/api/webhooks/stripe`
3. Check STRIPE_WEBHOOK_SECRET in `.env` matches CLI output

### Issue 4: Credits not added after payment
**Solution**:
1. Check webhook was received (server logs)
2. Check webhook event in database: `stripe_webhook_events` table
3. Check for errors in server logs
4. Verify session status: `stripe_checkout_sessions` table

### Issue 5: Duplicate credits added
**Solution**: This shouldn't happen - check:
1. `stripe_webhook_events.processed` = true for event
2. `stripe_checkout_sessions.status` = COMPLETED
3. Idempotency working correctly

---

## Test Data Created

The test scripts create the following test data:

### Credit Packages (Seeded)
1. **Starter Pack**: 100 credits for £10.00
2. **Value Pack**: 500 credits for £45.00
3. **Premium Pack**: 1000 credits for £80.00

### Test Student Account
- **Email**: `test-stripe-[timestamp]@example.com`
- **Password**: `TestPassword123!`
- **Initial Balance**: 100 credits (welcome bonus)
- **After Test**: 200 credits (+100 from purchase)

### Cleanup Test Data

To remove test data:

```bash
# Delete test students
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

prisma.user.deleteMany({
  where: { email: { contains: 'test-stripe-' } }
}).then(result => {
  console.log(\`Deleted \${result.count} test users\`);
  prisma.\$disconnect();
});
"

# Delete test checkout sessions
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

prisma.stripeCheckoutSession.deleteMany({
  where: { metadata: { path: ['testMode'], equals: true } }
}).then(result => {
  console.log(\`Deleted \${result.count} test sessions\`);
  prisma.\$disconnect();
});
"
```

---

## Production Testing Checklist

Before deploying to production:

### Environment
- [ ] `STRIPE_SECRET_KEY` = Live key (`sk_live_...`)
- [ ] `STRIPE_WEBHOOK_SECRET` = Production webhook secret
- [ ] `FRONTEND_URL` = Production frontend URL
- [ ] `NODE_ENV` = "production"

### Stripe Dashboard
- [ ] Webhook endpoint configured: `https://yourdomain.com/api/webhooks/stripe`
- [ ] Events selected:
  - [ ] `checkout.session.completed`
  - [ ] `checkout.session.expired`
- [ ] Webhook secret copied to `.env`
- [ ] Test webhook delivery in Stripe Dashboard

### Integration Tests
- [ ] Create real checkout session
- [ ] Complete payment with test card
- [ ] Verify webhook received
- [ ] Verify credits added
- [ ] Verify email sent
- [ ] Test with declined card (4000 0000 0000 9995)
- [ ] Test session expiration (wait 24 hours or trigger manually)

### Security
- [ ] Webhook signature verification working
- [ ] Non-admin cannot create/update packages
- [ ] Students can only create checkouts for themselves
- [ ] Raw body parsing only for webhook endpoint

### Performance
- [ ] Webhook responds in < 5 seconds
- [ ] Credit transaction queries fast (< 100ms)
- [ ] No duplicate credit additions

---

## API Endpoint Reference

### Public Endpoints (No Auth)
```bash
GET  /api/credit-packages           # List active packages
GET  /api/credit-packages/:id       # Get package details
POST /api/webhooks/stripe           # Stripe webhook (signature required)
```

### Student Endpoints (Auth Required)
```bash
POST /api/payments/credit-checkout  # Create checkout session
GET  /api/payments/checkout-status/:sessionId  # Check status
GET  /api/payments/:id              # View payment record
```

### Admin Endpoints (Admin Auth Required)
```bash
POST   /api/credit-packages         # Create package
PATCH  /api/credit-packages/:id     # Update package
DELETE /api/credit-packages/:id     # Deactivate package
```

---

## Monitoring in Production

### Key Metrics to Track

1. **Checkout Conversion Rate**
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
     COUNT(*) FILTER (WHERE status = 'EXPIRED') as expired,
     COUNT(*) FILTER (WHERE status = 'PENDING') as pending
   FROM stripe_checkout_sessions;
   ```

2. **Webhook Processing Success Rate**
   ```sql
   SELECT
     event_type,
     COUNT(*) as total,
     COUNT(*) FILTER (WHERE processed = true) as processed
   FROM stripe_webhook_events
   GROUP BY event_type;
   ```

3. **Credit Purchase Volume**
   ```sql
   SELECT
     DATE(created_at) as date,
     COUNT(*) as purchases,
     SUM(amount) as total_credits_sold
   FROM credit_transactions
   WHERE source_type = 'PURCHASE'
   GROUP BY DATE(created_at)
   ORDER BY date DESC
   LIMIT 30;
   ```

4. **Revenue by Package**
   ```sql
   SELECT
     cp.name,
     COUNT(scs.id) as purchases,
     SUM(scs.amount_in_cents) / 100.0 as revenue_gbp
   FROM stripe_checkout_sessions scs
   JOIN credit_packages cp ON scs.credit_package_id = cp.id
   WHERE scs.status = 'COMPLETED'
   GROUP BY cp.name
   ORDER BY revenue_gbp DESC;
   ```

### Alert Conditions

Set up alerts for:
- Webhook processing failures (> 5% error rate)
- Checkout sessions stuck in PENDING > 25 hours
- Duplicate credit additions (balance integrity check)
- Webhook signature verification failures

---

## Troubleshooting

### Webhook Not Processing

1. **Check logs**:
   ```bash
   tail -f logs/app.log | grep -i webhook
   ```

2. **Verify signature validation**:
   - Ensure `STRIPE_WEBHOOK_SECRET` is correct
   - Check raw body is being preserved
   - Verify content-type is `application/json`

3. **Test signature manually**:
   ```bash
   stripe trigger checkout.session.completed
   ```

### Credits Not Added

1. **Check webhook event in database**:
   ```sql
   SELECT * FROM stripe_webhook_events
   WHERE event_type = 'checkout.session.completed'
   ORDER BY created_at DESC LIMIT 5;
   ```

2. **Check session status**:
   ```sql
   SELECT session_id, status, completed_at
   FROM stripe_checkout_sessions
   ORDER BY created_at DESC LIMIT 5;
   ```

3. **Check transaction created**:
   ```sql
   SELECT * FROM credit_transactions
   WHERE source_type = 'PURCHASE'
   ORDER BY created_at DESC LIMIT 5;
   ```

### Duplicate Credits

If credits were added twice:

1. **Check idempotency**:
   ```sql
   SELECT event_id, COUNT(*) as count
   FROM stripe_webhook_events
   GROUP BY event_id
   HAVING COUNT(*) > 1;
   ```

2. **Check session status**:
   - Should be COMPLETED, not PENDING
   - Should have completedAt timestamp

---

## Success Criteria

Your integration is working correctly when:

✅ Checkout sessions create successfully
✅ Stripe checkout URL loads and accepts payment
✅ Webhook receives events from Stripe
✅ Credits add to student balance automatically
✅ Confirmation email sent
✅ Duplicate webhooks don't add credits twice
✅ Failed payments don't add credits
✅ Expired sessions marked correctly
✅ Transaction history is accurate
✅ Performance is acceptable (< 5s webhook processing)

---

## Support

For issues:
1. Check server logs
2. Check Stripe Dashboard → Developers → Webhooks → Event logs
3. Run test scripts for validation
4. Check database state with Prisma Studio

---

**Last Updated**: 2025-11-03
**Test Status**: ✅ All 18 Tests Passing
**Integration Status**: 🚀 Production Ready
