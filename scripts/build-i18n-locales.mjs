/**
 * Builds src/i18n/locales/<lang>/common.json from scripts/i18n-part*.mjs row data.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { rows as rows1 } from './i18n-part1.mjs';
import { rows as rows2 } from './i18n-part2.mjs';
import { rows as rows3 } from './i18n-part3.mjs';
import { rows as rows4 } from './i18n-part4.mjs';
import { rows as rows5 } from './i18n-part5.mjs';
import { rows as rows6 } from './i18n-part6.mjs';
import { rows as rows7 } from './i18n-part7.mjs';
import { rows as rows8 } from './i18n-part8.mjs';
import { rows as rows9 } from './i18n-part9-traderdeck-ui.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outRoot = path.join(root, 'src', 'i18n', 'locales');

const LANGS = ['en', 'zh-CN', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur'];

const rows = [...rows1, ...rows2, ...rows3, ...rows4, ...rows5, ...rows6, ...rows7, ...rows8, ...rows9];

function setPath(obj, parts, value) {
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function flattenKeys(obj, prefix = '') {
  const keys = [];
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const k of Object.keys(obj).sort()) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
        keys.push(...flattenKeys(obj[k], p));
      } else {
        keys.push(p);
      }
    }
  }
  return keys;
}

const seen = new Set();
for (const row of rows) {
  if (!row.k || typeof row.k !== 'string') {
    console.error('Row missing k:', row);
    process.exit(1);
  }
  if (seen.has(row.k)) {
    console.error('Duplicate key:', row.k);
    process.exit(1);
  }
  seen.add(row.k);
  for (const lng of LANGS) {
    if (typeof row[lng] !== 'string') {
      console.error(`Row ${row.k} missing string for ${lng}`);
      process.exit(1);
    }
  }
}

for (const lng of LANGS) {
  const tree = {};
  for (const row of rows) {
    setPath(tree, row.k.split('.'), row[lng]);
  }
  const dir = path.join(outRoot, lng);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'common.json'), `${JSON.stringify(tree, null, 2)}\n`, 'utf8');
}

const ref = JSON.parse(fs.readFileSync(path.join(outRoot, 'en', 'common.json'), 'utf8'));
const refKeys = new Set(flattenKeys(ref));
for (const lng of LANGS) {
  const tree = JSON.parse(fs.readFileSync(path.join(outRoot, lng, 'common.json'), 'utf8'));
  const keys = new Set(flattenKeys(tree));
  if (keys.size !== refKeys.size) {
    console.error(`Key count mismatch ${lng}: ${keys.size} vs en ${refKeys.size}`);
    process.exit(1);
  }
  for (const k of refKeys) {
    if (!keys.has(k)) {
      console.error(`${lng} missing key ${k}`);
      process.exit(1);
    }
  }
}

console.log(`Built ${rows.length} keys × ${LANGS.length} locales into ${outRoot}`);
