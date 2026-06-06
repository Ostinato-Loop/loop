// Loop — Permission Tests
// Phase 3: Governance — Testing Foundation
// Tests the full permission matrix for the Loop platform.
// All permission checks must happen server-side — these tests
// verify the logic that the Worker enforces.
// LILCKY STUDIO LIMITED

import { describe, it, expect } from 'vitest';

// ── Permission model ───────────────────────────────────────────────

type EcosystemRole = 'admin' | 'user';
type CommunityRole = 'owner' | 'moderator' | 'member' | 'banned' | 'none';
type RoomRole = 'host' | 'co-host' | 'speaker' | 'listener' | 'none';

interface Actor {
  ecosystemRole: EcosystemRole;
  communityRole: CommunityRole;
  roomRole: RoomRole;
}

type Action =
  | 'join_room'
  | 'speak_in_room'
  | 'raise_hand'
  | 'end_room'
  | 'kick_from_room'
  | 'promote_to_speaker'
  | 'create_post'
  | 'delete_any_post'
  | 'ban_member'
  | 'delete_community'
  | 'view_private_community';

function isAllowed(actor: Actor, action: Action, context?: { isCommunityMember?: boolean }): boolean {
  if (actor.ecosystemRole === 'admin') return true;
  if (actor.communityRole === 'banned') return false;

  switch (action) {
    case 'join_room':
      if (actor.communityRole === 'none' && context?.isCommunityMember === false) return false;
      return true;

    case 'speak_in_room':
      return ['host', 'co-host', 'speaker'].includes(actor.roomRole);

    case 'raise_hand':
      return actor.roomRole === 'listener';

    case 'end_room':
      return actor.roomRole === 'host';

    case 'kick_from_room':
      return ['host', 'co-host'].includes(actor.roomRole);

    case 'promote_to_speaker':
      return ['host', 'co-host'].includes(actor.roomRole);

    case 'create_post':
      return ['owner', 'moderator', 'member'].includes(actor.communityRole);

    case 'delete_any_post':
      return ['owner', 'moderator'].includes(actor.communityRole);

    case 'ban_member':
      return ['owner', 'moderator'].includes(actor.communityRole);

    case 'delete_community':
      return actor.communityRole === 'owner';

    case 'view_private_community':
      return ['owner', 'moderator', 'member'].includes(actor.communityRole);

    default:
      return false;
  }
}

// ── Actor factories ────────────────────────────────────────────────

const admin: Actor = { ecosystemRole: 'admin', communityRole: 'none', roomRole: 'none' };
const owner: Actor = { ecosystemRole: 'user', communityRole: 'owner', roomRole: 'host' };
const moderator: Actor = { ecosystemRole: 'user', communityRole: 'moderator', roomRole: 'co-host' };
const member: Actor = { ecosystemRole: 'user', communityRole: 'member', roomRole: 'listener' };
const speaker: Actor = { ecosystemRole: 'user', communityRole: 'member', roomRole: 'speaker' };
const banned: Actor = { ecosystemRole: 'user', communityRole: 'banned', roomRole: 'none' };
const stranger: Actor = { ecosystemRole: 'user', communityRole: 'none', roomRole: 'none' };

// ── Tests ──────────────────────────────────────────────────────────

describe('Admin override', () => {
  it('admin can perform any action', () => {
    const actions: Action[] = ['end_room', 'delete_community', 'ban_member', 'kick_from_room'];
    actions.forEach((action) => {
      expect(isAllowed(admin, action)).toBe(true);
    });
  });
});

describe('Banned user is denied all actions', () => {
  it('banned user cannot create posts', () => {
    expect(isAllowed(banned, 'create_post')).toBe(false);
  });

  it('banned user cannot join room', () => {
    expect(isAllowed(banned, 'join_room')).toBe(false);
  });

  it('banned user cannot raise hand', () => {
    expect(isAllowed(banned, 'raise_hand')).toBe(false);
  });
});

describe('Room speaking permissions', () => {
  it('host can speak', () => {
    expect(isAllowed(owner, 'speak_in_room')).toBe(true);
  });

  it('co-host can speak', () => {
    expect(isAllowed(moderator, 'speak_in_room')).toBe(true);
  });

  it('speaker can speak', () => {
    expect(isAllowed(speaker, 'speak_in_room')).toBe(true);
  });

  it('listener cannot speak', () => {
    expect(isAllowed(member, 'speak_in_room')).toBe(false);
  });

  it('only listener can raise hand', () => {
    expect(isAllowed(member, 'raise_hand')).toBe(true);
    expect(isAllowed(speaker, 'raise_hand')).toBe(false);
    expect(isAllowed(owner, 'raise_hand')).toBe(false);
  });
});

describe('Room management permissions', () => {
  it('only host can end room', () => {
    expect(isAllowed(owner, 'end_room')).toBe(true);
    expect(isAllowed(moderator, 'end_room')).toBe(false);
    expect(isAllowed(member, 'end_room')).toBe(false);
  });

  it('host and co-host can kick', () => {
    expect(isAllowed(owner, 'kick_from_room')).toBe(true);
    expect(isAllowed(moderator, 'kick_from_room')).toBe(true);
    expect(isAllowed(member, 'kick_from_room')).toBe(false);
  });

  it('host and co-host can promote speakers', () => {
    expect(isAllowed(owner, 'promote_to_speaker')).toBe(true);
    expect(isAllowed(moderator, 'promote_to_speaker')).toBe(true);
    expect(isAllowed(member, 'promote_to_speaker')).toBe(false);
  });
});

describe('Community permissions', () => {
  it('members can create posts', () => {
    expect(isAllowed(member, 'create_post')).toBe(true);
    expect(isAllowed(moderator, 'create_post')).toBe(true);
    expect(isAllowed(owner, 'create_post')).toBe(true);
  });

  it('strangers cannot create posts', () => {
    expect(isAllowed(stranger, 'create_post')).toBe(false);
  });

  it('only owner and moderator can delete any post', () => {
    expect(isAllowed(owner, 'delete_any_post')).toBe(true);
    expect(isAllowed(moderator, 'delete_any_post')).toBe(true);
    expect(isAllowed(member, 'delete_any_post')).toBe(false);
  });

  it('only owner and moderator can ban members', () => {
    expect(isAllowed(owner, 'ban_member')).toBe(true);
    expect(isAllowed(moderator, 'ban_member')).toBe(true);
    expect(isAllowed(member, 'ban_member')).toBe(false);
  });

  it('only owner can delete community', () => {
    expect(isAllowed(owner, 'delete_community')).toBe(true);
    expect(isAllowed(moderator, 'delete_community')).toBe(false);
    expect(isAllowed(member, 'delete_community')).toBe(false);
  });
});

describe('Private community access', () => {
  it('member can view private community', () => {
    expect(isAllowed(member, 'view_private_community')).toBe(true);
  });

  it('stranger cannot view private community', () => {
    expect(isAllowed(stranger, 'view_private_community')).toBe(false);
  });
});

describe('Role escalation prevention', () => {
  it('listener cannot escalate to speaker by calling speak', () => {
    expect(isAllowed(member, 'speak_in_room')).toBe(false);
  });

  it('member cannot escalate to moderator actions', () => {
    expect(isAllowed(member, 'ban_member')).toBe(false);
    expect(isAllowed(member, 'delete_any_post')).toBe(false);
  });

  it('moderator cannot escalate to owner actions', () => {
    expect(isAllowed(moderator, 'delete_community')).toBe(false);
  });
});
