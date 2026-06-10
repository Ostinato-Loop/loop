/**
 * Loop — Web Push Cryptography (RFC 8291 + RFC 8292)
 * Runs entirely on Cloudflare Workers Web Crypto API — zero npm deps.
 *
 * PUSH-001 (2026-06-10)
 * LILCKY STUDIO LIMITED
 *
 * References:
 *   RFC 8291 — Message Encryption for Web Push
 *   RFC 8292 — Voluntary Application Server Identification (VAPID)
 */

/* ── Base64url helpers ─────────────────────────────────────────────── */

export function b64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64u(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "==".slice(0, (4 - (padded.length % 4)) % 4));
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

/* ── HKDF ─────────────────────────────────────────────────────────── */

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const prk = await crypto.subtle.sign("HMAC", baseKey, salt);
  return crypto.subtle.importKey(
    "raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
}

async function hkdfExpand(prk: CryptoKey, info: Uint8Array, length: number): Promise<Uint8Array> {
  const blocks  = Math.ceil(length / 32);
  const result  = new Uint8Array(blocks * 32);
  let prev = new Uint8Array(0);
  for (let i = 0; i < blocks; i++) {
    const data = new Uint8Array(prev.length + info.length + 1);
    data.set(prev, 0);
    data.set(info, prev.length);
    data[data.length - 1] = i + 1;
    const block = new Uint8Array(await crypto.subtle.sign("HMAC", prk, data));
    result.set(block, i * 32);
    prev = block;
  }
  return result.slice(0, length);
}

/* ── VAPID JWT (RFC 8292) ─────────────────────────────────────────── */

export async function buildVapidAuth(
  audience:          string,   // e.g. "https://fcm.googleapis.com"
  subject:           string,   // "mailto:push@example.com"
  vapidPrivateKeyB64u: string, // from VAPID_PRIVATE_KEY env var
  vapidPublicKeyB64u:  string, // from VAPID_PUBLIC_KEY env var
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600; // 12h

  const header  = b64u(new TextEncoder().encode(JSON.stringify({ alg: "ES256", typ: "JWT" })));
  const payload = b64u(new TextEncoder().encode(JSON.stringify({ aud: audience, exp, sub: subject })));
  const message = `${header}.${payload}`;

  const privRaw = fromB64u(vapidPrivateKeyB64u);
  const privKey = await crypto.subtle.importKey(
    "pkcs8",
    // Build PKCS#8 wrapper around the raw P-256 private key
    buildPkcs8(privRaw),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privKey,
    new TextEncoder().encode(message),
  );

  const token = `${message}.${b64u(sig)}`;
  return `vapid t=${token},k=${vapidPublicKeyB64u}`;
}

/** Wrap a raw 32-byte P-256 private key scalar in a minimal PKCS#8 envelope */
function buildPkcs8(rawPrivKey: Uint8Array): ArrayBuffer {
  // RFC 5915 ECPrivateKey wrapped in PKCS#8 for P-256
  // OID for P-256: 1.2.840.10045.3.1.7
  const oid = new Uint8Array([0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07]);
  const keyBytes = new Uint8Array([
    0x30, 0x41,               // SEQUENCE
      0x02, 0x01, 0x00,       // INTEGER 0 (version)
      0x30, 0x13,             // SEQUENCE (AlgorithmIdentifier)
        0x06, 0x07,           // OID (id-ecPublicKey)
          0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,
        0x06, 0x08,           // OID (secp256r1)
          ...oid,
      0x04, 0x27,             // OCTET STRING (ECPrivateKey)
        0x30, 0x25,           // SEQUENCE
          0x02, 0x01, 0x01,   // INTEGER 1 (version)
          0x04, 0x20,         // OCTET STRING (32-byte private key)
          ...rawPrivKey,
  ]);
  return keyBytes.buffer;
}

/* ── Content Encryption (RFC 8291 / aes128gcm) ───────────────────── */

export async function encryptPushPayload(
  p256dh:    string,  // Base64url subscriber public key
  authSecret: string, // Base64url auth secret
  plaintext:  string,
): Promise<{ body: Uint8Array; contentEncoding: string }> {
  const enc = new TextEncoder();

  // 1. Import subscriber's public key
  const uaPublicRaw = fromB64u(p256dh);
  const uaPublicKey = await crypto.subtle.importKey(
    "raw", uaPublicRaw, { name: "ECDH", namedCurve: "P-256" }, true, [],
  );

  // 2. Generate ephemeral server key pair
  const asKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"],
  );
  const asPublicRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", asKeyPair.publicKey)
  );

  // 3. ECDH
  const ecdhBits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaPublicKey },
    asKeyPair.privateKey,
    256,
  ));

  // 4. PRK = HKDF-Extract(auth_secret, ecdh_secret)
  const authSecretBytes = fromB64u(authSecret);
  const prk = await hkdfExtract(authSecretBytes, ecdhBits);

  // 5. IKM = HKDF-Expand(PRK, info, 32)
  //    info = "WebPush: info\x00" || ua_public || as_public
  const infoPrefix = enc.encode("WebPush: info\x00");
  const info1 = new Uint8Array(infoPrefix.length + uaPublicRaw.length + asPublicRaw.length);
  info1.set(infoPrefix);
  info1.set(uaPublicRaw, infoPrefix.length);
  info1.set(asPublicRaw, infoPrefix.length + uaPublicRaw.length);
  const ikm = await hkdfExpand(prk, info1, 32);

  // 6. Random salt (16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 7. CEK = HKDF(salt, IKM, "Content-Encoding: aes128gcm\x00", 16)
  const prk2 = await hkdfExtract(salt, ikm);
  const cekInfo   = enc.encode("Content-Encoding: aes128gcm\x00");
  const nonceInfo = enc.encode("Content-Encoding: nonce\x00");
  const [cek, nonce] = await Promise.all([
    hkdfExpand(prk2, cekInfo,   16),
    hkdfExpand(prk2, nonceInfo, 12),
  ]);

  // 8. Import CEK for AES-GCM
  const aesKey = await crypto.subtle.importKey(
    "raw", cek, { name: "AES-GCM" }, false, ["encrypt"],
  );

  // 9. Pad plaintext + delimiter (0x02 = last record)
  const plaintextBytes = enc.encode(plaintext);
  const padded = new Uint8Array(plaintextBytes.length + 1);
  padded.set(plaintextBytes);
  padded[plaintextBytes.length] = 0x02;

  // 10. Encrypt
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded)
  );

  // 11. Build aes128gcm body: salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext
  const rs = 4096 + 16; // default record size
  const body = new Uint8Array(16 + 4 + 1 + 65 + ciphertext.length);
  let off = 0;
  body.set(salt, off); off += 16;
  new DataView(body.buffer).setUint32(off, rs, false); off += 4;
  body[off++] = 65;
  body.set(asPublicRaw, off); off += 65;
  body.set(ciphertext, off);

  return { body, contentEncoding: "aes128gcm" };
}
