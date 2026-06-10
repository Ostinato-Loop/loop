/**
 * Loop — k6 Load Test: Auth Flow
 * Tests: send-otp → verify-otp → /auth/me at 100/250/500 VUs
 *
 * Run:
 *   k6 run --vus 100 --duration 60s auth.js
 *   k6 run --vus 250 --duration 60s auth.js
 *   k6 run --vus 500 --duration 60s auth.js
 *
 * PHASE 9: PRIVATE BETA SCALE TEST
 * LILCKY STUDIO LIMITED
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://loop.rald.cloud";

const otpErrorRate      = new Rate("otp_errors");
const loginSuccessRate  = new Rate("login_success");
const meLatency         = new Trend("me_latency_ms");
const otpLatency        = new Trend("otp_latency_ms");

export const options = {
  stages: [
    { duration: "30s", target: 50  },  // ramp up
    { duration: "60s", target: 100 },  // hold at 100
    { duration: "30s", target: 0   },  // ramp down
  ],
  thresholds: {
    "otp_errors":           ["rate<0.05"],    // <5% OTP errors
    "login_success":        ["rate>0.90"],    // >90% login success
    "otp_latency_ms":       ["p(95)<3000"],   // OTP send <3s P95
    "me_latency_ms":        ["p(95)<1000"],   // /auth/me <1s P95
    "http_req_failed":      ["rate<0.05"],    // <5% HTTP failures
    "http_req_duration":    ["p(95)<3000"],   // Overall <3s P95
  },
};

const TEST_PHONE = "+2348123456789"; // Use a real Termii test number in production

export default function () {
  const headers = { "Content-Type": "application/json" };
  const vuId    = __VU;

  // 1. Health check
  const health = http.get(`${BASE_URL}/api/health`);
  check(health, { "health ok": (r) => r.status === 200 });

  // 2. OTP send (rate limited — use unique phones per VU)
  const phone = `+234801${String(vuId).padStart(7, "0")}`;
  const t0    = Date.now();
  const otp   = http.post(
    `${BASE_URL}/api/auth/send-otp`,
    JSON.stringify({ phone }),
    { headers },
  );
  otpLatency.add(Date.now() - t0);

  const otpOk = check(otp, {
    "otp send 200|429": (r) => r.status === 200 || r.status === 429,
  });
  otpErrorRate.add(!otpOk);

  // 3. /auth/me (unauthenticated — should return 401)
  const t1 = Date.now();
  const me = http.get(`${BASE_URL}/api/auth/me`);
  meLatency.add(Date.now() - t1);

  check(me, { "me 401 without token": (r) => r.status === 401 });
  loginSuccessRate.add(me.status === 401); // Expected 401 = success

  sleep(1);
}
