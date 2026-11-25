import { test } from 'node:test';
import assert from 'node:assert/strict';

import { priceAmount } from './price-amount.ts';

test('parses a plain US price', () => {
  assert.equal(priceAmount('$9.99'), 9.99);
  assert.equal(priceAmount('9.99'), 9.99);
  assert.equal(priceAmount('$49.00'), 49);
});

test('parses a comma decimal mark', () => {
  assert.equal(priceAmount('9,99 €'), 9.99);
  assert.equal(priceAmount('9,99'), 9.99);
});

test('parses grouped values on both sides of the decimal mark', () => {
  // de-ES style: dot groups, comma decimals.
  assert.equal(priceAmount('1.234,56 €'), 1234.56);
  // en style: comma groups, dot decimals.
  assert.equal(priceAmount('$1,234.56'), 1234.56);
  // fr style: space grouping (already stripped), comma decimals.
  assert.equal(priceAmount('1 234,56 €'), 1234.56);
});

test('several commas without a dot are grouping separators', () => {
  assert.equal(priceAmount('1,234,567'), 1234567);
});

test('returns 0 when there is nothing to compare', () => {
  assert.equal(priceAmount(''), 0);
  assert.equal(priceAmount('Free'), 0);
  assert.equal(priceAmount('—'), 0);
});

test('the launch discount is measurable against the anchor price', () => {
  const original = priceAmount('$49.00');
  const price = priceAmount('$9.99');
  assert.ok(original > 0 && price > 0 && price < original);
  assert.equal(Math.round((1 - price / original) * 100), 80);
});
