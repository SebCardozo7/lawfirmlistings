/**
 * Renders a guide's share card from the guide's own cover art.
 *
 * Every guide needs a 1200x630 raster in public/og/, because Facebook, LinkedIn, Slack and X all
 * refuse to render an SVG. Until now that card was produced by hand, once per guide, from a
 * recipe written down in docs/guides-backlog.md and nowhere else. This is that recipe as a
 * script, so the next guide does not have to rediscover it.
 *
 * How it works: the built page already contains the finished scene as inline SVG, drawn by
 * CoverArt.astro. This lifts that element out of dist/, drops it onto the same night ground and
 * aurora the site frames it with, and screenshots the result at 1200x630 with the Chromium that
 * is already installed for Playwright. Nothing is redrawn and nothing is designed twice: if the
 * scene changes in the component, re-running this picks the change up.
 *
 * The one thing that must not change is the fit. The scene's viewBox is 1200x440 and the card is
 * 1200x630, so `preserveAspectRatio` has to be `meet`. With `slice` the scene fills the frame by
 * cropping, and at this aspect ratio that quietly cuts off the whole right-hand panel, which is
 * usually where the finding is.
 *
 * Usage:
 *   node scripts/make_og.mjs <guide-slug>          # reads the cover name from src/data/guides.ts
 *   node scripts/make_og.mjs <guide-slug> --out language
 *
 * Requires `npm run build` to have run first, since it reads dist/.
 */
import { readFileSync, writeFileSync, mkdtempSync, existsSync, globSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { deflateSync, inflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = 1200;
const H = 630;
// Headless Chromium paints a viewport shorter than the window it is given, by a fixed amount on
// this build, and screenshots the window rather than the viewport. Asking for exactly 1200x630
// therefore returns an image of the right size with a white band along the bottom, which is a
// build that passes and a share card that is broken. So the window is overshot, the deficit is
// measured from the render itself rather than assumed, and the image is cropped back to 630.
const OVERSHOOT = 160;

const [slug, ...rest] = process.argv.slice(2);
if (!slug) {
  console.error('usage: node scripts/make_og.mjs <guide-slug> [--out <name>]');
  process.exit(2);
}
const outFlag = rest.indexOf('--out');
const page = `dist/guides/${slug}/index.html`;
if (!existsSync(page)) {
  console.error(`${page} not found. Run npm run build first.`);
  process.exit(2);
}

// The cover name decides the file name, so a card lands where <Base image="/og/<name>.png" />
// already points. Taken from the manifest rather than from an argument, because the manifest is
// what the page itself reads.
const manifest = readFileSync('src/data/guides.ts', 'utf8');
const entry = manifest.split('{').find(b => b.includes(`slug: '${slug}'`)) ?? '';
const coverName = outFlag >= 0
  ? rest[outFlag + 1]
  : (entry.match(/cover:\s*'([^']+)'/)?.[1] ?? null);
if (!coverName) {
  console.error(`no cover set for ${slug} in src/data/guides.ts, and no --out given`);
  process.exit(2);
}

const html = readFileSync(page, 'utf8');
const svg = html.match(/<svg class="cover-art"[\s\S]*?<\/svg>/)?.[0];
if (!svg) {
  console.error(`no cover-art svg in ${page}`);
  process.exit(2);
}
// Fit, not fill. See the note at the top of this file.
const fitted = svg.replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="xMidYMid meet"');

// The night ground and the three aurora blobs, copied in their static form. The site animates
// them; a screenshot cannot show motion, so they are placed at rest where the page's own cover
// panel puts them.
const card = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; }
  .card {
    position: relative; width: 1200px; height: 630px; overflow: hidden;
    background: radial-gradient(120% 140% at 12% 0%, #23104F 0%, #150B32 45%, #0B0718 100%);
  }
  .card i {
    position: absolute; border-radius: 50%; filter: blur(90px); opacity: .55;
  }
  .b1 { width: 620px; height: 620px; left: -150px; top: -220px; background: #6D28D9; }
  .b2 { width: 560px; height: 560px; right: -170px; top: -140px; background: #2563EB; }
  .b3 { width: 520px; height: 520px; right: 120px; bottom: -280px; background: #0D9488; opacity: .45; }
  svg.cover-art { position: absolute; inset: 0; width: 1200px; height: 630px; }
</style></head><body>
  <div class="card"><i class="b1"></i><i class="b2"></i><i class="b3"></i>${fitted}</div>
</body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'lfl-og-'));
const src = join(dir, 'card.html');
writeFileSync(src, card);

const chrome = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0];
if (!chrome) {
  console.error('no chromium under /opt/pw-browsers/');
  process.exit(2);
}
const shot = join(dir, 'shot.png');
execFileSync(chrome, [
  '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=1', `--window-size=${W},${H + OVERSHOOT}`,
  `--screenshot=${shot}`, `file://${src}`,
], { stdio: ['ignore', 'ignore', 'inherit'] });

/**
 * PNG in, PNG out, cropped to the first `rows` scanlines.
 *
 * Written by hand because the repository has no image dependency and adding one to crop a
 * rectangle would be the tail wagging the dog. Chromium writes 8-bit RGB or RGBA, non-interlaced,
 * which is the only case handled: anything else throws rather than writing a silently wrong card.
 */
function cropTop(file, rows) {
  const png = readFileSync(file);
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let pos = 8, w = 0, h = 0, depth = 0, color = 0;
  const idat = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const body = png.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4);
      depth = body[8]; color = body[9];
      if (depth !== 8 || (color !== 2 && color !== 6) || body[12] !== 0) {
        throw new Error(`unsupported png: depth ${depth}, color ${color}, interlace ${body[12]}`);
      }
    }
    if (type === 'IDAT') idat.push(body);
    pos += 12 + len;
  }
  if (rows > h) throw new Error(`asked for ${rows} rows of a ${h}-row image`);
  const ch = color === 2 ? 3 : 4;
  const stride = w * ch;
  const raw = inflateSync(Buffer.concat(idat));
  // Undo the per-scanline filters, then re-emit every kept row unfiltered. Cropping without
  // unfiltering would be wrong for any row whose filter refers to the row above it.
  const out = Buffer.alloc(rows * (stride + 1));
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < rows; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 255;
      else if (filter === 2) line[i] = (line[i] + b) & 255;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    out[y * (stride + 1)] = 0;
    line.copy(out, y * (stride + 1) + 1);
    prev = line;
  }
  const chunk = (type, body) => {
    const buf = Buffer.alloc(12 + body.length);
    buf.writeUInt32BE(body.length, 0);
    buf.write(type, 4, 'ascii');
    body.copy(buf, 8);
    buf.writeInt32BE(crc(buf.subarray(4, 8 + body.length)) | 0, 8 + body.length);
    return buf;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(rows, 4);
  ihdr[8] = 8; ihdr[9] = color;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(out, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return c ^ -1;
}

const out = `public/og/${coverName}.png`;
writeFileSync(out, cropTop(shot, H));
console.log(`${out} written from ${page}, ${W}x${H}`);
