import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clearMarks, formatMs, getMarks, mark } from './perf.ts';

test('marks are recorded in order with a non-negative offset', () => {
  clearMarks();
  mark('first');
  mark('second');
  const marks = getMarks();
  assert.equal(marks.length, 2);
  assert.equal(marks[0].name, 'first');
  assert.equal(marks[1].name, 'second');
  assert.ok(marks[0].at >= 0);
  assert.ok(marks[1].at >= marks[0].at);
});

test('clearMarks forgets the recorded marks', () => {
  mark('something');
  assert.ok(getMarks().length > 0);
  clearMarks();
  assert.equal(getMarks().length, 0);
});

test('getMarks hands out a copy', () => {
  clearMarks();
  mark('copy');
  const marks = getMarks();
  marks.push({ name: 'injected', at: 0 });
  assert.equal(getMarks().length, 1);
});

test('formatMs switches to seconds above a second', () => {
  assert.equal(formatMs(0), '0 ms');
  assert.equal(formatMs(840), '840 ms');
  assert.equal(formatMs(999), '999 ms');
  assert.equal(formatMs(1000), '1.00 s');
  assert.equal(formatMs(1240), '1.24 s');
});
