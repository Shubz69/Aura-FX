import { buildReplayMentorExport } from './replayExportEngine';

/**
 * Plain-text mentor / desk handoff for copy/paste (no export service).
 * @param {object} session
 * @param {object[]|null} allSessions — optional; adds pattern + profile lines when provided
 */
export function buildMentorSummaryText(session, allSessions = null) {
  return buildReplayMentorExport(session, Array.isArray(allSessions) ? allSessions : []);
}
