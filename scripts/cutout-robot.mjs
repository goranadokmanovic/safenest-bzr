import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "..", "public", "photos", "Zrna.png");
const out = path.join(__dirname, "..", "public", "zrna-robot.png");

const { data, info } = await sharp(src)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width: w, height: h } = info;
const rgba = Buffer.from(data);
const n = w * h;

/** Light body / face accents seal the silhouette against edge flood. */
function isForeground(o) {
  const r = rgba[o];
  const g = rgba[o + 1];
  const b = rgba[o + 2];
  const max = Math.max(r, g, b);
  // White/cream body, yellow smile eyes, mid-gray joints still above plate
  if (max >= 48) return true;
  // Warm yellow accent even if a bit darker
  if (r > 120 && g > 90 && b < 80) return true;
  return false;
}

const barrier = new Uint8Array(n);
for (let i = 0; i < n; i++) {
  if (isForeground(i * 4)) barrier[i] = 1;
}

// Dilate barrier 2px to close AA gaps
let dilated = Uint8Array.from(barrier);
for (let pass = 0; pass < 2; pass++) {
  const next = Uint8Array.from(dilated);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (dilated[i]) continue;
      if (
        dilated[i - 1] ||
        dilated[i + 1] ||
        dilated[i - w] ||
        dilated[i + w]
      ) {
        next[i] = 1;
      }
    }
  }
  dilated = next;
}

function isOutsideCandidate(i) {
  return !dilated[i];
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
