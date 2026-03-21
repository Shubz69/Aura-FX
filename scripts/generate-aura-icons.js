/**
 * Build square PWA / favicon / apple-touch PNGs:
 * deep dark grey canvas, trimmed A7 (optical center), large contain-fit logo, rounded square mask.
 *
 * Run from repo root: node scripts/generate-aura-icons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const LOGO = path.join(ROOT, 'public', 'logos', 'a7-logo.png');
const OUT_DIR = path.join(ROOT, 'public', 'icons');

/** Premium flat dark grey (not navy, not pure black) */
const BG = { r: 40, g: 40, b: 44, alpha: 1 };
const BG_HEX = '#28282c';

/** ~15–18% clear margin each side → logo uses ~64–70% of canvas width/height as max box */
const STANDARD_LOGO_SCALE = 0.7;
/** Android maskable safe zone — smaller effective logo */
const MASKABLE_LOGO_SCALE = 0.56;

/** Corner radius as fraction of side (consistent squircle-style app icon across sizes) */
const CORNER_RADIUS_RATIO = 0.224;

let _trimmedLogoCache = null;

async function getTrimmedLogoBuffer() {
  if (_trimmedLogoCache) return _trimmedLogoCache;
  _trimmedLogoCache = await sharp(LOGO)
    .ensureAlpha()
    .trim({ threshold: 2 })
    .png()
    .toBuffer();
  return _trimmedLogoCache;
}

/**
 * Rounded-square mask: keeps interior, makes corners transparent (dest-in with opaque rounded rect).
 */
async function applyRoundedSquare(size, rgbaBuffer) {
  const rx = Math.max(1, Math.round(size * CORNER_RADIUS_RATIO));
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" rx="${rx}" ry="${rx}" fill="#ffffff"/>
    </svg>`
  );
  return sharp(rgbaBuffer).composite([{ input: svg, blend: 'dest-in' }]).png();
}

/**
 * @param {number} size canvas px
 * @param {number} logoScale max box as fraction of side (logo scaled with fit: inside, no stretch)
 */
async function renderIcon(size, logoScale) {
  const trimmed = await getTrimmedLogoBuffer();
  const innerMax = Math.max(2, Math.round(size * logoScale));

  const logoBuf = await sharp(trimmed)
    .resize({
      width: innerMax,
      height: innerMax,
      fit: 'inside',
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  const lm = await sharp(logoBuf).metadata();
  const w = lm.width || innerMax;
  const h = lm.height || innerMax;
  const left = Math.floor((size - w) / 2);
  const top = Math.floor((size - h) / 2);

  const flat = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: logoBuf, left, top }])
    .png()
    .toBuffer();

  return applyRoundedSquare(size, flat);
}

async function main() {
  if (!fs.existsSync(LOGO)) {
    console.error('Missing logo:', LOGO);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  _trimmedLogoCache = null;

  const files = [
    [16, 'favicon-16.png', STANDARD_LOGO_SCALE],
    [32, 'favicon-32.png', STANDARD_LOGO_SCALE],
    [48, 'favicon-48.png', STANDARD_LOGO_SCALE],
    [180, 'apple-touch-icon.png', STANDARD_LOGO_SCALE],
    [192, 'icon-192.png', STANDARD_LOGO_SCALE],
    [512, 'icon-512.png', STANDARD_LOGO_SCALE],
  ];

  for (const [sz, name, scale] of files) {
    const pipeline = await renderIcon(sz, scale);
    await pipeline.toFile(path.join(OUT_DIR, name));
    console.log('Wrote', path.join('public/icons', name));
  }

  const maskable = await renderIcon(512, MASKABLE_LOGO_SCALE);
  await maskable.toFile(path.join(OUT_DIR, 'icon-512-maskable.png'));
  console.log('Wrote public/icons/icon-512-maskable.png');

  console.log(`Done. Background ${BG_HEX}, trim+center, rounded ${(CORNER_RADIUS_RATIO * 100).toFixed(1)}% radius`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
