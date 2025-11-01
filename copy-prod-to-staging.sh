#!/bin/bash

# Direct Database Copy: Production → Staging (Using Docker)
# This avoids all version conflicts and connection issues

set -e

echo "🔄 Direct Database Copy: Production → Staging (Docker Method)"
echo "=============================================="

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Safety confirmation
echo "⚠️  WARNING: This will REPLACE ALL data in staging with production data"
read -p "Continue? (type 'yes' to confirm): " -r
if [[ ! $REPLY == "yes" ]]; then
    echo "Cancelled."
    exit 0
fi

# Database URLs
PROD_DB="postgresql://postgres:IBdHmFwKDoDzMYEyVyhuYBwgdaWayUiJ@caboose.proxy.rlwy.net:55655/railway"
STAGING_DB="postgresql://postgres:qwMkCAagSrcUMeTZSRQSBNCmQdMoRbvT@hopper.proxy.rlwy.net:47992/railway"

echo "📡 Database URLs configured"

# Create backup
echo "📦 Creating production backup using Docker..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="prod_backup_$TIMESTAMP.sql"

# Use Docker with PostgreSQL 16 to match Railway's version
docker run --rm postgres:16 pg_dump "$PROD_DB" \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    > "$BACKUP_FILE"

echo "✅ Backup created: $BACKUP_FILE ($(du -h $BACKUP_FILE | cut -f1))"

# Restore to staging
echo "📥 Restoring to staging database..."
docker run --rm -i postgres:16 psql "$STAGING_DB" < "$BACKUP_FILE"

echo "✅ Database copied successfully"

# Move backup to safe location
mkdir -p db-backups
mv "$BACKUP_FILE" db-backups/

echo ""
echo "=============================================="
echo "✅ Complete! Staging now has exact production data"
echo ""
echo "Backup saved in: db-backups/$BACKUP_FILE"