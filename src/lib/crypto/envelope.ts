import { ctr, gcm } from '@noble/ciphers/aes.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Vault envelope v2 — AES-256-CTR (content) + HMAC-SHA256 (integrity),
 * AES-256-GCM (per-file key wrap, AAD-bound to fileId).
 *
 * File layout:
 *   MAGIC(4) | headerLen u16-BE | headerJSON | mac(32) | ciphertext
 *
 * HMAC input: MAGIC | headerLen | headerJSON | ciphertext
 * (the mac field itself is excluded, everything else is covered).
 *
 * This module is pure (no react-native imports) so it runs under node tests.
 */

export type Random = (length: number) => Uint8Array;

export const ENVELOPE_MAGIC = new Uint8Array([0x48, 0x4d, 0x44, 0x4c]); // 'HMDL'
export const ENVELOPE_VERSION = 2;
export const ALG_NAME = 'AES-256-CTR+HMAC-SHA256';

export const FILE_KEY_BYTES = 64;
export const FILE_NONCE_BYTES = 12;
export const GCM_NONCE_BYTES = 12;
export const MAC_BYTES = 32;
export const MASTER_KEY_BYTES = 32;
const WRAP_TAG_BYTES = 16;
const WRAP_BLOB_BYTES = GCM_NONCE_BYTES + FILE_KEY_BYTES + WRAP_TAG_BYTES;
export const PREFIX_FIXED_BYTES = 6; // magic(4) + headerLen(2)
const MAX_HEADER_JSON_BYTES = 4096;
const AAD_PREFIX = 'hideme.vault.v2:';

export interface EnvelopeHeader {
  v: number;
  alg: string;
  id: string;
  size: number;
  /** base64, FILE_NONCE_BYTES */
  fn: string;
  /** base64: gcmNonce(GCM_NONCE_BYTES) || wrapped file key (FILE_KEY_BYTES + tag) */
  fk: string;
}

export interface ParsedHead {
  header: EnvelopeHeader;
  /** total bytes of MAGIC | headerLen | headerJSON */
  prefixLen: number;
  /** absolute offset where the 32-byte mac field starts */
  macOffset: number;
  /** absolute offset where ciphertext starts */
  cipherOffset: number;
}

/* ------------------------------------------------------------------ */
/* byte helpers                                                        */
/* ------------------------------------------------------------------ */

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      B64_ALPHABET[(n >> 18) & 63] +
      B64_ALPHABET[(n >> 12) & 63] +
      B64_ALPHABET[(n >> 6) & 63] +
      B64_ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64_ALPHABET[(n >> 18) & 63] + B64_ALPHABET[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64_ALPHABET[(n >> 18) & 63] + B64_ALPHABET[(n >> 12) & 63] + B64_ALPHABET[(n >> 6) & 63] + '=';
  }
  return out;
}

export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    const idx = B64_ALPHABET.indexOf(clean[i]);
    if (idx < 0) throw new Error('Vault envelope corrupted (base64).');
    acc = (acc << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function utf8(text: string): Uint8Array {
  let size = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const isSurrogate = c >= 0xd800 && c <= 0xdbff && i + 1 < text.length;
    if (isSurrogate) {
      size += 4;
      i++;
    } else {
      size += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    }
  }
  const buf = new Uint8Array(size);
  let o = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const cp = ((c - 0xd800) << 10) | (text.charCodeAt(i + 1) - 0xdc00) + 0x10000;
      i++;
      buf[o++] = 0xf0 | (cp >> 18);
      buf[o++] = 0x80 | ((cp >> 12) & 0x3f);
      buf[o++] = 0x80 | ((cp >> 6) & 0x3f);
      buf[o++] = 0x80 | (cp & 0x3f);
    } else if (c < 0x80) buf[o++] = c;
    else if (c < 0x800) {
      buf[o++] = 0xc0 | (c >> 6);
      buf[o++] = 0x80 | (c & 0x3f);
    } else {
      buf[o++] = 0xe0 | (c >> 12);
      buf[o++] = 0x80 | ((c >> 6) & 0x3f);
      buf[o++] = 0x80 | (c & 0x3f);
    }
  }
  return buf;
}

/** Manual UTF-8 decode — Hermes has no TextDecoder. */
export function fromUtf8(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      continue;
    }
    let cp: number;
    if ((b0 & 0xe0) === 0xc0) {
      cp = ((b0 & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if ((b0 & 0xf0) === 0xe0) {
      cp = ((b0 & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else if ((b0 & 0xf8) === 0xf0) {
      cp =
        ((b0 & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
    } else {
      out += '\ufffd';
      continue;
    }
    if (cp > 0xffff) {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      out += String.fromCharCode(cp);
    }
  }
  return out;
}

function u16be(value: number): Uint8Array {
  if (value < 0 || value > 0xffff || !Number.isInteger(value)) {
    throw new Error('Vault envelope corrupted (header length).');
  }
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

function readU16be(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

export function be32(value: number): Uint8Array {
  if (value < 0 || !Number.isInteger(value)) {
    throw new Error('Vault envelope corrupted (counter).');
  }
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function aadFor(fileId: string): Uint8Array {
  return utf8(AAD_PREFIX + fileId);
}

/* ------------------------------------------------------------------ */
/* AES-GCM key wrapping                                                */
/* ------------------------------------------------------------------ */

export function aesGcmWrap(key: Uint8Array, plaintext: Uint8Array, aad: Uint8Array, rand: Random): Uint8Array {
  const nonce = rand(GCM_NONCE_BYTES);
  const ct = gcm(key, nonce, aad).encrypt(plaintext);
  return concatBytes(nonce, ct);
}

export function aesGcmUnwrap(key: Uint8Array, blob: Uint8Array, aad: Uint8Array): Uint8Array {
  if (blob.length < GCM_NONCE_BYTES + WRAP_TAG_BYTES) {
    throw new Error('Vault envelope corrupted (wrapped key).');
  }
  try {
    const nonce = blob.subarray(0, GCM_NONCE_BYTES);
    const ct = blob.subarray(GCM_NONCE_BYTES);
    return gcm(key, nonce, aad).decrypt(ct);
  } catch {
    throw new Error('Key unwrap failed (wrong key or tampered data).');
  }
}

/* ------------------------------------------------------------------ */
/* head build / parse                                                  */
/* ------------------------------------------------------------------ */

export interface BuiltHead {
  header: EnvelopeHeader;
  prefix: Uint8Array;
  encKey: Uint8Array;
  macKey: Uint8Array;
}

export function buildHead(fileId: string, plainSize: number, masterKey: Uint8Array, rand: Random): BuiltHead {
  if (masterKey.length !== MASTER_KEY_BYTES) throw new Error('Invalid master key length.');
  const fileKey = rand(FILE_KEY_BYTES);
  const encKey = fileKey.subarray(0, 32);
  const macKey = fileKey.subarray(32, 64);
  const fileNonce = rand(FILE_NONCE_BYTES);
  const wrapped = aesGcmWrap(masterKey, fileKey, aadFor(fileId), rand);
  const header: EnvelopeHeader = {
    v: ENVELOPE_VERSION,
    alg: ALG_NAME,
    id: fileId,
    size: plainSize,
    fn: bytesToBase64(fileNonce),
    fk: bytesToBase64(wrapped),
  };
  return { header, prefix: encodePrefix(header), encKey, macKey };
}

export function encodePrefix(header: EnvelopeHeader): Uint8Array {
  const json = utf8(JSON.stringify(header));
  return concatBytes(ENVELOPE_MAGIC, u16be(json.length), json);
}

/** fixed6 = first PREFIX_FIXED_BYTES bytes of the file; jsonBytes = header JSON. */
export function parseHead(fixed6: Uint8Array, jsonBytes: Uint8Array): ParsedHead {
  if (fixed6.length !== PREFIX_FIXED_BYTES) throw new Error('Vault envelope corrupted (head).');
  for (let i = 0; i < ENVELOPE_MAGIC.length; i++) {
    if (fixed6[i] !== ENVELOPE_MAGIC[i]) throw new Error('Vault envelope corrupted (magic).');
  }
  const len = readU16be(fixed6, 4);
  if (len === 0 || len > MAX_HEADER_JSON_BYTES || jsonBytes.length !== len) {
    throw new Error('Vault envelope corrupted (header length).');
  }
  let header: EnvelopeHeader;
  try {
    header = JSON.parse(fromUtf8(jsonBytes)) as EnvelopeHeader;
  } catch {
    throw new Error('Vault envelope corrupted (header).');
  }
  if (
    !header ||
    header.v !== ENVELOPE_VERSION ||
    header.alg !== ALG_NAME ||
    typeof header.id !== 'string' ||
    !Number.isInteger(header.size) ||
    header.size < 0 ||
    typeof header.fn !== 'string' ||
    typeof header.fk !== 'string'
  ) {
    throw new Error('Vault envelope corrupted (header fields).');
  }
  const prefixLen = PREFIX_FIXED_BYTES + len;
  return { header, prefixLen, macOffset: prefixLen, cipherOffset: prefixLen + MAC_BYTES };
}

export function recoverFileKeys(header: EnvelopeHeader, masterKey: Uint8Array): { encKey: Uint8Array; macKey: Uint8Array } {
  const blob = base64ToBytes(header.fk);
  if (blob.length !== WRAP_BLOB_BYTES) throw new Error('Vault envelope corrupted (wrapped key).');
  const fileKey = aesGcmUnwrap(masterKey, blob, aadFor(header.id));
  return { encKey: fileKey.subarray(0, 32), macKey: fileKey.subarray(32, 64) };
}

/* ------------------------------------------------------------------ */
/* AES-CTR chunk keystream                                              */
/* ------------------------------------------------------------------ */

/**
 * CTR cipher positioned at byteOffset. The whole file is one keystream:
 * IV = fileNonce(12) || BE32(blockIndex), blockIndex = byteOffset / 16.
 * byteOffset must be a multiple of 16 (chunk boundaries are 1 MiB).
 */
export function ctrCipherAt(encKey: Uint8Array, fileNonce: Uint8Array, byteOffset: number) {
  if (fileNonce.length !== FILE_NONCE_BYTES) throw new Error('Vault envelope corrupted (nonce).');
  if (byteOffset % 16 !== 0) throw new Error('CTR chunk offset must be 16-byte aligned.');
  const iv = concatBytes(fileNonce, be32(Math.floor(byteOffset / 16)));
  return ctr(encKey, iv);
}

export function newMac(macKey: Uint8Array) {
  return hmac.create(sha256, macKey);
}

export function macBytesOf(prefix: Uint8Array, cipher: Uint8Array, macKey: Uint8Array): Uint8Array {
  return newMac(macKey).update(prefix).update(cipher).digest();
}

/* ------------------------------------------------------------------ */
/* whole-buffer envelope (small payloads: the vault index)             */
/* ------------------------------------------------------------------ */

export function encryptBytes(plaintext: Uint8Array, masterKey: Uint8Array, fileId: string, rand: Random): Uint8Array {
  const built = buildHead(fileId, plaintext.length, masterKey, rand);
  const fileNonce = base64ToBytes(built.header.fn);
  const ct = ctrCipherAt(built.encKey, fileNonce, 0).encrypt(plaintext);
  const mac = macBytesOf(built.prefix, ct, built.macKey);
  return concatBytes(built.prefix, mac, ct);
}

export interface OpenedEnvelope {
  fileId: string;
  size: number;
  plaintext: Uint8Array;
}

export function decryptBytes(envelope: Uint8Array, masterKey: Uint8Array): OpenedEnvelope {
  if (envelope.length < PREFIX_FIXED_BYTES + MAC_BYTES) {
    throw new Error('Vault envelope corrupted (too short).');
  }
  const fixed6 = envelope.subarray(0, PREFIX_FIXED_BYTES);
  const headerLen = readU16be(fixed6, 4);
  if (envelope.length < PREFIX_FIXED_BYTES + headerLen + MAC_BYTES) {
    throw new Error('Vault envelope corrupted (truncated).');
  }
  const jsonBytes = envelope.subarray(PREFIX_FIXED_BYTES, PREFIX_FIXED_BYTES + headerLen);
  const parsed = parseHead(fixed6, jsonBytes);
  const prefix = envelope.subarray(0, parsed.prefixLen);
  const storedMac = envelope.subarray(parsed.macOffset, parsed.cipherOffset);
  const ct = envelope.subarray(parsed.cipherOffset);

  const { encKey, macKey } = recoverFileKeys(parsed.header, masterKey);
  const expectedMac = macBytesOf(prefix, ct, macKey);
  if (!constantTimeEqual(storedMac, expectedMac)) {
    throw new Error('Integrity check failed (HMAC mismatch).');
  }
  if (ct.length !== parsed.header.size) {
    throw new Error('Vault envelope corrupted (size mismatch).');
  }
  const fileNonce = base64ToBytes(parsed.header.fn);
  const plaintext = ctrCipherAt(encKey, fileNonce, 0).encrypt(ct); // CTR: encrypt === decrypt
  return { fileId: parsed.header.id, size: parsed.header.size, plaintext };
}
