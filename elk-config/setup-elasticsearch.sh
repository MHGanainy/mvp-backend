#!/bin/bash
# =============================================================================
# Elasticsearch Setup Script for MVP Backend Logging
# =============================================================================
# Creates ILM policy and index template for API logs
#
# Usage (from inside Docker network or with port forwarding):
#   ./setup-elasticsearch.sh
#
# Required environment variables:
#   ELASTIC_PASSWORD - Password for elastic user
#
# Optional:
#   ELASTICSEARCH_HOST - Default: localhost
#   ELASTICSEARCH_PORT - Default: 9200
#   CA_CERT_PATH - Path to CA certificate for SSL
# =============================================================================

set -e

# Configuration
ES_HOST="${ELASTICSEARCH_HOST:-localhost}"
ES_PORT="${ELASTICSEARCH_PORT:-9200}"
ES_URL="https://${ES_HOST}:${ES_PORT}"
ES_USER="elastic"
ES_PASS="${ELASTIC_PASSWORD:?ELASTIC_PASSWORD environment variable is required}"
CA_CERT="${CA_CERT_PATH:-./certs/ca.crt}"

# Check if CA cert exists
if [ ! -f "$CA_CERT" ]; then
  echo "WARNING: CA certificate not found at $CA_CERT"
  echo "Using -k flag to skip certificate verification (not recommended for production)"
  CURL_OPTS="-k"
else
  CURL_OPTS="--cacert $CA_CERT"
fi

echo "=================================================="
echo "Setting up Elasticsearch for MVP Backend Logging"
echo "=================================================="
echo "Elasticsearch URL: ${ES_URL}"
echo ""

# Check Elasticsearch connectivity
echo "1. Checking Elasticsearch connectivity..."
if ! curl -s $CURL_OPTS -u "${ES_USER}:${ES_PASS}" "${ES_URL}/_cluster/health" > /dev/null; then
  echo "ERROR: Cannot connect to Elasticsearch at ${ES_URL}"
  exit 1
fi
echo "   ✓ Elasticsearch is reachable"

# Create ILM Policy
echo ""
echo "2. Creating ILM policy (30-day retention)..."
curl -s -X PUT $CURL_OPTS -u "${ES_USER}:${ES_PASS}" \
  "${ES_URL}/_ilm/policy/api-logs-policy" \
  -H "Content-Type: application/json" \
  -d @elasticsearch-ilm-policy.json
echo ""
echo "   ✓ ILM policy created"

# Create Index Template
echo ""
echo "3. Creating index template..."
curl -s -X PUT $CURL_OPTS -u "${ES_USER}:${ES_PASS}" \
  "${ES_URL}/_index_template/api-logs-template" \
  -H "Content-Type: application/json" \
  -d @elasticsearch-index-template.json
echo ""
echo "   ✓ Index template created"

# Create initial index with alias (optional, Logstash will create it automatically)
echo ""
echo "4. Creating initial index with alias..."
INITIAL_INDEX="api-logs-$(date +%Y.%m.%d)-000001"
curl -s -X PUT $CURL_OPTS -u "${ES_USER}:${ES_PASS}" \
  "${ES_URL}/${INITIAL_INDEX}" \
  -H "Content-Type: application/json" \
  -d '{
    "aliases": {
      "api-logs": {
        "is_write_index": true
      }
    }
  }' || echo "   (Index may already exist, continuing...)"
echo ""
echo "   ✓ Initial index created: ${INITIAL_INDEX}"

echo ""
echo "=================================================="
echo "Setup Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Copy logstash-pipeline.conf to ./logstash/pipeline/"
echo "2. Update filebeat.yml to mount your app's log directory"
echo "3. Restart your ELK stack"
echo "4. Create Kibana index pattern: api-logs-*"
echo ""
