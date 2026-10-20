import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ALG_NAME,
  ENVELOPE_MAGIC,
  ENVELOPE_VERSION,
  MAC_BYTES,
  PREFIX_FIXED_BYTES,
  type Random,
  base64ToBytes,
  bytesToBase64,
  concatBytes,
  ctrCipherAt,
  decryptBytes,
  encryptBytes,
  parseHead,
  utf8,
} from './envelope.ts';

/** deterministic PRNG (xorshift32) for reproducible tests */
function makeRand(seed: number): Random {
  let s = seed >>> 0 || 0x9e3779b9;
  return (length: number) => {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      out[i] = s & 0xff;
    }
    return out;
  };
}

const rand = makeRand(12345);
const MASTER = makeRand(777)(32);

function fakeEnvelope(overrides: Record<string, unknown> = {}): Uint8Array {
  const env = encryptBytes(utf8('secret payload'), MASTER, 'file-1', rand);
  if (Object.keys(overrides).length === 0) return env;
  const fixed = env.subarray(0, PREFIX_FIXED_BYTES);
  const headerLen = (fixed[4] << 8) | fixed[5];
  const header = JSON.parse(new TextDecoder().decode(env.subarray(PREFIX_FIXED_BYTES, PREFIX_FIXED_BYTES + headerLen)));
  const patched = { ...header, ...overrides };
  const json = utf8(JSON.stringify(patched));
  const newFixed = new Uint8Array([...ENVELOPE_MAGIC, (json.length >> 8) & 0xff, json.length & 0xff]);
  const oldPrefixLen = PREFIX_FIXED_BYTES + headerLen;
  const oldMac = env.subarray(oldPrefixLen, oldPrefixLen + MAC_BYTES);
  const ct = env.subarray(oldPrefixLen + MAC_BYTES);
  return concatBytes(newFixed, json, oldMac, ct);
}

test('encryptBytes/decryptBytes round-trip across sizes', () => {
  for (const n of [0, 1, 15, 16, 17, 1024, 1024 * 1024 + 7]) {
    const plain = makeRand(n + 99)(n);
    const env = encryptBytes(plain, MASTER, `id-${n}`, rand);
    const opened = decryptBytes(env, MASTER);
    assert.equal(opened.fileId, `id-${n}`);
    assert.equal(opened.size, n);
    assert.deepEqual(Buffer.from(opened.plaintext), Buffer.from(plain));
  }
});

test('ciphertext flip is rejected by HMAC', () => {
  const env = encryptBytes(utf8('attack me'), MASTER, 'f', rand);
  env[env.length - 1] ^= 0x01;
  assert.throws(() => decryptBytes(env, MASTER), /Integrity check failed/);
});

test('mac field tamper is rejected', () => {
  const env = encryptBytes(utf8('attack me'), MASTER, 'f', rand);
  const fixed = env.subarray(0, PREFIX_FIXED_BYTES);
  const headerLen = (fixed[4] << 8) | fixed[5];
  env[PREFIX_FIXED_BYTES + headerLen] ^= 0x01;
  assert.throws(() => decryptBytes(env, MASTER), /Integrity check failed/);
});

test('header tamper (size field) is rejected', () => {
  const env = fakeEnvelope({ size: 1 });
  assert.throws(() => decryptBytes(env, MASTER), /Integrity check failed/);
});

test('header tamper (algorithm name) is rejected', () => {
  const env = fakeEnvelope({ alg: 'ROT13' });
  assert.throws(() => decryptBytes(env, MASTER), /corrupted \(header fields\)|Integrity/);
});

test('fileId swap breaks GCM AAD binding', () => {
  const env = fakeEnvelope({ id: 'other-file' });
  assert.throws(() => decryptBytes(env, MASTER), /Key unwrap failed|Integrity/);
});

test('wrong master key is rejected', () => {
  const env = encryptBytes(utf8('data'), MASTER, 'f', rand);
  const wrong = makeRand(999)(32);
  assert.throws(() => decryptBytes(env, wrong), /Key unwrap failed/);
});

test('bad magic is rejected', () => {
  const env = encryptBytes(utf8('data'), MASTER, 'f', rand);
  env[0] ^= 0xff;
  assert.throws(() => decryptBytes(env, MASTER), /magic/);
});

test('truncated envelope is rejected', () => {
  const env = encryptBytes(utf8('data'), MASTER, 'f', rand);
  assert.throws(() => decryptBytes(env.subarray(0, 4), MASTER), /too short|truncated/);
  assert.throws(() => decryptBytes(env.subarray(0, env.length - 2), MASTER), /corrupted|Integrity/);
});

test('keystream continues across 1 MiB chunk boundaries', () => {
  const encKey = makeRand(4242)(32);
  const fn = makeRand(31)(12);
  const plain = makeRand(5151)(2 * 1024 * 1024 + 16); // 2 chunks + a tail
  const chunk = 1024 * 1024;

  const whole = ctrCipherAt(encKey, fn, 0).encrypt(plain);

  const pieces: Uint8Array[] = [];
  for (let off = 0; off < plain.length; off += chunk) {
    const part = plain.subarray(off, Math.min(off + chunk, plain.length));
    pieces.push(ctrCipherAt(encKey, fn, off).encrypt(part));
  }
  const chunked = concatBytes(...pieces);
  assert.deepEqual(Buffer.from(chunked), Buffer.from(whole));
});

test('ctrCipherAt rejects non-16-aligned offsets', () => {
  assert.throws(() => ctrCipherAt(makeRand(1)(32), makeRand(2)(12), 8), /aligned/);
});

test('base64 round-trip across lengths', () => {
  for (const n of [0, 1, 2, 3, 4, 5, 63, 64, 65, 300]) {
    const bytes = makeRand(n + 17)(n);
    const encoded = bytesToBase64(bytes);
    assert.deepEqual(Buffer.from(base64ToBytes(encoded)), Buffer.from(bytes));
  }
  assert.equal(bytesToBase64(new TextEncoder().encode('any carnal pleasure.')), 'YW55IGNhcm5hbCBwbGVhc3VyZS4=');
  assert.throws(() => base64ToBytes('!!not-base64!!'), /base64/);
});

test('utf8 round-trip including non-ascii', () => {
  const samples = ['ascii', '', 'héllo', '🔐 vault', '日本語テキスト'];
  for (const s of samples) {
    assert.equal(new TextDecoder().decode(utf8(s)), s);
  }
});

test('parseHead validates version and alg', () => {
  const env = encryptBytes(utf8('x'), MASTER, 'f', rand);
  const fixed = env.subarray(0, PREFIX_FIXED_BYTES);
  const headerLen = (fixed[4] << 8) | fixed[5];
  const json = env.subarray(PREFIX_FIXED_BYTES, PREFIX_FIXED_BYTES + headerLen);
  const parsed = parseHead(fixed, json);
  assert.equal(parsed.header.v, ENVELOPE_VERSION);
  assert.equal(parsed.header.alg, ALG_NAME);
  assert.equal(parsed.cipherOffset, parsed.prefixLen + MAC_BYTES);
});
