#!/usr/bin/env node
// Generates launcher/app icons for the calculator disguise (no dependencies).
// Reference: light bg, dark squircle body, 2x2 keys (+, x, -, blue glowing lock).
// Usage: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMG = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');
const SS = 2; // supersampling factor

// Design space: 1024x1024, body centered at (512,512).
const BODY = { x: 182, y: 182, w: 660, h: 660, r: 148 };
const BODY_TOP = [54, 61, 68];
const BODY_BOT = [31, 35, 40];
const BG = [242, 242, 244]; // #F2F2F4
const KEY = { x0: 230, y0: 230, size: 262, gap: 40, r: 60 };
const KEY_TOP = [66, 72, 80];
const KEY_BOT = [54, 59, 65];
const WHITE = [255, 255, 255];
const BLUE = [46, 156, 255]; // #2E9CFF
const BLUE_DARK = [16, 60, 110];
const SHADOW = [0, 0, 0];

// Lock, centered in the bottom-right key (design center 663,663).
const LOCK = {
  cx: 663,
  shackleCy: 651,
  shackleOut: 80,
  shackleIn: 52,
  caseX: 593,
  caseY: 643,
  caseW: 140,
  caseH: 112,
  caseR: 26,
};

function canvas(size) {
  return { size, data: new Uint8Array(size * size * 4) };
}

function blend(c, x, y, rgb, a, erase) {
  if (x < 0 || y < 0 || x >= c.size || y >= c.size) return;
  const i = (y * c.size + x) * 4;
  if (erase) {
    c.data[i] = c.data[i + 1] = c.data[i + 2] = c.data[i + 3] = 0;
    return;
  }
  const sa = a / 255;
  const da = c.data[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  c.data[i] = Math.round((rgb[0] * sa + c.data[i] * da * (1 - sa)) / oa);
  c.data[i + 1] = Math.round((rgb[1] * sa + c.data[i + 1] * da * (1 - sa)) / oa);
  c.data[i + 2] = Math.round((rgb[2] * sa + c.data[i + 2] * da * (1 - sa)) / oa);
  c.data[i + 3] = Math.round(oa * 255);
}

function inRoundRect(x, y, x0, y0, w, h, r) {
  const x1 = x0 + w - 1;
  const y1 = y0 + h - 1;
  if (x < x0 || y < y0 || x > x1 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function fillRoundRect(c, x0, y0, w, h, r, rgb, erase = false, a = 255) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++)
      if (inRoundRect(x, y, x0, y0, w, h, r)) blend(c, x, y, rgb, a, erase);
}

function fillRoundRectGrad(c, x0, y0, w, h, r, top, bot) {
  for (let y = y0; y < y0 + h; y++) {
    const t = h > 1 ? (y - y0) / (h - 1) : 0;
    const rgb = [
      Math.round(top[0] + (bot[0] - top[0]) * t),
      Math.round(top[1] + (bot[1] - top[1]) * t),
      Math.round(top[2] + (bot[2] - top[2]) * t),
    ];
    for (let x = x0; x < x0 + w; x++)
      if (inRoundRect(x, y, x0, y0, w, h, r)) blend(c, x, y, rgb, 255, false);
  }
}

function capsule(c, cx, cy, len, deg, th, rgb, erase = false) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const half = len / 2;
  const r2 = th / 2;
  const bound = Math.ceil(half + r2) + 1;
  for (let y = Math.floor(cy - bound); y <= Math.ceil(cy + bound); y++)
    for (let x = Math.floor(cx - bound); x <= Math.ceil(cx + bound); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const proj = dx * cos + dy * sin;
      const perp = -dx * sin + dy * cos;
      const t = Math.min(Math.max(proj, -half), half);
      const ex = proj - t;
      if (ex * ex + perp * perp <= r2 * r2) blend(c, x, y, rgb, 255, erase);
    }
}

function disc(c, cx, cy, r, rgb, a = 255) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) blend(c, x, y, rgb, a, false);
    }
}

// Upper half annulus (shackle); rIn <= 0 gives a solid half-disc.
function halfRing(c, cx, cy, rOut, rIn, rgb, erase = false) {
  for (let y = Math.floor(cy - rOut); y <= cy; y++)
    for (let x = Math.floor(cx - rOut); x <= Math.ceil(cx + rOut); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > rOut * rOut || (rIn > 0 && d2 < rIn * rIn)) continue;
      const a = Math.atan2(dy, dx);
      const an = a < 0 ? a + 2 * Math.PI : a;
      if (an >= Math.PI - 1e-9 || an <= 1e-9) blend(c, x, y, rgb, 255, erase);
    }
}

function downsample(src, newSize) {
  const f = src.size / newSize;
  if (!Number.isInteger(f)) throw new Error(`downsample ${src.size}->${newSize}: not integer`);
  const out = canvas(newSize);
  for (let y = 0; y < newSize; y++)
    for (let x = 0; x < newSize; x++) {
      let r = 0, g = 0, b = 0, sa = 0;
      for (let dy = 0; dy < f; dy++)
        for (let dx = 0; dx < f; dx++) {
          const i = ((y * f + dy) * src.size + (x * f + dx)) * 4;
          const wa = src.data[i + 3];
          r += src.data[i] * wa;
          g += src.data[i + 1] * wa;
          b += src.data[i + 2] * wa;
          sa += wa;
        }
      const o = (y * newSize + x) * 4;
      if (sa > 0) {
        out.data[o] = Math.round(r / sa);
        out.data[o + 1] = Math.round(g / sa);
        out.data[o + 2] = Math.round(b / sa);
        out.data[o + 3] = Math.round(sa / (f * f));
      }
    }
  return out;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(c) {
  const stride = c.size * 4 + 1;
  const raw = Buffer.alloc(stride * c.size);
  for (let y = 0; y < c.size; y++) {
    raw[y * stride] = 0;
    Buffer.from(c.data.buffer, c.data.byteOffset + y * c.size * 4, c.size * 4).copy(
      raw,
      y * stride + 1
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.size, 0);
  ihdr.writeUInt32BE(c.size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function render(size, drawFn) {
  const big = canvas(size * SS);
  drawFn(big);
  return downsample(big, size);
}

function write(name, c) {
  const path = join(IMG, name);
  writeFileSync(path, encodePNG(c));
  console.log(`wrote ${path} (${c.size}x${c.size})`);
}

// Design-space -> render-space transform. P = position (offset applied),
// S = size/radius (scale only).
function makeTransform(canvasSizePx, bodyH) {
  const s = (bodyH * SS) / BODY.h;
  const o = Math.round((canvasSizePx * SS) / 2 - 512 * s);
  return {
    P: (v) => o + Math.round(v * s),
    S: (v) => Math.round(v * s),
    s,
  };
}

function drawBody(T, c) {
  fillRoundRectGrad(
    c,
    T.P(BODY.x),
    T.P(BODY.y),
    T.P(BODY.x + BODY.w) - T.P(BODY.x),
    T.P(BODY.y + BODY.h) - T.P(BODY.y),
    T.S(BODY.r),
    BODY_TOP,
    BODY_BOT
  );
}

function drawKeysAndSymbols(T, c, { keys = true, erase = false } = {}) {
  const kx1 = KEY.x0 + KEY.size + KEY.gap;
  const ky1 = KEY.y0 + KEY.size + KEY.gap;
  const cells = [
    [KEY.x0, KEY.y0],
    [kx1, KEY.y0],
    [KEY.x0, ky1],
    [kx1, ky1],
  ];
  const dsize = T.P(KEY.x0 + KEY.size) - T.P(KEY.x0);
  if (keys) {
    const dkeyR = T.S(KEY.r);
    for (const [x, y] of cells) {
      fillRoundRectGrad(
        c,
        T.P(x),
        T.P(y),
        T.P(x + KEY.size) - T.P(x),
        T.P(y + KEY.size) - T.P(y),
        dkeyR,
        KEY_TOP,
        KEY_BOT
      );
    }
  }
  const centers = cells.map(([x, y]) => [T.P(x) + dsize / 2, T.P(y) + dsize / 2]);
  const th = Math.max(2, Math.round((36 * dsize) / KEY.size));
  const len = Math.round((140 * dsize) / KEY.size);
  const [[c11, c12], [c21, c22], [c31, c32]] = centers;
  capsule(c, c11, c12, len, 0, th, WHITE, erase); // + horizontal
  capsule(c, c11, c12, len, 90, th, WHITE, erase); // + vertical
  capsule(c, c21, c22, len, 45, th, WHITE, erase); // x
  capsule(c, c21, c22, len, -45, th, WHITE, erase);
  capsule(c, c31, c32, len, 0, th, WHITE, erase); // -
}

function drawLock(T, c, { erase = false, glow = true } = {}) {
  const cx = T.P(LOCK.cx);
  const cy = T.P(LOCK.cx); // lock center y equals center x in design space
  if (glow && !erase) {
    for (let i = 0; i < 10; i++) {
      disc(c, cx, cy, T.S(95 + i * 7), BLUE, 7);
    }
  }
  const caseX = T.P(LOCK.caseX);
  const caseY = T.P(LOCK.caseY);
  const caseW = T.P(LOCK.caseX + LOCK.caseW) - caseX;
  const caseH = T.P(LOCK.caseY + LOCK.caseH) - caseY;
  if (erase) {
    halfRing(c, cx, T.P(LOCK.shackleCy), T.S(LOCK.shackleOut), T.S(LOCK.shackleIn), WHITE, true);
    fillRoundRect(c, caseX, caseY, caseW, caseH, T.S(LOCK.caseR), WHITE, true);
    return;
  }
  halfRing(c, cx, T.P(LOCK.shackleCy), T.S(LOCK.shackleOut), T.S(LOCK.shackleIn), BLUE, false);
  fillRoundRect(c, caseX, caseY, caseW, caseH, T.S(LOCK.caseR), BLUE, false);
  disc(c, cx, T.P(686), T.S(17), BLUE_DARK);
  capsule(c, cx, T.P(710), T.S(40), 90, T.S(22), BLUE_DARK, false);
}

mkdirSync(IMG, { recursive: true });

// Full app icon: light bg + soft shadow + body/keys/symbols/lock.
const icon = render(1024, (c) => {
  const T = makeTransform(1024, BODY.h); // s = 2 = SS, o = 0
  fillRoundRect(c, 0, 0, 1024 * SS, 1024 * SS, 0, BG, false);
  // Soft drop shadow: nested rounded rects, expanding outward with low alpha, offset down.
  for (let i = 26; i >= 1; i--) {
    const e = Math.round(i * 1.7 * SS);
    fillRoundRect(
      c,
      T.P(BODY.x) - e,
      T.P(BODY.y) - e + Math.round(7 * SS),
      T.P(BODY.x + BODY.w) - T.P(BODY.x) + 2 * e,
      T.P(BODY.y + BODY.h) - T.P(BODY.y) + 2 * e,
      T.S(BODY.r) + e,
      SHADOW,
      false,
      5
    );
  }
  drawBody(T, c);
  drawKeysAndSymbols(T, c, { keys: true, erase: false });
  drawLock(T, c, { erase: false, glow: true });
});
write('icon.png', icon);

// Adaptive foreground: transparent bg, colored glyph within the 66% safe zone.
const fg = render(1024, (c) => {
  const T = makeTransform(1024, 600);
  drawBody(T, c);
  drawKeysAndSymbols(T, c, { keys: true, erase: false });
  drawLock(T, c, { erase: false, glow: true });
});
write('android-icon-foreground.png', fg);

// Monochrome: white squircle, symbols + lock punched out (Android 13+ themed icons).
const mono = render(1024, (c) => {
  const T = makeTransform(1024, 600);
  fillRoundRect(
    c,
    T.P(BODY.x),
    T.P(BODY.y),
    T.P(BODY.x + BODY.w) - T.P(BODY.x),
    T.P(BODY.y + BODY.h) - T.P(BODY.y),
    T.S(BODY.r),
    WHITE,
    false
  );
  drawKeysAndSymbols(T, c, { keys: false, erase: true });
  drawLock(T, c, { erase: true, glow: false });
});
write('android-icon-monochrome.png', mono);

// Splash glyph: colored glyph, transparent bg (background color set in app.json).
const splash = render(512, (c) => {
  const T = makeTransform(512, 330);
  drawBody(T, c);
  drawKeysAndSymbols(T, c, { keys: true, erase: false });
  drawLock(T, c, { erase: false, glow: true });
});
write('splash-icon.png', splash);

// Favicon: downsampled full icon (64 divides 1024 evenly).
write('favicon.png', downsample(icon, 64));

try {
  unlinkSync(join(IMG, 'android-icon-background.png'));
  console.log('removed android-icon-background.png');
} catch {}
