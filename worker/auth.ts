/**
 * Credentials and sessions for the firm panel, with no dependency of any kind.
 *
 * Everything here is WebCrypto, which Workers give us at the edge. A password library would be
 * one more thing to keep current in a repository whose Python side runs on the standard library,
 * and the two primitives needed are both in the platform: PBKDF2 to store a password nobody can
 * read back, and HMAC to sign a cookie nobody can forge.
 *
 * What this deliberately does not do:
 *
 *   No password reset by email. A firm gets its credential from us by hand, because the whole
 *   account model is hand-issued for now, and a reset flow is a second door to an account that
 *   can edit what a public directory says about a law firm.
 *
 *   No "remember me". The session is eight hours. A panel that edits published claims about a
 *   business is not a place to stay signed in on a shared machine for a month.
 *
 *   No user enumeration. A wrong firm and a wrong password return the same answer after the same
 *   work, because a login that answers faster for an unknown firm tells an attacker which firms
 *   have accounts.
 */

/** PBKDF2-SHA256. 210,000 is OWASP's 2023 floor for this hash and it costs about 80ms here. */
const ITERATIONS = 210_000;
const KEY_BITS = 256;

/** Eight hours. Long enough to finish a correction, short enough to matter if a laptop is lost. */
export const SESSION_SECONDS = 8 * 60 * 60;

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Uint8Array {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Constant time over the whole comparison.
 *
 * `a === b` on a secret returns as soon as two bytes differ, and the time it took says how much
 * of the guess was right. This is only ever a few dozen bytes, so there is no reason to be clever.
 */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false,
                                            ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, KEY_BITS);
  return new Uint8Array(bits);
}

/** The stored form: the parameters travel with the hash, so raising the cost later is possible. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return `pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = (stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  const salt = unb64url(parts[2]);
  const want = unb64url(parts[3]);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false,
                                            ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, want.length * 8);
  return sameBytes(new Uint8Array(bits), want);
}

/**
 * A password-shaped string a person can read down a phone line and type once.
 *
 * No l, I, 1, O or 0: the credential is handed over by a human to a human, and a character pair
 * nobody can tell apart costs a support message every time.
 */
const READABLE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function newPassword(groups = 4, size = 5): string {
  const bytes = crypto.getRandomValues(new Uint8Array(groups * size));
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    if (i && i % size === 0) out += '-';
    out += READABLE[bytes[i] % READABLE.length];
  }
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' },
                                 false, ['sign', 'verify']);
}

/**
 * A signed, self-describing token: `<payload>.<signature>`.
 *
 * Used for the session cookie and for the one-click approval link in the review email, which is
 * the same problem twice. Nothing is stored for either: the token carries what it asserts and the
 * signature is what makes it true, so an approval link keeps working if KV is cold and a session
 * costs no read.
 */
export async function sign(secret: string, claims: Record<string, string | number>,
                           ttlSeconds: number): Promise<string> {
  const body = { ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payload = b64url(enc.encode(JSON.stringify(body)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verify(secret: string, token: string): Promise<Record<string, any> | null> {
  const [payload, sig] = (token || '').split('.');
  if (!payload || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(sig),
                                        enc.encode(payload));
  if (!ok) return null;
  let claims: Record<string, any>;
  try {
    claims = JSON.parse(new TextDecoder().decode(unb64url(payload)));
  } catch {
    return null;
  }
  // An expired token is not a valid token, and the check belongs here rather than at each of the
  // places that reads one.
  if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

export const COOKIE = 'lfl_panel';

export function cookieHeader(token: string, secure: boolean): string {
  const bits = [
    `${COOKIE}=${token}`,
    'Path=/claim',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_SECONDS}`,
  ];
  // Secure is dropped only on localhost, where there is no TLS and the cookie would never be set.
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

export function clearCookie(secure: boolean): string {
  const bits = [`${COOKIE}=`, 'Path=/claim', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

export function readCookie(request: Request): string | null {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}
