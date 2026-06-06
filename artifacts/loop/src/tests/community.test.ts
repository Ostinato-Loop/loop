// Loop — Community Tests
// Phase 3: Governance — Testing Foundation
// Note: Communities are a V2 feature (FOUNDATION/loop-v2-readiness.md).
// These tests define the contract for community creation and validation
// BEFORE implementation begins — TDD for V2.
// LILCKY STUDIO LIMITED

import { describe, it, expect } from 'vitest';

// ── Community validation (mirrors V2 schema requirements) ──────────
interface CommunityInput {
  name: string;
  slug: string;
  description?: string;
  type: 'public' | 'private' | 'verified' | 'geographic' | 'interest';
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateCommunity(input: Partial<CommunityInput>): ValidationResult {
  const errors: string[] = [];

  if (!input.name?.trim()) {
    errors.push('name is required');
  } else if (input.name.trim().length < 3) {
    errors.push('name must be at least 3 characters');
  } else if (input.name.trim().length > 80) {
    errors.push('name must be 80 characters or fewer');
  }

  if (!input.slug?.trim()) {
    errors.push('slug is required');
  } else if (!/^[a-z0-9-]{3,40}$/.test(input.slug)) {
    errors.push('slug must be 3–40 lowercase alphanumeric characters and hyphens');
  }

  if (!input.type) {
    errors.push('type is required');
  } else if (!['public', 'private', 'verified', 'geographic', 'interest'].includes(input.type)) {
    errors.push('type must be one of: public, private, verified, geographic, interest');
  }

  if (input.description && input.description.length > 500) {
    errors.push('description must be 500 characters or fewer');
  }

  return { valid: errors.length === 0, errors };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Community name validation', () => {
  it('accepts valid community name', () => {
    const result = validateCommunity({ name: 'Lagos Music Scene', slug: 'lagos-music', type: 'public' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects empty name', () => {
    const result = validateCommunity({ name: '', slug: 'test', type: 'public' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('name is required');
  });

  it('rejects name shorter than 3 characters', () => {
    const result = validateCommunity({ name: 'AB', slug: 'ab', type: 'public' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('name must be at least 3 characters');
  });

  it('rejects name longer than 80 characters', () => {
    const longName = 'a'.repeat(81);
    const result = validateCommunity({ name: longName, slug: 'test', type: 'public' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('name must be 80 characters or fewer');
  });
});

describe('Community slug validation', () => {
  it('accepts valid slugs', () => {
    const result = validateCommunity({ name: 'Test', slug: 'test-community-123', type: 'public' });
    expect(result.valid).toBe(true);
  });

  it('rejects slugs with uppercase letters', () => {
    const result = validateCommunity({ name: 'Test', slug: 'TestCommunity', type: 'public' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('slug must be');
  });

  it('rejects slugs with spaces', () => {
    const result = validateCommunity({ name: 'Test', slug: 'test community', type: 'public' });
    expect(result.valid).toBe(false);
  });

  it('rejects slugs shorter than 3 characters', () => {
    const result = validateCommunity({ name: 'Test', slug: 'ab', type: 'public' });
    expect(result.valid).toBe(false);
  });
});

describe('Community type validation', () => {
  const validTypes: CommunityInput['type'][] = ['public', 'private', 'verified', 'geographic', 'interest'];

  validTypes.forEach((type) => {
    it(`accepts type: ${type}`, () => {
      const result = validateCommunity({ name: 'Test Community', slug: 'test-community', type });
      expect(result.valid).toBe(true);
    });
  });

  it('rejects invalid type', () => {
    const result = validateCommunity({ name: 'Test', slug: 'test', type: 'invalid' as CommunityInput['type'] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('type must be one of: public, private, verified, geographic, interest');
  });

  it('rejects missing type', () => {
    const result = validateCommunity({ name: 'Test', slug: 'test' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('type is required');
  });
});

describe('Slug generation utility', () => {
  it('converts name to valid slug', () => {
    expect(slugify('Lagos Music Scene')).toBe('lagos-music-scene');
  });

  it('removes special characters', () => {
    expect(slugify('Afro-beats & Jazz!')).toBe('afro-beats-jazz');
  });

  it('truncates to 40 characters', () => {
    const result = slugify('a'.repeat(50));
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('hello   world')).toBe('hello-world');
  });
});

describe('Community membership rules (V2 spec)', () => {
  type Role = 'owner' | 'moderator' | 'member' | 'banned';

  const ROLE_HIERARCHY: Record<Role, number> = {
    owner: 4,
    moderator: 3,
    member: 2,
    banned: 0,
  };

  function canPerformAction(actorRole: Role, action: string): boolean {
    const level = ROLE_HIERARCHY[actorRole];
    switch (action) {
      case 'delete_community': return level >= 4;
      case 'promote_moderator': return level >= 4;
      case 'remove_member': return level >= 3;
      case 'ban_member': return level >= 3;
      case 'delete_post': return level >= 3;
      case 'create_post': return level >= 2;
      case 'create_event': return level >= 3;
      default: return false;
    }
  }

  it('owner can delete community', () => {
    expect(canPerformAction('owner', 'delete_community')).toBe(true);
  });

  it('moderator cannot delete community', () => {
    expect(canPerformAction('moderator', 'delete_community')).toBe(false);
  });

  it('moderator can ban members', () => {
    expect(canPerformAction('moderator', 'ban_member')).toBe(true);
  });

  it('member can create posts', () => {
    expect(canPerformAction('member', 'create_post')).toBe(true);
  });

  it('banned user cannot create posts', () => {
    expect(canPerformAction('banned', 'create_post')).toBe(false);
  });
});
