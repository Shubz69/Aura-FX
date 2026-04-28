import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isRtlLanguage, normalizeSiteLanguage } from '../../utils/siteLanguage';
import { SUPPORTED_LANGUAGES } from '../../i18n/languages';
import {
  getCachedTranslation,
  invalidateMessageTranslation,
} from '../../utils/communityMessageTranslationCache';
import { scheduleCommunityTranslate } from '../../utils/communityTranslateBatch';

function langLabel(code) {
  const c = normalizeSiteLanguage(code) || 'en';
  return SUPPORTED_LANGUAGES.find((l) => l.code === c)?.label || c;
}

/**
 * Renders community message body with optional server translation (lazy-loaded in viewport).
 */
export default function CommunityMessageTranslatedBody({
  message,
  viewerLanguage,
  communityAutoTranslate,
  renderMessageContent,
}) {
  const { t, i18n } = useTranslation();
  const rootRef = useRef(null);
  const lastMessageSigRef = useRef('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);

  const numericId = Number(message.id);
  const hasNumericId = Number.isFinite(numericId) && numericId > 0;
  const originalText = message.originalText ?? message.content ?? '';
  const originalLanguage = normalizeSiteLanguage(message.originalLanguage) || 'en';
  const targetLanguage = normalizeSiteLanguage(viewerLanguage || i18n.language) || 'en';

  const needsTranslation =
    communityAutoTranslate &&
    hasNumericId &&
    !!String(originalText || '').trim() &&
    originalLanguage !== targetLanguage;

  const translatedBody =
    payload && payload.translated === true && typeof payload.text === 'string' ? payload.text : null;

  const effectiveBody =
    !needsTranslation || showOriginal || translatedBody == null ? originalText : translatedBody;

  const bodyDir =
    !needsTranslation || showOriginal || translatedBody == null
      ? isRtlLanguage(originalLanguage)
        ? 'rtl'
        : 'ltr'
      : isRtlLanguage(targetLanguage)
        ? 'rtl'
        : 'ltr';

  const runTranslate = useCallback(() => {
    if (!needsTranslation) return;
    const hit = getCachedTranslation(numericId, targetLanguage);
    if (hit) {
      setPayload(hit);
      return;
    }
    setLoading(true);
    void scheduleCommunityTranslate({
      messageId: numericId,
      text: originalText,
      sourceLanguage: originalLanguage,
      targetLanguage,
    })
      .then((p) => {
        setPayload(p);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [needsTranslation, numericId, targetLanguage, originalText, originalLanguage]);

  useEffect(() => {
    const sig = `${numericId}|${originalText}|${targetLanguage}`;
    if (lastMessageSigRef.current !== sig) {
      lastMessageSigRef.current = sig;
      if (hasNumericId) invalidateMessageTranslation(numericId);
      setShowOriginal(false);
      setPayload(null);
    } else {
      const hit = getCachedTranslation(numericId, targetLanguage);
      if (hit) setPayload(hit);
    }
  }, [numericId, targetLanguage, originalText, hasNumericId]);

  useEffect(() => {
    if (!needsTranslation || !rootRef.current) return undefined;
    const el = rootRef.current;
    let debounceTimer;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.some((e) => e.isIntersecting);
        if (!vis) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runTranslate(), 200);
      },
      { root: null, rootMargin: '80px', threshold: 0.02 }
    );
    obs.observe(el);
    return () => {
      clearTimeout(debounceTimer);
      obs.disconnect();
    };
  }, [needsTranslation, runTranslate]);

  const showToggle =
    needsTranslation &&
    payload &&
    payload.translated === true &&
    translatedBody != null &&
    translatedBody !== originalText;
  const showBadge = showToggle && !showOriginal;

  return (
    <div ref={rootRef} dir={bodyDir} className="community-msg-translated-root">
      {loading && needsTranslation && payload == null ? (
        <span style={{ opacity: 0.65, fontSize: '0.8rem' }}>{t('community.translation.loading')}</span>
      ) : null}
      {showBadge ? (
        <div style={{ fontSize: '0.72rem', opacity: 0.75, marginBottom: '4px' }}>
          {t('community.translation.translatedFrom', { language: langLabel(originalLanguage) })}
        </div>
      ) : null}
      <div className="community-msg-translated-body">{renderMessageContent(effectiveBody, message.file)}</div>
      {showToggle ? (
        <button
          type="button"
          className="community-msg-translated-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setShowOriginal((v) => !v);
          }}
          style={{
            marginTop: '6px',
            background: 'transparent',
            border: 'none',
            color: '#a78bfa',
            cursor: 'pointer',
            fontSize: '0.75rem',
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          {showOriginal ? t('community.translation.showTranslation') : t('community.translation.showOriginal')}
        </button>
      ) : null}
    </div>
  );
}
