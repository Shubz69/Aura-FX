'use strict';

const assert = require('assert');
const { promoteAuraBriefPlaintextToMarkdown } = require('../src/utils/promoteAuraBriefHeadings');

const glued =
  'Forex Daily Brief Sat. Market Context first para here Key Developments second bit Market Impact third Key Levels and Metrics last';

const out = promoteAuraBriefPlaintextToMarkdown(glued);
assert.ok(out.includes('## Market Context'), out);
assert.ok(out.includes('## Key Developments'), out);
assert.ok(out.includes('## Market Impact'), out);
assert.ok(out.includes('## Key Levels and Metrics'), out);
console.log('OK promote-aura-brief-headings');
