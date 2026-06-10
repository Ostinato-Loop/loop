/**
 * Loop — k6 Load Test: Room Lifecycle
 * Tests: list rooms → room detail → join → heartbeat → leave
 *
 * Run:
 *   k6 run --vus 250 --duration 120s rooms.js -e AUTH_TOKEN=<token>
 *
 * PHASE 9: PRIVATE BETA SCALE TEST
 * LILCKY STUDIO LIMITED
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL   = __ENV.BASE_URL   || "https://loop.rald.cloud";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

const listLatency  = new Trend("list_rooms_ms");
const joinLatency  = new Trend("join_room_ms");
const errorRate    = new Rate("room_errors");

export const options = {
  stages: [
    { duration: "30s", target: 100 },
    { duration: "60s", target: 250 },
    { duration: "30s", target: 500 },
    { duration: "30s", target: 0   },
  ],
  thresholds: {
    "room_errors":       ["rate<0.05"],
    "list_rooms_ms":     ["p(95)<2000"],
    "join_room_ms":      ["p(95)<3000"],
    "http_req_duration": ["p(95)<3000"],
    "http_req_failed":   ["rate<0.05"],
  },
};

const authedHeaders = {
  "Content-Type":  "application/json",
  "Authorization": `Bearer ${AUTH_TOKEN}`,
};

export default function () {
  // 1. List live rooms (public, no auth needed)
  const t0    = Date.now();
  const list  = http.get(`${BASE_URL}/api/rooms?limit=20`);
  listLatency.add(Date.now() - t0);

  const listOk = check(list, { "rooms list 200": (r) => r.status === 200 });
  errorRate.add(!listOk);

  let roomId: string | null = null;
  if (listOk && list.status === 200) {
    const data = list.json() as { rooms?: { id: string }[] };
    roomId = data?.rooms?.[0]?.id ?? null;
  }

  // 2. Join a room (if one exists and we have auth)
  if (roomId && AUTH_TOKEN) {
    const t1   = Date.now();
    const join = http.post(
      `${BASE_URL}/api/rooms/${roomId}/join`,
      JSON.stringify({ role: "listener" }),
      { headers: authedHeaders },
    );
    joinLatency.add(Date.now() - t1);

    check(join, { "join 200|409": (r) => r.status === 200 || r.status === 409 });

    // 3. Heartbeat (host only — this simulates host keepalive under load)
    if (__VU % 10 === 0) {
      http.post(`${BASE_URL}/api/rooms/${roomId}/heartbeat`, "{}", { headers: authedHeaders });
    }

    // 4. Leave
    sleep(2);
    http.post(
      `${BASE_URL}/api/rooms/${roomId}/leave`,
      "{}",
      { headers: authedHeaders },
    );
  }

  sleep(1);
}
