import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deriveKey, pbkdf2Sha256 } from './pbkdf2.ts';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * Published PBKDF2-HMAC-SHA256 known-answer vectors. They pin the pure-JS
 * implementation to the standard, which is what the Android (Conscrypt) and
 * iOS (CommonCrypto) providers must match byte for byte.
 */
const VECTORS: { password: string; salt: string; iterations: number; dkLen: number; hex: string }[] = [
  {
    password: 'passwd',
    salt: 'salt',
    iterations: 1,
    dkLen: 32,
    hex: '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc',
  },
  {
    password: 'Password',
    salt: 'NaCl',
    iterations: 80000,
    dkLen: 32,
    hex: '4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56',
  },
  {
    password: 'passwordPASSWORDpassword',
    salt: 'saltSALTsaltSALTsaltSALTsaltSALTsalt',
    iterations: 4096,
    dkLen: 32,
    hex: '348c89dbcbd32b2f32d814b8116e84cf2b17347ebc1800181c4e2a1fb8dd53e1',
  },
];

for (const vector of VECTORS) {
  test(`pbkdf2Sha256 matches the known answer for "${vector.password}"`, async () => {
    const key = await pbkdf2Sha256(vector.password, utf8(vector.salt), vector.iterations, vector.dkLen);
    assert.equal(toHex(key), vector.hex);
  });
}

test('pbkdf2Sha256 derives longer keys by continuing the block chain', async () => {
  const key = await pbkdf2Sha256('passwd', utf8('salt'), 1, 40);
  assert.equal(key.length, 40);
  // The first 32 bytes match the dkLen=32 vector; the tail continues it.
  assert.equal(toHex(key.subarray(0, 32)), VECTORS[0].hex);
});

test('deriveKey prefers the platform provider', async () => {
  const expected = await pbkdf2Sha256('123456', utf8('salt'), 10, 32);
  const calls: number[] = [];
  const { key, source } = await deriveKey('123456', utf8('salt'), 10, 32, async (_pw, _s, iterations, dkLen) => {
    calls.push(iterations);
    return expected.slice(0, dkLen);
  });
  assert.equal(source, 'native');
  assert.equal(toHex(key), toHex(expected));
  assert.deepEqual(calls, [10]);
});

test('deriveKey falls back to JS when the provider is missing', async () => {
  const { key, source } = await deriveKey('123456', utf8('salt'), 10, 32, async () => null);
  assert.equal(source, 'js');
  assert.equal(toHex(key), toHex(await pbkdf2Sha256('123456', utf8('salt'), 10, 32)));
});

test('deriveKey falls back to JS when the provider returns a short key', async () => {
  const { key, source } = await deriveKey(
    '123456',
    utf8('salt'),
    10,
    32,
    async () => new Uint8Array(16),
  );
  assert.equal(source, 'js');
  assert.equal(key.length, 32);
});
