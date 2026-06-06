// Loop — Baseline Auth Tests
// Phase 3: Governance — Testing Foundation
// LILCKY STUDIO LIMITED

import { describe, it, expect, vi } from 'vitest';

// ── Utility: JWT parsing ───────────────────────────────────────────
function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return Date.now() / 1000 > payload.exp;
}

// ── Phone number validation (mirrors worker logic) ─────────────────
function isValidPhone(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone.trim());
}

// ── OTP format validation ──────────────────────────────────────────
function isValidOtp(otp: string): boolean {
  return /^\d{6}$/.test(otp.trim());
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Phone number validation', () => {
  it('accepts valid international numbers', () => {
    expect(isValidPhone('+2348012345678')).toBe(true);
    expect(isValidPhone('+14155552671')).toBe(true);
    expect(isValidPhone('+447911123456')).toBe(true);
  });

  it('rejects numbers without country code', () => {
    expect(isValidPhone('08012345678')).toBe(false);
    expect(isValidPhone('8012345678')).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(isValidPhone('')).toBe(false);
  });

  it('rejects numbers that are too short', () => {
    expect(isValidPhone('+123')).toBe(false);
  });

  it('rejects non-numeric characters', () => {
    expect(isValidPhone('+1-415-555-2671')).toBe(false);
    expect(isValidPhone('+1 415 555 2671')).toBe(false);
  });
});

describe('OTP validation', () => {
  it('accepts valid 6-digit OTP', () => {
    expect(isValidOtp('123456')).toBe(true);
    expect(isValidOtp('000000')).toBe(true);
    expect(isValidOtp('999999')).toBe(true);
  });

  it('rejects OTPs that are too short or too long', () => {
    expect(isValidOtp('12345')).toBe(false);
    expect(isValidOtp('1234567')).toBe(false);
  });

  it('rejects non-numeric OTPs', () => {
    expect(isValidOtp('12345a')).toBe(false);
    expect(isValidOtp('abcdef')).toBe(false);
  });

  it('rejects empty OTP', () => {
    expect(isValidOtp('')).toBe(false);
  });
});

describe('JWT payload parsing', () => {
  const validPayload = {
    sub: 'user-123',
    role: 'listener',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };
  const encoded = btoa(JSON.stringify(validPayload));
  const validToken = `header.${encoded}.signature`;

  it('parses valid JWT payload', () => {
    const result = parseJwtPayload(validToken);
    expect(result).not.toBeNull();
    expect(result?.sub).toBe('user-123');
    expect(result?.role).toBe('listener');
  });

  it('returns null for malformed token', () => {
    expect(parseJwtPayload('not.a.token')).toBeNull();
    expect(parseJwtPayload('')).toBeNull();
  });

  it('detects unexpired token', () => {
    expect(isTokenExpired(validToken)).toBe(false);
  });

  it('detects expired token', () => {
    const expiredPayload = { ...validPayload, exp: Math.floor(Date.now() / 1000) - 3600 };
    const expiredToken = `header.${btoa(JSON.stringify(expiredPayload))}.signature`;
    expect(isTokenExpired(expiredToken)).toBe(true);
  });
});

describe('Auth state machine', () => {
  type AuthState = 'unauthenticated' | 'otp_sent' | 'authenticated' | 'error';

  function authReducer(state: AuthState, event: string): AuthState {
    switch (state) {
      case 'unauthenticated':
        if (event === 'SEND_OTP') return 'otp_sent';
        if (event === 'ERROR') return 'error';
        return state;
      case 'otp_sent':
        if (event === 'VERIFY_SUCCESS') return 'authenticated';
        if (event === 'VERIFY_FAIL') return 'error';
        if (event === 'RESEND') return 'otp_sent';
        return state;
      case 'authenticated':
        if (event === 'LOGOUT') return 'unauthenticated';
        return state;
      case 'error':
        if (event === 'RETRY') return 'unauthenticated';
        return state;
    }
  }

  it('transitions from unauthenticated to otp_sent on SEND_OTP', () => {
    expect(authReducer('unauthenticated', 'SEND_OTP')).toBe('otp_sent');
  });

  it('transitions from otp_sent to authenticated on VERIFY_SUCCESS', () => {
    expect(authReducer('otp_sent', 'VERIFY_SUCCESS')).toBe('authenticated');
  });

  it('transitions from otp_sent to error on VERIFY_FAIL', () => {
    expect(authReducer('otp_sent', 'VERIFY_FAIL')).toBe('error');
  });

  it('transitions from authenticated to unauthenticated on LOGOUT', () => {
    expect(authReducer('authenticated', 'LOGOUT')).toBe('unauthenticated');
  });

  it('ignores unknown events', () => {
    expect(authReducer('authenticated', 'UNKNOWN')).toBe('authenticated');
  });
});
