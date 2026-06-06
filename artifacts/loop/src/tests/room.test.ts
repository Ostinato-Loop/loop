// Loop — Room Tests
// Phase 3: Governance — Testing Foundation
// LILCKY STUDIO LIMITED

import { describe, it, expect } from 'vitest';

// ── Room input validation ──────────────────────────────────────────
interface RoomInput {
  title: string;
  topic?: string;
  privacy: 'public' | 'private';
  category?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateRoom(input: Partial<RoomInput>): ValidationResult {
  const errors: string[] = [];

  if (!input.title?.trim()) {
    errors.push('title is required');
  } else if (input.title.trim().length < 3) {
    errors.push('title must be at least 3 characters');
  } else if (input.title.trim().length > 120) {
    errors.push('title must be 120 characters or fewer');
  }

  if (!input.privacy) {
    errors.push('privacy is required');
  } else if (!['public', 'private'].includes(input.privacy)) {
    errors.push('privacy must be public or private');
  }

  if (input.topic && input.topic.length > 280) {
    errors.push('topic must be 280 characters or fewer');
  }

  return { valid: errors.length === 0, errors };
}

// ── Room state machine ─────────────────────────────────────────────
type RoomStatus = 'scheduled' | 'live' | 'ended';

function canTransition(from: RoomStatus, to: RoomStatus): boolean {
  const allowed: Record<RoomStatus, RoomStatus[]> = {
    scheduled: ['live', 'ended'],
    live: ['ended'],
    ended: [],
  };
  return allowed[from].includes(to);
}

// ── Participant role logic ─────────────────────────────────────────
type ParticipantRole = 'host' | 'co-host' | 'speaker' | 'listener';

function canSpeak(role: ParticipantRole): boolean {
  return ['host', 'co-host', 'speaker'].includes(role);
}

function canManageSpeakers(role: ParticipantRole): boolean {
  return ['host', 'co-host'].includes(role);
}

function canEndRoom(role: ParticipantRole): boolean {
  return role === 'host';
}

function canKickParticipant(actorRole: ParticipantRole, _targetRole: ParticipantRole): boolean {
  if (!['host', 'co-host'].includes(actorRole)) return false;
  if (actorRole === 'co-host' && _targetRole === 'host') return false;
  return true;
}

function canPromoteToSpeaker(actorRole: ParticipantRole, currentRole: ParticipantRole): boolean {
  if (!canManageSpeakers(actorRole)) return false;
  return currentRole === 'listener';
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Room title validation', () => {
  it('accepts valid room title', () => {
    const result = validateRoom({ title: 'Afrobeats Discussion', privacy: 'public' });
    expect(result.valid).toBe(true);
  });

  it('rejects empty title', () => {
    const result = validateRoom({ title: '', privacy: 'public' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('title is required');
  });

  it('rejects title shorter than 3 characters', () => {
    const result = validateRoom({ title: 'Hi', privacy: 'public' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('title must be at least 3 characters');
  });

  it('rejects title longer than 120 characters', () => {
    const result = validateRoom({ title: 'a'.repeat(121), privacy: 'public' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('title must be 120 characters or fewer');
  });
});

describe('Room privacy validation', () => {
  it('accepts public room', () => {
    const result = validateRoom({ title: 'Test Room', privacy: 'public' });
    expect(result.valid).toBe(true);
  });

  it('accepts private room', () => {
    const result = validateRoom({ title: 'Test Room', privacy: 'private' });
    expect(result.valid).toBe(true);
  });

  it('rejects missing privacy', () => {
    const result = validateRoom({ title: 'Test Room' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('privacy is required');
  });
});

describe('Room status state machine', () => {
  it('can transition from scheduled to live', () => {
    expect(canTransition('scheduled', 'live')).toBe(true);
  });

  it('can transition from live to ended', () => {
    expect(canTransition('live', 'ended')).toBe(true);
  });

  it('cannot transition from ended to any state', () => {
    expect(canTransition('ended', 'live')).toBe(false);
    expect(canTransition('ended', 'scheduled')).toBe(false);
  });

  it('cannot go from live back to scheduled', () => {
    expect(canTransition('live', 'scheduled')).toBe(false);
  });
});

describe('Room participant speaking permissions', () => {
  it('host can speak', () => {
    expect(canSpeak('host')).toBe(true);
  });

  it('co-host can speak', () => {
    expect(canSpeak('co-host')).toBe(true);
  });

  it('speaker can speak', () => {
    expect(canSpeak('speaker')).toBe(true);
  });

  it('listener cannot speak', () => {
    expect(canSpeak('listener')).toBe(false);
  });
});

describe('Room management permissions', () => {
  it('host can end room', () => {
    expect(canEndRoom('host')).toBe(true);
  });

  it('listener cannot end room', () => {
    expect(canEndRoom('listener')).toBe(false);
  });

  it('co-host cannot end room', () => {
    expect(canEndRoom('co-host')).toBe(false);
  });

  it('host can kick listener', () => {
    expect(canKickParticipant('host', 'listener')).toBe(true);
  });

  it('co-host can kick listener', () => {
    expect(canKickParticipant('co-host', 'listener')).toBe(true);
  });

  it('listener cannot kick anyone', () => {
    expect(canKickParticipant('listener', 'listener')).toBe(false);
  });

  it('co-host cannot kick host', () => {
    expect(canKickParticipant('co-host', 'host')).toBe(false);
  });

  it('host can promote listener to speaker', () => {
    expect(canPromoteToSpeaker('host', 'listener')).toBe(true);
  });

  it('listener cannot promote anyone', () => {
    expect(canPromoteToSpeaker('listener', 'listener')).toBe(false);
  });

  it('cannot promote a speaker to speaker', () => {
    expect(canPromoteToSpeaker('host', 'speaker')).toBe(false);
  });
});
