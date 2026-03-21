/**
 * Build square PWA / favicon / apple-touch PNGs:
 * deep navy canvas + centered A7 logo (contain fit, no stretch).
 *
 * Run from repo root: node scripts/generate-aura-icons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const LOGO = path.join(ROOT, 'public', 'logos', 'a7-logo.png');
const OUT_DIR = path.join(ROOT, 'public', 'icons');

/** Deep luxury navy — solid, no white */
const NAVY = { r: 13, g: 27, b: 42, alpha: 1 };

/**
 * @param {number} size canvas px
 * @param {number} logoScale max fraction of side for logo bounding box (contain inside)
 */
async function renderIcon(size, logoScale) {
  const innerMax = Math.max(2, Math.round(size * logoScale));
  const logoBuf = await sharp(LOGO)
    .ensureAlpha()
    .resize({
      width: innerMax,
      height: innerMax,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer();

  const lm = await sharp(logoBuf).metadata();
  const w = lm.width || innerMax;
  const h = lm.height || innerMax;
  const left = Math.floor((size - w) / 2);
  const top = Math.floor((size - h) / 2);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: NAVY,
    },
  }).composite([{ input: logoBuf, left, top }]);
}

async function main() {
  if (!fs.existsSync(LOGO)) {
    console.error('Missing logo:', LOGO);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const standardScale = 0.66;
  const maskableScale = 0.5;

  const files = [
    [16, 'favicon-16.png', standardScale],
    [32, 'favicon-32.png', standardScale],
    [48, 'favicon-48.png', standardScale],
    [180, 'apple-touch-icon.png', standardScale],
    [192, 'icon-192.png', standardScale],
    [512, 'icon-512.png', standardScale],
  ];

  for (const [sz, name, scale] of files) {
    await (await renderIcon(sz, scale)).png().toFile(path.join(OUT_DIR, name));
    console.log('Wrote', path.join('public/icons', name));
  }

  await (await renderIcon(512, maskableScale)).png().toFile(path.join(OUT_DIR, 'icon-512-maskable.png'));
  console.log('Wrote public/icons/icon-512-maskable.png');

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
