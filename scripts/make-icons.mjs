// Draws the app icons (a noodle bowl on red) as PNGs with no image library: per-pixel shapes,
// 4x supersampled, encoded with node:zlib. Run: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const RED = [179, 38, 30];
const CREAM = [255, 247, 236];

// Shapes in a 0..1 square. Returns the colour at (x, y), or null for transparent.
function shade(x, y, maskable) {
  if (!maskable) {
    // rounded square, corner radius 0.22
    const r = 0.22;
    const cx = Math.min(Math.max(x, r), 1 - r);
    const cy = Math.min(Math.max(y, r), 1 - r);
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return null;
  }
  // Maskable icons keep the drawing inside the central safe zone.
  const s = maskable ? 0.72 : 0.9;
  const u = (x - 0.5) / s + 0.5;
  const v = (y - 0.5) / s + 0.5;
  // bowl: lower half of a circle, plus a rim bar and a foot
  const inBowl = v >= 0.5 && (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.33 ** 2;
  const inRim = v >= 0.46 && v <= 0.53 && Math.abs(u - 0.5) <= 0.37;
  const inFoot = v >= 0.82 && v <= 0.87 && Math.abs(u - 0.5) <= 0.13;
  // three wavy steam lines (noodles lifted by chopsticks)
  let inSteam = false;
  for (const x0 of [0.38, 0.5, 0.62]) {
    if (v >= 0.16 && v <= 0.42 && Math.abs(u - (x0 + 0.03 * Math.sin(v * 28))) <= 0.022) inSteam = true;
  }
  return inBowl || inRim || inFoot || inSteam ? CREAM : RED;
}

function png(size, maskable) {
  const ss = 4;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = shade((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, maskable);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a++;
        }
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = a ? r / a : 0; raw[o + 1] = a ? g / a : 0; raw[o + 2] = a ? b / a : 0; raw[o + 3] = (a / (ss * ss)) * 255;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', png(192, false));
writeFileSync('public/icon-512.png', png(512, false));
writeFileSync('public/icon-maskable-512.png', png(512, true));
writeFileSync('public/apple-touch-icon.png', png(180, true));
console.log('icons written to public/');
