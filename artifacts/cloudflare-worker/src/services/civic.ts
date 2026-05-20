import type { CloudflareEnv } from "../types/env.js";

/**
 * Civic data service — SportsMonks, government APIs, local news feeds.
 *
 * Future integrations:
 *  - SportsMonks football fixtures/results (SPORTSMONKS_API_KEY)
 *  - COSON artist royalty data (COSON_API_KEY)
 *  - National election commission APIs (per-country)
 *  - Local government press releases
 *
 * Each function should cache results in KV with an appropriate TTL
 * to stay within the Workers CPU time limits on free/paid tiers.
 */

export interface FootballFixture {
  id: number;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  competition: string;
  status: "scheduled" | "live" | "finished";
}

/**
 * Fetch live and upcoming football fixtures.
 * Cached in KV for 2 minutes (low TTL for live scores).
 */
export async function getLiveFixtures(
  env: CloudflareEnv,
  countryCode = "NG",
): Promise<FootballFixture[]> {
  const cacheKey = `civic:fixtures:${countryCode}`;
  const cached = await env.CACHE.get(cacheKey, "json") as FootballFixture[] | null;
  if (cached) return cached;

  // TODO: implement SportsMonks fetch
  // const res = await fetch(
  //   `https://api.sportmonks.com/v3/football/fixtures?filters=fixtureDate:today`,
  //   { headers: { Authorization: env.SPORTSMONKS_API_KEY } }
  // );

  const fixtures: FootballFixture[] = [];
  await env.CACHE.put(cacheKey, JSON.stringify(fixtures), { expirationTtl: 120 });
  return fixtures;
}
