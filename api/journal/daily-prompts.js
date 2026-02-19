/**
 * Daily journal prompts: table + seed + pick next for user (rotate by history)
 */
const { executeQuery, addColumnIfNotExists } = require('../db');

let schemaReady = false;

async function ensurePromptsSchema() {
  if (schemaReady) return;
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS journal_daily_prompts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        prompt_text VARCHAR(500) NOT NULL,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sort (sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS journal_prompt_history (
        user_id INT NOT NULL,
        prompt_id INT NOT NULL,
        local_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, local_date),
        INDEX idx_prompt (prompt_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    schemaReady = true;
    await seedPromptsIfEmpty();
  } catch (e) {
    console.warn('journal_daily_prompts schema:', e.message);
    schemaReady = true;
  }
}

async function seedPromptsIfEmpty() {
  const [rows] = await executeQuery('SELECT COUNT(*) as c FROM journal_daily_prompts');
  const count = rows && rows[0] && rows[0].c ? Number(rows[0].c) : 0;
  if (count > 0) return;
  const defaults = [
    'What’s one thing you want to accomplish today?',
    'How are you feeling about your trading plan this week?',
    'What did you learn from the markets yesterday?',
    'What’s one habit you want to strengthen today?',
    'How can you improve your risk management today?',
    'What are you grateful for in your trading journey?',
    'What’s the single most important task for your growth today?',
    'How will you stay disciplined today?',
    'What would make today a win for you?',
    'What’s one small step toward your long-term goal?'
  ];
  for (let i = 0; i < defaults.length; i++) {
    await executeQuery(
      'INSERT INTO journal_daily_prompts (prompt_text, sort_order) VALUES (?, ?)',
      [defaults[i], i]
    );
  }
  console.log('journal_daily_prompts seeded with', defaults.length, 'prompts');
}

function getRows(result) {
  if (!result) return [];
  if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) return result[0];
  return Array.isArray(result) ? result : [];
}

async function pickPromptForUser(userId, localDate) {
  await ensurePromptsSchema();
  const [all] = await executeQuery(
    'SELECT id, prompt_text FROM journal_daily_prompts ORDER BY sort_order, id'
  );
  const prompts = getRows(all);
  if (prompts.length === 0) return 'What did you improve today?';
  const [used] = await executeQuery(
    'SELECT prompt_id FROM journal_prompt_history WHERE user_id = ? ORDER BY local_date DESC LIMIT 50',
    [userId]
  );
  const usedIds = new Set(getRows(used).map(r => r.prompt_id));
  const available = prompts.filter(p => !usedIds.has(p.id));
  const pool = available.length > 0 ? available : prompts;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  try {
    await executeQuery(
      'INSERT INTO journal_prompt_history (user_id, prompt_id, local_date) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE prompt_id = VALUES(prompt_id)',
      [userId, chosen.id, localDate]
    );
  } catch (e) {
    // ignore
  }
  return chosen.prompt_text;
}

module.exports = { ensurePromptsSchema, pickPromptForUser, seedPromptsIfEmpty };
