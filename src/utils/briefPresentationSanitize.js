'use strict';

/**
 * Normalizes Trader Desk brief plain-text / markdown for storage and preview:
 * removes asterisks and dash-like separators, restores readable sentence case when the model
 * returns shoutcase, preserves markdown headings (# … ## …).
 */

function stripAsterisks(text) {
  return String(text || '').replace(/\*/g, '');
}

/** `* item` bullets → `- item` so emphasis stripping does not destroy lists. */
function convertLeadingAsteriskBulletsToDash(text) {
  return String(text || '').replace(/^(\s*)\*\s+/gm, '$1- ');
}

/**
 * CommonMark only treats `##` headings when the hashes start the line (after up to three spaces).
 * Models often glue `## Section` onto the previous sentence; insert blank lines so headings parse.
 */
function ensureMarkdownHeadingsBreakLines(text) {
  let s = String(text || '');
  for (let i = 0; i < 8; i += 1) {
    const next = s
      .replace(/([^\n#])(#{2,6})(?=\s+)/g, '$1\n\n$2')
      .replace(/([^\n#])(#{2,6})(?=[A-Za-z0-9\u00C0-\u024F])/g, '$1\n\n$2 ');
    if (next === s) break;
    s = next;
  }
  return s;
}

function collapseCommaRuns(text) {
  return String(text || '')
    .replace(/,\s*,+/g, ', ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n');
}

/** Separator cleanup on a single line (preserves newlines via caller). */
function normalizeSeparatorsLine(line) {
  let L = String(line || '');
  L = L.replace(/[\u2014\u2013]/g, ', ');
  while (/\s-\s/.test(L)) {
    L = L.replace(/\s-\s/g, ', ');
  }
  // Keep line-leading "- word" as Markdown list syntax for ReactMarkdown (do not replace with •).
  return L;
}

function normalizeSeparatorsPreserveNewlines(text) {
  return String(text || '')
    .split('\n')
    .map(normalizeSeparatorsLine)
    .join('\n');
}

function isMostlyUppercase(s) {
  const letters = [...String(s)].filter((c) => /[a-zA-Z]/.test(c));
  if (letters.length < 10) return false;
  const up = letters.filter((c) => c === c.toUpperCase()).length;
  return up / letters.length >= 0.72;
}

function toSentenceCaseBlock(block) {
  const raw = String(block || '').trim();
  if (!raw || !isMostlyUppercase(raw)) return block;
  let lower = raw.toLowerCase();
  const parts = lower.split(/(?<=[.!?])\s+/);
  const rebuilt = parts
    .filter(Boolean)
    .map((sent) => {
      const t = sent.trim();
      if (!t.length) return '';
      return t.charAt(0).toUpperCase() + t.slice(1);
    })
    .join(' ');
  return rebuilt;
}

function transformPlainBlock(block) {
  const b = String(block || '');
  if (!b.trim()) return block;
  const paras = b.split(/\n\n+/);
  return paras.map((p) => toSentenceCaseBlock(p)).join('\n\n');
}

function applySentenceCaseOutsideHeadings(text) {
  const lines = String(text || '').split('\n');
  const chunks = [];
  let buf = [];
  const flush = () => {
    if (buf.length) {
      chunks.push({ kind: 'plain', text: buf.join('\n') });
      buf = [];
    }
  };
  for (const line of lines) {
    if (/^\s*#{1,6}\s/.test(line)) {
      flush();
      chunks.push({ kind: 'heading', text: line });
    } else {
      buf.push(line);
    }
  }
  flush();
  return chunks
    .map((c) => (c.kind === 'heading' ? c.text : transformPlainBlock(c.text)))
    .join('\n');
}

/**
 * Full pass for automated brief bodies (markdown-friendly).
 * @param {{ preserveEmphasis?: boolean }} [opts] — when true, keep `*` so **bold** survives for ReactMarkdown preview.
 */
function polishBriefMarkdown(markdown, opts = {}) {
  let t = String(markdown || '');
  if (!opts.preserveEmphasis) {
    t = convertLeadingAsteriskBulletsToDash(t);
    t = stripAsterisks(t);
  }
  t = t.replace(/^\s*---+?\s*$/gm, '');
  t = normalizeSeparatorsPreserveNewlines(t);
  t = collapseCommaRuns(t);
  t = applySentenceCaseOutsideHeadings(t);
  return String(t || '').trim();
}

/**
 * Preview-only: break very long prose blocks (one huge paragraph) into several Markdown
 * paragraphs so ReactMarkdown renders readable spacing like a Word document.
 */
function splitLongTextIntoParagraphs(text, maxLen = 500) {
  const parts = [];
  let rest = String(text || '').trim();
  if (!rest || rest.length <= maxLen) return text;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('. ', maxLen);
    if (cut >= 100) {
      cut += 2;
    } else {
      cut = rest.indexOf('. ', 60);
      if (cut !== -1) cut += 2;
      else {
        cut = rest.lastIndexOf(' ', maxLen);
        if (cut < maxLen * 0.45) {
          cut = maxLen;
        }
      }
    }
    if (cut <= 0 || cut >= rest.length) {
      parts.push(rest);
      return parts.join('\n\n');
    }
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.join('\n\n');
}

function splitLongProseParagraphsForPreview(markdown) {
  const raw = String(markdown || '');
  if (!raw.trim()) return raw;
  const blocks = raw.split(/\n\n+/);
  const refined = blocks.map((block) => {
    const b = block.trim();
    if (!b) return block;
    if (b.includes('```')) return block;
    if (/^#{1,6}\s/m.test(b)) return block;
    if (/^\s*[-*]\s/m.test(b)) return block;
    if (/^\s*\d+[.)]\s/m.test(b)) return block;
    if (b.length < 520) return block;
    const oneLine = b.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim();
    if (oneLine.length < 520) return block;
    return splitLongTextIntoParagraphs(oneLine, 500);
  });
  return refined.join('\n\n');
}

module.exports = {
  polishBriefMarkdown,
  splitLongProseParagraphsForPreview,
  ensureMarkdownHeadingsBreakLines,
};
