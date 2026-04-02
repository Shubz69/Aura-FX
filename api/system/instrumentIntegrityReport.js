/**
 * Server-safe instrument integrity report (no ESM imports from src).
 */

const fs = require('fs');
const path = require('path');

function upperSym(s) {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function readUtf8Safe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function extractSymbolsFromSource(src, pattern) {
  const out = [];
  if (!src) return out;
  const re = new RegExp(pattern.source, 'g');
  let m;
  while ((m = re.exec(src))) {
    out.push(m[1]);
  }
  return out;
}

function getDeclarationDuplicatesFromSources(repoRoot) {
  const aura = path.join(repoRoot, 'src', 'lib', 'aura-analysis');
  const defs = [
    {
      file: path.join(aura, 'instruments.js'),
      pattern: /(?:spec|stockSpec)\(\s*['"]([^'"]+)['"]\s*,\s*['"]/,
    },
    { file: path.join(aura, 'instrumentsCommodities.js'), pattern: /commodityRow\(\s*['"]([^'"]+)['"]/ },
  ];
  const counts = new Map();
  for (const { file, pattern } of defs) {
    const txt = readUtf8Safe(file);
    if (!txt) continue;
    for (const sym of extractSymbolsFromSource(txt, pattern)) {
      const n = upperSym(sym);
      if (!n) continue;
      counts.set(n, (counts.get(n) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c > 1)
    .map(([symbol, declarationCount]) => ({ symbol, declarationCount }));
}

function findAliasStructuralIssues(symbolAliases) {
  const aliases = symbolAliases || {};
  const issues = [];
  for (const [k, v] of Object.entries(aliases)) {
    const from = upperSym(k);
    const target = upperSym(v);
    if (!from) continue;
    if (!target) {
      issues.push({ type: 'empty_alias_target', from, rawTarget: v });
      continue;
    }
    const rawNext = aliases[target];
    if (rawNext == null) continue;
    const next = upperSym(rawNext);
    if (next && next !== target) {
      issues.push({
        type: 'chained_alias',
        from,
        to: target,
        resolvesFurtherTo: next,
      });
    }
  }
  return issues;
}

function countUniqueCalculatorSymbols(repoRoot) {
  const aura = path.join(repoRoot, 'src', 'lib', 'aura-analysis');
  const defs = [
    {
      file: path.join(aura, 'instruments.js'),
      pattern: /(?:spec|stockSpec)\(\s*['"]([^'"]+)['"]\s*,\s*['"]/,
    },
    { file: path.join(aura, 'instrumentsCommodities.js'), pattern: /commodityRow\(\s*['"]([^'"]+)['"]/ },
  ];
  const set = new Set();
  for (const { file, pattern } of defs) {
    const txt = readUtf8Safe(file);
    if (!txt) continue;
    for (const sym of extractSymbolsFromSource(txt, pattern)) {
      const n = upperSym(sym);
      if (n) set.add(n);
    }
  }
  return set.size;
}

function collectSymbolsMissingBehaviour(registry) {
  const specs = registry.commodityCalculationSpecs || {};
  const missing = [];
  for (const sym of Object.keys(specs)) {
    const row = specs[sym];
    if (row && !row.subCategory) missing.push(upperSym(sym));
  }
  return missing;
}

function collectMissingCommoditySpecs(registry, getWatchlistPayload) {
  const specs = registry.commodityCalculationSpecs || {};
  const missing = [];
  const seen = new Set();

  const pushMissing = (sym) => {
    const s = upperSym(sym);
    if (!s || specs[s] || seen.has(s)) return;
    seen.add(s);
    missing.push(s);
  };

  try {
    const wl = getWatchlistPayload();
    const comm = wl.groups?.commodities?.symbols || [];
    for (const row of comm) pushMissing(row.symbol);
  } catch {
    /* watchlist optional */
  }

  for (const row of registry.commoditiesWatchlist || []) {
    pushMissing(row.symbol);
  }

  return missing;
}

/**
 * @param {string} repoRoot - repo root (contains src/)
 * @param {object} registry - instrumentRegistry.json
 * @param {() => object} getWatchlistPayload
 */
function buildInstrumentIntegrityReport(repoRoot, registry, getWatchlistPayload) {
  const duplicateCanonicalSymbols = getDeclarationDuplicatesFromSources(repoRoot);
  const aliasMismatches = findAliasStructuralIssues(registry.symbolAliases);
  const missingCommodityCalculationSpecs = collectMissingCommoditySpecs(registry, getWatchlistPayload);
  const symbolsMissingBehaviour = collectSymbolsMissingBehaviour(registry);
  const totalSymbols = countUniqueCalculatorSymbols(repoRoot);
  const totalAliases = Object.keys(registry.symbolAliases || {}).length;
  const totalCommodities = Object.keys(registry.commodityCalculationSpecs || {}).length;

  const registryConsistency = {
    ok:
      duplicateCanonicalSymbols.length === 0 &&
      aliasMismatches.length === 0 &&
      missingCommodityCalculationSpecs.length === 0,
    duplicateDeclarationCount: duplicateCanonicalSymbols.length,
    aliasIssueCount: aliasMismatches.length,
    missingSpecCount: missingCommodityCalculationSpecs.length,
  };

  const systemStatus = {
    registry:
      missingCommodityCalculationSpecs.length === 0 && aliasMismatches.length === 0 ? 'healthy' : 'degraded',
    calculator: duplicateCanonicalSymbols.length === 0 ? 'healthy' : 'degraded',
    aliases: aliasMismatches.length === 0 ? 'healthy' : 'degraded',
  };

  return {
    timestamp: new Date().toISOString(),
    totalSymbols,
    totalAliases,
    totalCommodities,
    missingCommodityCalculationSpecs,
    symbolsMissingCalculationSpec: missingCommodityCalculationSpecs,
    symbolsMissingBehaviour,
    aliasMismatches,
    duplicateCanonicalSymbols,
    registryConsistency,
    systemStatus,
  };
}

module.exports = { buildInstrumentIntegrityReport };
