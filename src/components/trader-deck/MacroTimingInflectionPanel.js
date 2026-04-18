import React, { useLayoutEffect, useRef, useState } from 'react';
import { formatRelativeFreshness } from '../../lib/trader-deck/marketOutlookDisplayFormatters';

const CATALYST_ROW_PX = 22;
const MID_LABEL_EXTRA = 6;

export default function MacroTimingInflectionPanel({ model, updatedAt }) {
  const m = model && typeof model === 'object' ? model : {};
  const timing = m.timingCompact?.lines || [];
  const catalystLines = Array.isArray(m.catalystLines) ? m.catalystLines : [];
  const behavior = Array.isArray(m.expectedBehavior) ? m.expectedBehavior : [];
  const edgeLines = Array.isArray(m.traderEdgeLines) ? m.traderEdgeLines : [];

  const bodyRef = useRef(null);
  const middleRef = useRef(null);
  const [catalystN, setCatalystN] = useState(6);
  const [behaviorN, setBehaviorN] = useState(4);
  const [edgeN, setEdgeN] = useState(4);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measureBody = () => {
      const H = body.clientHeight;
      if (H < 320) {
        setBehaviorN(2);
        setEdgeN(2);
      } else if (H < 410) {
        setBehaviorN(3);
        setEdgeN(3);
      } else {
        setBehaviorN(4);
        setEdgeN(4);
      }
    };
    const ro = new ResizeObserver(measureBody);
    ro.observe(body);
    measureBody();
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const middle = middleRef.current;
    if (!middle) return;
    const measureMiddle = () => {
      const label = middle.querySelector('.mo-macro-timing__k');
      const titleH = (label ? label.offsetHeight : 18) + MID_LABEL_EXTRA;
      const usable = Math.max(0, middle.clientHeight - titleH);
      const n = Math.max(4, Math.min(8, Math.floor(usable / CATALYST_ROW_PX)));
      setCatalystN(Number.isFinite(n) ? n : 6);
    };
    const ro = new ResizeObserver(measureMiddle);
    ro.observe(middle);
    measureMiddle();
    return () => ro.disconnect();
  }, [behaviorN, edgeN]);

  return (
    <section
      className="td-outlook-concept-card td-outlook-concept-card--macro-timing mo-card-shell mo-macro-timing--stretch"
      aria-label="Macro timing and inflection window"
    >
      <header className="td-outlook-concept-card__head td-outlook-concept-card__head--macro-timing">
        <h2 className="td-outlook-concept-card__title td-outlook-concept-card__title--macro-timing">
          Macro timing &amp; inflection window
        </h2>
        <span className="mo-meta mo-macro-timing__fresh" title={updatedAt || ''}>
          {formatRelativeFreshness(updatedAt) || '—'}
        </span>
      </header>
      <div
        ref={bodyRef}
        className="td-outlook-concept-card__body td-outlook-concept-card__body--macro-timing mo-macro-timing__body-fill"
      >
        <div className="mo-macro-timing__stack mo-macro-timing__stack--fill">
          <div className="mo-macro-timing__region mo-macro-timing__region--top">
            <div className="mo-macro-timing__block mo-macro-timing__block--timing-compact">
              <p className="mo-macro-timing__k">Active timing window</p>
              {timing.slice(0, 2).map((line, i) => (
                <p key={i} className="mo-macro-timing__compact-line">
                  {line}
                </p>
              ))}
            </div>
            <div className="mo-macro-timing__block mo-macro-timing__block--inflection-one">
              <p className="mo-macro-timing__k">Inflection risk</p>
              <p className="mo-macro-timing__inflection-one-line">{m.inflectionSummary || ''}</p>
            </div>
          </div>

          <div
            ref={middleRef}
            className="mo-macro-timing__region mo-macro-timing__region--middle"
          >
            <p className="mo-macro-timing__k">Catalyst map</p>
            <ul className="mo-macro-timing__catalyst-dense mo-macro-timing__catalyst-dense--fill">
              {catalystLines.slice(0, catalystN).map((line, i) => (
                <li key={i} className="mo-macro-timing__catalyst-dense-row">
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="mo-macro-timing__region mo-macro-timing__region--bottom">
            <div className="mo-macro-timing__block mo-macro-timing__block--behavior-compact">
              <p className="mo-macro-timing__k">Expected market behavior</p>
              <ul className="mo-macro-timing__dense-list">
                {behavior.slice(0, behaviorN).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="mo-macro-timing__block mo-macro-timing__block--edge-compact">
              <p className="mo-macro-timing__k">Trader timing edge</p>
              <ul className="mo-macro-timing__dense-list mo-macro-timing__dense-list--edge">
                {edgeLines.slice(0, edgeN).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
