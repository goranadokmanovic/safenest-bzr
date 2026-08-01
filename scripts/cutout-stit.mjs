import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(
  __dirname,
  "..",
  "public",
  "photos",
  "Zrna sa stitom finalni.png",
);
const out = path.join(__dirname, "..", "public", "zrna-shield.png");

const { data, info } = await sharp(src)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width: w, height: h } = info;
const rgba = Buffer.from(data);
const n = w * h;

function isGoldTone(o) {
  const r = rgba[o];
  const g = rgba[o + 1];
  const b = rgba[o + 2];
  // Broad warm/metal detection so anti-aliased rim seals the flood.
  if (r < 70) return false;
  if (r > b + 12 && r + 8 >= g && r - b > 18) return true;
  if (r > 150 && g > 110 && b < 120) return true;
  return false;
}

// Barrier = gold + slight dilation (closes 1–2px gaps in the rim).
const barrier = new Uint8Array(n);
for (let i = 0; i < n; i++) {
  if (isGoldTone(i * 4)) barrier[i] = 1;
}
const dilated = new Uint8Array(barrier);
for (let y = 1; y < h - 1; y++) {
  for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (barrier[i]) continue;
    if (
      barrier[i - 1] ||
      barrier[i + 1] ||
      barrier[i - w] ||
      barrier[i + w] ||
      barrier[i - w - 1] ||
      barrier[i - w + 1] ||
      barrier[i + w - 1] ||
      barrier[i + w + 1]
    ) {
      dilated[i] = 1;
    }
  }
}

function isOutsideCandidate(i) {
  if (dilated[i]) return false;
  const o = i * 4;
  const r = rgba[o];
  const g = rgba[o + 1];
  const b = rgba[o + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Charcoal plate / vignette around the shield.
  return max < 120 && max - min < 40;
}

const visited = new Uint8Array(n);
const q = new Int32Array(n);
let qh = 0;
let qt = 0;

function trySeed(x, y) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const i = y * w + x;
  if (visited[i] || !isOutsideCandidate(i)) return;
  visited[i] = 1;
  q[qt++] = i;
}

for (let x = 0; x < w; x++) {
  trySeed(x, 0);
  trySeed(x, h - 1);
}
for (let y = 0; y < h; y++) {
  trySeed(0, y);
  trySeed(w - 1, y);
}

while (qh < qt) {
  const i = q[qh++];
  const x = i % w;
  const y = (i / w) | 0;
  trySeed(x - 1, y);
  trySeed(x + 1, y);
  trySeed(x, y - 1);
  trySeed(x, y + 1);
}

let cleared = 0;
for (let i = 0; i < n; i++) {
  if (!visited[i]) continue;
  rgba[i * 4 + 3] = 0;
  cleared++;
}

await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
  .trim({ threshold: 8 })
  .png()
  .toFile(out);

const meta = await sharp(out).metadata();
console.log(`Wrote ${out} (${meta.width}x${meta.height})`);
console.log(`Cleared outside pixels: ${cleared} / ${n}`);
