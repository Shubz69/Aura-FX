const crypto = require('crypto');
const { executeQuery } = require('../db');
const { computeRankScore, disruptionBoostFromRecord } = require('./scoring');
const {
  clusterIndices,
  canonicalClusterSignature,
  storySignatureFromPayload,
} = require('./storyline');

async function runCorroborationPass() {
  const [rows] = await executeQuery(
    `SELECT id, title, source, normalized_topic, story_id, story_signature,
            rank_score, trust_score, novelty_score, severity_score, market_impact_score, freshness_score,
            corroboration_count, event_type, countries, impacted_markets, published_at, detected_at
     FROM surveillance_events
     WHERE detected_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 96 HOUR)
     ORDER BY rank_score DESC, updated_at DESC
     LIMIT 280`,
    []
  );
  const list = rows || [];
  if (!list.length) return;

  /** Top band is clustered for story stability; tail rows still get per-event signatures. */
  const focus = list.slice(0, 240);
  const tail = list.slice(240);
  const clusters = clusterIndices(focus);

  for (const idxs of clusters) {
    if (idxs.length < 2) {
      const r = focus[idxs[0]];
      const sig = storySignatureFromPayload({
        title: r.title,
        countries: r.countries,
        event_type: r.event_type,
      });
      await executeQuery(`UPDATE surveillance_events SET story_signature = ? WHERE id = ?`, [sig, r.id]).catch(
        () => {}
      );
      continue;
    }

    const group = idxs.map((i) => focus[i]);
    const canonicalSig = canonicalClusterSignature(group);
    const distinctSources = new Set(group.map((g) => g.source)).size;
    const newCorr = group.length - 1;
    group.sort((a, b) => (b.rank_score || 0) - (a.rank_score || 0));
    const headline = (group[0].title || 'Surveillance storyline').slice(0, 500);
    const summary = `Developing narrative · ${group.length} items · ${distinctSources} sources`;

    let storyId = null;
    const [sigRows] = await executeQuery(
      `SELECT id FROM surveillance_stories WHERE signature = ? LIMIT 1`,
      [canonicalSig]
    ).catch(() => [[]]);
    if (sigRows && sigRows[0]) storyId = sigRows[0].id;

    const storyIdsInGroup = [...new Set(group.map((g) => g.story_id).filter(Boolean))];
    if (!storyId && storyIdsInGroup.length === 1) storyId = storyIdsInGroup[0];

    if (!storyId) {
      storyId = crypto.randomUUID();
      await executeQuery(
        `INSERT INTO surveillance_stories (id, headline, summary, event_count, signature)
         VALUES (?, ?, ?, ?, ?)`,
        [storyId, headline, summary, group.length, canonicalSig]
      ).catch(() => {});
    } else {
      await executeQuery(
        `UPDATE surveillance_stories SET headline = ?, summary = ?, event_count = ?, signature = COALESCE(signature, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [headline, summary, group.length, canonicalSig, storyId]
      ).catch(() => {});
    }

    for (const ev of group) {
      const bumpTrust = Math.min(16, (distinctSources - 1) * 4 + newCorr * 2);
      const newTrust = Math.min(100, Math.round((ev.trust_score || 50) + bumpTrust));
      const rank = computeRankScore({
        trust_score: newTrust,
        novelty_score: ev.novelty_score,
        freshness_score: ev.freshness_score,
        severity_score: ev.severity_score,
        market_impact_score: ev.market_impact_score,
        corroboration_count: newCorr,
        distinct_source_count: distinctSources,
        repetition_penalty: 0,
        disruption_boost: disruptionBoostFromRecord(ev),
      });
      await executeQuery(
        `UPDATE surveillance_events SET
           story_id = ?,
           story_signature = ?,
           corroboration_count = ?,
           verification_state = 'corroborated',
           trust_score = ?,
           rank_score = ?
         WHERE id = ?`,
        [storyId, canonicalSig, newCorr, newTrust, rank, ev.id]
      ).catch(() => {});
    }
  }

  for (const r of tail) {
    const sig = storySignatureFromPayload({
      title: r.title,
      countries: r.countries,
      event_type: r.event_type,
    });
    await executeQuery(`UPDATE surveillance_events SET story_signature = ? WHERE id = ?`, [sig, r.id]).catch(() => {});
  }
}

module.exports = { runCorroborationPass };
