const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const files = execSync('git ls-files src', { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((f) => /\.(js|jsx|ts|tsx|css|md|html|json)$/i.test(f));

function decodeSuspiciousToken(token) {
  try {
    const bytes = Buffer.from(token, 'latin1');
    const decoded = bytes.toString('utf8');
    if (!decoded || decoded.includes('\uFFFD')) return token;
    return decoded;
  } catch {
    return token;
  }
}

function cleanText(input) {
  let out = input;

  // Cheap direct fixes
  out = out
    .replace(/Â£/g, '£')
    .replace(/Â©/g, '©')
    .replace(/Â·/g, '·')
    .replace(/Ã—/g, '×')
    .replace(/â–¼/g, '▼');

  // Decode token-level mojibake fragments (emoji/punctuation sequences)
  out = out.replace(/[ÂÃâð][^\s"'`<>)\]}]*/g, (token) => decodeSuspiciousToken(token));

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
