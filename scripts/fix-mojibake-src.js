const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const files = execSync('git ls-files', { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((f) => /\.(js|jsx|ts|tsx|css|md|html|json|mjs|cjs|py|sql|txt|ya?ml)$/i.test(f));

const replacementMap = new Map([
  ['\u00c2\u00a3', '£'],
  ['\u00c2\u00a9', '©'],
  ['\u00c2\u00b7', '·'],
  ['\u00c2\u00ae', '®'],
  ['\u00c2\u00b0', '°'],
  ['\u00c3\u2014', '×'],
  ['\u00e2\u20ac\u201c', '–'],
  ['\u00e2\u20ac\u201d', '—'],
  ['\u00e2\u20ac\u00a6', '…'],
  ['\u00e2\u20ac\u0153', '“'],
  ['\u00e2\u20ac\u009d', '”'],
  ['\u00e2\u20ac\u02dc', '‘'],
  ['\u00e2\u20ac\u2122', '’'],
  ['\u00e2\u20ac\u00a2', '•'],
  ['\u00e2\u2013\u00bc', '▼'],
  ['\ufffd', '—'],
]);

const brandPatterns = [
  /\bA\u0075ra\u0020Terminal\b(?!™)/g,
  /\bAURA\u0020TERMINAL\b(?!™)/g,
  /\baura\u0020terminal\b(?!™)/g,
];

function decodeSuspiciousToken(token) {
  const cp1252Reverse = new Map([
    ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87],
    ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91],
    ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97], ['˜', 0x98],
    ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
  ]);

  function toWin1252Bytes(value) {
    const bytes = [];
    for (const ch of value) {
      const code = ch.charCodeAt(0);
      if (code <= 0xff) {
        bytes.push(code);
      } else if (cp1252Reverse.has(ch)) {
        bytes.push(cp1252Reverse.get(ch));
      } else {
        return null;
      }
    }
    return bytes;
  }

  try {
    const winBytes = toWin1252Bytes(token);
    if (!winBytes) return token;
    const bytes = Buffer.from(winBytes);
    const decoded = bytes.toString('utf8');
    if (!decoded || decoded.includes('\uFFFD')) return token;
    return decoded;
  } catch {
    return token;
  }
}

function cleanText(input) {
  let out = input;

  for (const [bad, good] of replacementMap.entries()) {
    out = out.split(bad).join(good);
  }

  // Decode token-level mojibake fragments (emoji/punctuation sequences)
  out = out.replace(/[\u00c2\u00c3\u00e2\u00f0][^\s"'`<>)\]}]*/g, (token) => decodeSuspiciousToken(token));

  for (const pattern of brandPatterns) {
    out = out.replace(pattern, (match) => `${match}™`);
  }

  return out;
}

let changed = 0;
for (const rel of files) {
  const abs = path.join(root, rel);
  const before = fs.readFileSync(abs, 'utf8');
  const after = cleanText(before);
  if (after !== before) {
    fs.writeFileSync(abs, after, 'utf8');
    changed += 1;
  }
}

console.log(`updated_files=${changed}`);
