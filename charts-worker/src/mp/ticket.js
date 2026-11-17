/*
 * Mehrspieler-Ticket (lfx-mp.1): b64url(JSON) + "." + b64url(HMAC-SHA256(MP_SECRET, payloadB64)).
 * Rein (crypto.subtle, TextEncoder); läuft in Workers und Node. Loggt nie Token/Ticket/Secret.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export const TICKET_TTL_MS = 60 * 1000;
export const MIN_SECRET_BYTES = 32;

export function b64urlEncode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('b64');
  const pad = text.length % 4 === 2 ? '==' : text.length % 4 === 3 ? '=' : '';
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const b64urlJson = (obj) => b64urlEncode(enc.encode(JSON.stringify(obj)));

export function hasSecret(secret) {
  return typeof secret === 'string' && enc.encode(secret).length >= MIN_SECRET_BYTES;
}

let keyCache = { secret: null, key: null };
async function hmacKey(secret) {
  if (keyCache.secret === secret && keyCache.key) return keyCache.key;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
  keyCache = { secret, key };
  return key;
}

async function hmac(secret, text) {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(text)));
}

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Pseudonym: erste 12 Hex-Zeichen von HMAC(secret, "k|"+uid). */
export async function pseudonym(secret, uid) {
  return hex((await hmac(secret, `k|${uid}`)).slice(0, 6));
}

// Steuerzeichen (Cc), Formatzeichen (Cf: Bidi, Zero-Width, ...), Zeilen-/Absatztrenner.
const STRIP_RE = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;

/** NFC, Steuer-/Bidi-/Zero-Width-Zeichen entfernt, höchstens 24 Codepoints, leer wird "Gast". */
export function cleanName(name) {
  let s = String(name ?? '');
  try {
    s = s.normalize('NFC');
  } catch {
    /* ignorieren */
  }
  s = s.replace(STRIP_RE, '').trim();
  s = Array.from(s).slice(0, 24).join('').trim();
  return s || 'Gast';
}

/** Neues Ticket. user = {uid, name, admin}. Liefert {tk, exp}. */
export async function mintTicket(secret, user, now = Date.now(), jti) {
  const j = jti ?? hex(crypto.getRandomValues(new Uint8Array(16)));
  const exp = now + TICKET_TTL_MS;
  const payload = {
    v: 1,
    k: await pseudonym(secret, user.uid),
    n: cleanName(user.name),
    a: user.admin ? 1 : 0,
    e: exp,
    j,
  };
  const p = b64urlJson(payload);
  const sig = b64urlEncode(await hmac(secret, p));
  return { tk: `${p}.${sig}`, exp };
}

/** Prüft Signatur (crypto.subtle.verify, zeitkonstant) und Ablauf. Liefert {k,n,a,e,j} oder null. */
export async function verifyTicket(secret, tk, now = Date.now()) {
  try {
    if (typeof tk !== 'string' || tk.length > 600) return null;
    const parts = tk.split('.');
    if (parts.length !== 2) return null;
    const [p, sig] = parts;
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlDecode(sig), enc.encode(p));
    if (!ok) return null;
    const c = JSON.parse(dec.decode(b64urlDecode(p)));
    if (!c || c.v !== 1 || typeof c.e !== 'number' || c.e <= now) return null;
    if (typeof c.k !== 'string' || !/^[0-9a-f]{12}$/.test(c.k)) return null;
    if (typeof c.j !== 'string' || !/^[0-9a-f]{32}$/.test(c.j)) return null;
    return { k: c.k, n: typeof c.n === 'string' ? c.n : 'Gast', a: c.a === 1 ? 1 : 0, e: c.e, j: c.j };
  } catch {
    return null;
  }
}
