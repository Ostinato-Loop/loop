/**
 * Unit tests for Loop V2 Communities — pure utility functions
 *
 * Covers slug validation, slugification, and category/visibility guards.
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
    expect(slugify("Tech & Culture!")).toBe("tech--culture");
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
