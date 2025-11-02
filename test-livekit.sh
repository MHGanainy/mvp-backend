#!/bin/bash

# LiveKit Integration Test Script
# Tests the Node.js backend integration with Python LiveKit orchestrator

echo "🧪 Testing LiveKit Integration..."
echo "=================================="

response=$(curl -s -X POST http://localhost:3000/api/simulation-attempts \
  -H "Content-Type: application/json" \
  -d '{"studentId":"1e13b648-1d64-48c4-bf05-da484a4a5ac8","simulationId":"3369e7a6-87d5-4f7a-8f35-0ebdf6a6d963","voiceId":"Ashley"}')

echo "$response" | python3 -c "
import sys, json

def redact(s, show=10):
    if len(s) <= show:
        return s
    return s[:show] + '...' + s[-4:]

try:
    d = json.load(sys.stdin)

    # Check for actual error (no voiceAssistantConfig means error)
    if 'voiceAssistantConfig' not in d:
        print('❌ ERROR: Request failed')
        print(f'Message: {d.get(\"message\", d.get(\"error\", \"Unknown error\"))}')
        sys.exit(1)

    config = d.get('voiceAssistantConfig', {})

    # Extract fields
    token = config.get('token', 'N/A')
    corr = config.get('correlationToken', 'N/A')
    room = config.get('roomName', 'N/A')
    ws = config.get('wsEndpoint', 'N/A')

    # Check for legacy sessionConfig (should be removed)
    has_legacy = 'sessionConfig' in config

    print('')
    print('📊 Response Fields:')
    print('─' * 50)
    print(f'Token (JWT):       {redact(token) if token != \"N/A\" else \"N/A\"}')
    print(f'Correlation Token: {corr}')
    print(f'Room Name:         {room}')
    print(f'WS Endpoint:       {ws}')
    print('')

    print('✅ Validation Checks:')
    print('─' * 50)

    # Check 1: Token present
    token_ok = token != 'N/A' and len(token) > 20
    print(f'[{\"✅\" if token_ok else \"❌\"}] LiveKit JWT Token present')

    # Check 2: Correlation token format
    corr_ok = corr.startswith('sim_') and '_' in corr[4:]
    print(f'[{\"✅\" if corr_ok else \"❌\"}] Correlation token format valid (sim_xxx_timestamp)')

    # Check 3: Room name matches correlation token
    match_ok = corr == room
    print(f'[{\"✅\" if match_ok else \"❌\"}] Room name matches correlation token')

    # Check 4: WS endpoint present
    ws_ok = ws != 'N/A' and (ws.startswith('ws://') or ws.startswith('wss://'))
    print(f'[{\"✅\" if ws_ok else \"❌\"}] WebSocket endpoint present and valid')

    # Check 5: No legacy sessionConfig
    no_legacy = not has_legacy
    print(f'[{\"✅\" if no_legacy else \"❌\"}] No legacy sessionConfig (cleaned up)')

    print('')

    if all([token_ok, corr_ok, match_ok, ws_ok, no_legacy]):
        print('🎉 All checks passed! LiveKit integration is working correctly.')
        sys.exit(0)
    else:
        print('⚠️  Some checks failed. Review the output above.')
        sys.exit(1)

except json.JSONDecodeError as e:
    print('❌ ERROR: Invalid JSON response')
    print(f'Details: {e}')
    sys.exit(1)
except Exception as e:
    print(f'❌ ERROR: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
"
