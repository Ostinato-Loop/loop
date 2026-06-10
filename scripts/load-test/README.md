# Loop — k6 Load Tests (Phase 9: Private Beta Scale Test)

## Install k6
```bash
brew install k6            # macOS
# or
docker pull grafana/k6     # Docker
```

## Test Scenarios

### 100 Users — Auth Flow
```bash
k6 run --vus 100 --duration 60s scripts/load-test/auth.js \
  -e BASE_URL=https://loop.rald.cloud
```

### 250 Users — Room Lifecycle
```bash
k6 run --vus 250 --duration 120s scripts/load-test/rooms.js \
  -e BASE_URL=https://loop.rald.cloud \
  -e AUTH_TOKEN=<your_test_token>
```

### 500 Users — Combined
```bash
k6 run scripts/load-test/rooms.js \
  -e BASE_URL=https://loop.rald.cloud \
  -e AUTH_TOKEN=<your_test_token>
```
(The rooms.js scenario ramps to 500 VUs automatically.)

## Pass/Fail Thresholds
| Metric | Threshold |
|--------|-----------|
| OTP errors | < 5% |
| Login success | > 90% |
| OTP latency P95 | < 3s |
| /auth/me latency P95 | < 1s |
| Room list latency P95 | < 2s |
| Join room latency P95 | < 3s |
| HTTP failures | < 5% |

## Notes
- Auth tests use unique phone numbers per VU to avoid rate limiting.
- Room join tests require a valid AUTH_TOKEN from a real Loop session.
- Run from within a VPN or the Cloudflare network for best latency.
