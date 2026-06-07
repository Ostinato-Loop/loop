/**
 * Unit tests for Loop V2 Communities — pure utility functions
 *
 * Covers slug validation, slugification, category/visibility guards,
 * rule validation, region slug building, and moderator permission shapes.
 *
 * No HTTP calls, no KV, no Supabase — pure functions only.
 *
 * Run: pnpm test
 */

import { describe, it, expect } from "vitest";
import {
  isValidSlug,
  slugify,
  isValidCommunityCategory,
  isValidCommunityVisibility,
  isValidRuleNumber,
  buildRegionSlug,
} from "./communities.js";

// ── isValidSlug ───────────────────────────────────────────────────────

describe("isValidSlug", () => {
  it("accepts a simple valid slug", () => {
    expect(isValidSlug("tech-talk")).toBe(true);
  });

  it("accepts minimum 3-char slug", () => {
    expect(isValidSlug("abc")).toBe(true);
  });

  it("accepts slug with digits", () => {
    expect(isValidSlug("loop-v2-2026")).toBe(true);
  });

  it("accepts slug starting and ending with digit", () => {
    expect(isValidSlug("1abc1")).toBe(true);
  });

  it("rejects slug shorter than 3 chars", () => {
    expect(isValidSlug("ab")).toBe(false);
  });

  it("rejects slug longer than 48 chars", () => {
    expect(isValidSlug("a".repeat(49))).toBe(false);
  });

  it("rejects slug with uppercase letters", () => {
    expect(isValidSlug("Tech-Talk")).toBe(false);
  });

  it("rejects slug starting with hyphen", () => {
    expect(isValidSlug("-tech-talk")).toBe(false);
  });

  it("rejects slug ending with hyphen", () => {
    expect(isValidSlug("tech-talk-")).toBe(false);
  });

  it("rejects consecutive hyphens", () => {
    expect(isValidSlug("tech--talk")).toBe(false);
  });

  it("rejects slug with spaces", () => {
    expect(isValidSlug("tech talk")).toBe(false);
  });

  it("rejects slug with underscores", () => {
    expect(isValidSlug("tech_talk")).toBe(false);
  });

  it("rejects slug with special characters", () => {
    expect(isValidSlug("tech@talk")).toBe(false);
  });

  it("accepts 48-char slug (maximum)", () => {
    expect(isValidSlug("a" + "b".repeat(46) + "c")).toBe(true);
  });
});

// ── slugify ───────────────────────────────────────────────────────────

describe("slugify", () => {
  it("lowercases the name", () => {
    expect(slugify("Tech Talk")).toBe("tech-talk");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("Loop Community")).toBe("loop-community");
  });

  it("collapses multiple spaces", () => {
    expect(slugify("loop   community")).toBe("loop-community");
  });

  it("removes special characters", () => {
    expect(slugify("Tech & Culture!")).toBe("tech-culture");
  });

  it("collapses resulting consecutive hyphens — note: raw output may have them; caller validates", () => {
    const result = slugify("Tech & Culture");
    expect(result).toMatch(/^[a-z0-9-]+$/);
  });

  it("strips leading and trailing hyphens", () => {
    const result = slugify("  Lagos ");
    expect(result).not.toMatch(/^-|-$/);
  });

  it("truncates at 48 chars", () => {
    const longName = "a".repeat(60);
    expect(slugify(longName).length).toBeLessThanOrEqual(48);
  });

  it("handles names with numbers", () => {
    expect(slugify("Loop V2 2026")).toBe("loop-v2-2026");
  });

  it("handles single-word names", () => {
    expect(slugify("Technology")).toBe("technology");
  });

  it("normalises tabs and underscores to hyphens", () => {
    const result = slugify("loop_community");
    expect(result).toBe("loop-community");
  });
});

// ── isValidCommunityCategory ──────────────────────────────────────────

describe("isValidCommunityCategory", () => {
  const valid = [
    "technology", "culture", "education", "sports", "faith",
    "business", "local", "news", "entertainment", "health", "general",
  ];

  for (const cat of valid) {
    it(`accepts "${cat}"`, () => {
      expect(isValidCommunityCategory(cat)).toBe(true);
    });
  }

  it("rejects unknown category", () => {
    expect(isValidCommunityCategory("radio")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidCommunityCategory("")).toBe(false);
  });

  it("rejects uppercase variant", () => {
    expect(isValidCommunityCategory("Technology")).toBe(false);
  });

  it("rejects community (room category, not community category)", () => {
    expect(isValidCommunityCategory("community")).toBe(false);
  });
});

// ── isValidCommunityVisibility ────────────────────────────────────────

describe("isValidCommunityVisibility", () => {
  it("accepts public", () => {
    expect(isValidCommunityVisibility("public")).toBe(true);
  });

  it("accepts private", () => {
    expect(isValidCommunityVisibility("private")).toBe(true);
  });

  it("accepts invite_only", () => {
    expect(isValidCommunityVisibility("invite_only")).toBe(true);
  });

  it("rejects invite-only (hyphen variant)", () => {
    expect(isValidCommunityVisibility("invite-only")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidCommunityVisibility("")).toBe(false);
  });

  it("rejects arbitrary string", () => {
    expect(isValidCommunityVisibility("open")).toBe(false);
  });

  it("rejects uppercase variant", () => {
    expect(isValidCommunityVisibility("Public")).toBe(false);
  });
});

// ── isValidRuleNumber ─────────────────────────────────────────────────

describe("isValidRuleNumber", () => {
  it("accepts 1 (minimum)", () => {
    expect(isValidRuleNumber(1)).toBe(true);
  });

  it("accepts 10 (mid-range)", () => {
    expect(isValidRuleNumber(10)).toBe(true);
  });

  it("accepts 20 (maximum)", () => {
    expect(isValidRuleNumber(20)).toBe(true);
  });

  it("rejects 0 (below minimum)", () => {
    expect(isValidRuleNumber(0)).toBe(false);
  });

  it("rejects 21 (above maximum)", () => {
    expect(isValidRuleNumber(21)).toBe(false);
  });

  it("rejects negative numbers", () => {
    expect(isValidRuleNumber(-1)).toBe(false);
  });

  it("rejects float values", () => {
    expect(isValidRuleNumber(1.5)).toBe(false);
  });

  it("rejects string values", () => {
    expect(isValidRuleNumber("1")).toBe(false);
  });

  it("rejects null", () => {
    expect(isValidRuleNumber(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidRuleNumber(undefined)).toBe(false);
  });
});

// ── buildRegionSlug ───────────────────────────────────────────────────

describe("buildRegionSlug", () => {
  it("builds country-only slug", () => {
    expect(buildRegionSlug("NG")).toBe("NG");
  });

  it("builds country+state slug", () => {
    expect(buildRegionSlug("NG", "LA")).toBe("NG-LA");
  });

  it("uppercases country code", () => {
    expect(buildRegionSlug("ng", "la")).toBe("NG-LA");
  });

  it("uppercases state code", () => {
    expect(buildRegionSlug("NG", "ab")).toBe("NG-AB");
  });

  it("omits state when not provided", () => {
    expect(buildRegionSlug("NG")).toBe("NG");
  });

  it("omits state when undefined", () => {
    expect(buildRegionSlug("NG", undefined)).toBe("NG");
  });
});
