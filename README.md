MVP-BACKEND


# 1. Link to your Railway project (if not already linked)
railway link

# 2. Set your database connection
railway variables --set DATABASE_URL="postgresql://postgres:IBdHmFwKDoDzMYEyVyhuYBwgdaWayUiJ@caboose.proxy.rlwy.net:55655/railway"

# 3. Set environment
railway variables --set NODE_ENV="production"

# 4. Deploy your app
railway up



# Run migrations on Railway
railway run npx prisma migrate deploy

# Or if that doesn't work, try:
railway run npx prisma db push


# Check your variables are set
railway variables

# Check deployment logs
railway logs

Reset Database:
Local: Stop prisma dev and restart
Production:
railway run npx prisma migrate reset
railway run npx prisma migrate deploy


View Database:
Local: npx prisma studio
Production: railway run npx prisma studio


npx prisma migrate dev --name add-curriculum


