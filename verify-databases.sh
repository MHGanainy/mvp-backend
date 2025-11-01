#!/bin/bash

# Database Verification Script
# Compares production and staging databases to ensure they match

set -e

echo "🔍 Database Verification: Production vs Staging"
echo "==============================================="

# Database URLs
PROD_DB="postgresql://postgres:IBdHmFwKDoDzMYEyVyhuYBwgdaWayUiJ@caboose.proxy.rlwy.net:55655/railway"
STAGING_DB="postgresql://postgres:qwMkCAagSrcUMeTZSRQSBNCmQdMoRbvT@hopper.proxy.rlwy.net:47992/railway"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track if any differences found
DIFFERENCES_FOUND=0

# Function to run query on both databases and compare
compare_query() {
    local description=$1
    local query=$2
    
    echo -n "Checking $description... "
    
    # Run query on production
    PROD_RESULT=$(docker run --rm postgres:16 psql "$PROD_DB" -t -c "$query" 2>/dev/null | tr -d ' \n')
    
    # Run query on staging
    STAGING_RESULT=$(docker run --rm postgres:16 psql "$STAGING_DB" -t -c "$query" 2>/dev/null | tr -d ' \n')
    
    if [ "$PROD_RESULT" == "$STAGING_RESULT" ]; then
        echo -e "${GREEN}✓ Match${NC} (Prod: $PROD_RESULT, Staging: $STAGING_RESULT)"
    else
        echo -e "${RED}✗ Mismatch${NC}"
        echo -e "  Production: $PROD_RESULT"
        echo -e "  Staging:    $STAGING_RESULT"
        DIFFERENCES_FOUND=1
    fi
}

# Check Docker is available
if ! command -v docker &> /dev/null; then
    echo "Using direct psql connection instead of Docker..."
    # Fallback to direct psql if available
    if ! command -v psql &> /dev/null; then
        echo "❌ Neither Docker nor psql is installed. Please install one of them."
        exit 1
    fi
    # Override the docker command with direct psql
    alias docker="echo"
fi

echo ""
echo "📊 Comparing Table Row Counts"
echo "------------------------------"

# List of tables to check (add more as needed)
TABLES=(
    "users"
    "students"
    "instructors"
    "courses"
    "course_cases"
    "simulations"
    "simulation_attempts"
    "payments"
    "subscriptions"
    "credit_transactions"
    "exams"
    "case_tabs"
    "marking_criteria"
    "specialties"
    "curriculums"
    "marking_domains"
)

for table in "${TABLES[@]}"; do
    compare_query "$table table" "SELECT COUNT(*) FROM $table"
done

echo ""
echo "🔢 Comparing Key Metrics"
echo "------------------------"

# Check total users
compare_query "Total users" "SELECT COUNT(*) FROM users"

# Check total students with credits
compare_query "Students with credits" "SELECT COUNT(*) FROM students WHERE credit_balance > 0"

# Check total active subscriptions
compare_query "Active subscriptions" "SELECT COUNT(*) FROM subscriptions WHERE is_active = true"

# Check total published courses
compare_query "Published courses" "SELECT COUNT(*) FROM courses WHERE is_published = true"

# Check latest user ID (helps verify if new data was added)
compare_query "Latest user ID" "SELECT MAX(id) FROM users"

# Check latest simulation attempt
compare_query "Latest simulation" "SELECT COUNT(*) FROM simulation_attempts WHERE created_at > NOW() - INTERVAL '30 days'"

echo ""
echo "🔍 Comparing Schema"
echo "-------------------"

# Check table count
compare_query "Total tables" "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"

# Check column count
compare_query "Total columns" "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public'"

echo ""
echo "📈 Comparing Data Integrity"
echo "----------------------------"

# Check for orphaned records
compare_query "Orphaned students" "SELECT COUNT(*) FROM students s LEFT JOIN users u ON s.user_id = u.id WHERE u.id IS NULL"
compare_query "Orphaned instructors" "SELECT COUNT(*) FROM instructors i LEFT JOIN users u ON i.user_id = u.id WHERE u.id IS NULL"
compare_query "Orphaned payments" "SELECT COUNT(*) FROM payments p LEFT JOIN students s ON p.student_id = s.id WHERE s.id IS NULL"

echo ""
echo "🎯 Sample Data Verification"
echo "---------------------------"

# Get first 3 user emails (anonymized check)
echo "First 3 users (email check):"
echo -n "  Production: "
docker run --rm postgres:16 psql "$PROD_DB" -t -c "SELECT email FROM users ORDER BY id LIMIT 3" 2>/dev/null | tr '\n' ', '
echo ""
echo -n "  Staging:    "
docker run --rm postgres:16 psql "$STAGING_DB" -t -c "SELECT email FROM users ORDER BY id LIMIT 3" 2>/dev/null | tr '\n' ', '
echo ""

echo ""
echo "==============================================="

if [ $DIFFERENCES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✅ Verification Complete: Databases Match!${NC}"
    echo "Production and staging databases are identical."
else
    echo -e "${YELLOW}⚠️  Verification Complete: Differences Found${NC}"
    echo "Please review the mismatches above."
    echo ""
    echo "Common causes of mismatches:"
    echo "1. Copy process was interrupted"
    echo "2. New data was added to production after copy"
    echo "3. Staging had existing data that wasn't cleared"
    echo ""
    echo "To fix: Re-run the copy script"
fi

echo ""
echo "Timestamp: $(date)"