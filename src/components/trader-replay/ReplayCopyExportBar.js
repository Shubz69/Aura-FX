import React, { useMemo, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  buildReplayExportBundle,
  downloadTextFile,
  suggestReplayExportFilename,
} from '../../lib/trader-replay/replayExportEngine';
import { formatReplayPackageBundlePlain } from '../../lib/trader-replay/replayPackageEngine';
import { formatReplayNarrativeBundlePlain } from '../../lib/trader-replay/replayNarrativeEngine';
import {
  buildReplayLongHorizonReviewPack,
  buildReplayMonthlyCoachingPack,
  buildReplayMonthlyReflectionPack,
  buildReplayWeeklyReflectionPack,
  buildReplayWeeklyReviewPack,
  formatReplayLongHorizonReviewPackPlain,
  formatReplayMonthlyCoachingPackPlain,
  formatReplayMonthlyReflectionPackPlain,
  formatReplayWeeklyReflectionPackPlain,
  formatReplayWeeklyReviewPackPlain,
} from '../../lib/trader-replay/replayCoachingPackEngine';

async function copyText(text, okMessage) {
  const payload = String(text || '').trim();
  if (!payload) {
    toast.error('Nothing to copy');
    return;
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
      toast.success(okMessage);
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = payload;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast.success(okMessage);
  } catch {
    toast.error('Copy not available — allow clipboard or select text manually');
  }
}

/**
 * Compact copy / light .txt export for replay finish + workspace.
 * @param {'modal'|'rail'} variant
 */
export default function ReplayCopyExportBar({
  session,
  allSessions = [],
  replayFlags = {},
  variant = 'modal',
  librarySessions = null,
  habitStats = null,
}) {
  const bundle = useMemo(() => buildReplayExportBundle(session, allSessions), [session, allSessions]);
  const showMentor = replayFlags?.mentorSummaryCopy === true;
  const hasExample = Boolean(session?.learningExample) && Boolean(bundle.learningExampleCard);

  const onDownloadBundle = useCallback(() => {
    try {
      const parts = [
        '--- STANDARD ---\n',
        bundle.standard,
        '\n\n--- MENTOR ---\n',
        bundle.mentor,
        '\n\n--- SHARE ---\n',
        bundle.shortShare,
      ];
      if (showMentor) {
        parts.push('\n\n--- INTERNAL ---\n', bundle.internalNote);
      }
      if (hasExample) {
        parts.push('\n\n--- EXAMPLE CARD ---\n', bundle.learningExampleCard);
      }
      if (Array.isArray(librarySessions)) {
        parts.push('\n\n--- REVIEW PACKAGES ---\n', formatReplayPackageBundlePlain(librarySessions, habitStats));
        parts.push('\n\n--- REVIEW NARRATIVES ---\n', formatReplayNarrativeBundlePlain(librarySessions, habitStats));
        parts.push(
          '\n\n--- TRADER WEEKLY REFLECTION (SELF-REVIEW) ---\n',
          formatReplayWeeklyReflectionPackPlain(buildReplayWeeklyReflectionPack(librarySessions, habitStats))
        );
        parts.push(
          '\n\n--- TRADER MONTHLY REFLECTION (SELF-REVIEW) ---\n',
          formatReplayMonthlyReflectionPackPlain(buildReplayMonthlyReflectionPack(librarySessions, habitStats))
        );
        parts.push(
          '\n\n--- TRADER LONG-HORIZON REVIEW (SELF-REVIEW) ---\n',
          formatReplayLongHorizonReviewPackPlain(buildReplayLongHorizonReviewPack(librarySessions, habitStats))
        );
        parts.push(
          '\n\n--- WEEKLY REVIEW PACK ---\n',
          formatReplayWeeklyReviewPackPlain(buildReplayWeeklyReviewPack(librarySessions, habitStats))
        );
        parts.push(
          '\n\n--- MONTHLY COACHING PACK ---\n',
          formatReplayMonthlyCoachingPackPlain(buildReplayMonthlyCoachingPack(librarySessions, habitStats))
        );
      }
      downloadTextFile(suggestReplayExportFilename(session, 'bundle'), parts.join(''));
      toast.success('Download started');
    } catch {
      toast.error('Download failed');
    }
  }, [bundle, hasExample, session, showMentor, librarySessions, habitStats]);

  return (
    <div className={`aura-tr-copy-bar aura-tr-copy-bar--${variant}`}>
      <span className="aura-tr-copy-bar-label">Copy / share</span>
      <div className="aura-tr-copy-bar-btns">
        <button
          type="button"
          className="trader-suite-btn aura-tr-copy-btn"
          onClick={() => copyText(bundle.standard, 'Copied standard summary')}
        >
          Standard
        </button>
        <button
          type="button"
          className="trader-suite-btn aura-tr-copy-btn"
          onClick={() => copyText(bundle.shortShare, 'Copied share snippet')}
        >
          Share
        </button>
        {showMentor ? (
          <>
            <button
              type="button"
              className="trader-suite-btn aura-tr-copy-btn"
              onClick={() => copyText(bundle.mentor, 'Copied mentor summary')}
            >
              Mentor
            </button>
            <button
              type="button"
              className="trader-suite-btn aura-tr-copy-btn"
              onClick={() => copyText(bundle.internalNote, 'Copied internal note')}
            >
              Internal
            </button>
          </>
        ) : null}
        {hasExample ? (
          <button
            type="button"
            className="trader-suite-btn aura-tr-copy-btn"
            onClick={() => copyText(bundle.learningExampleCard, 'Copied example card')}
          >
            Example
          </button>
        ) : null}
        {showMentor ? (
          <button
            type="button"
            className="trader-suite-btn aura-tr-copy-btn aura-tr-copy-btn--file"
            onClick={onDownloadBundle}
          >
            .txt bundle
          </button>
        ) : null}
      </div>
    </div>
  );
}
