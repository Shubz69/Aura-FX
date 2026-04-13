import React from 'react';

function SkelLine({ className = '', style = {} }) {
  return <div className={`tlab-skel-line ${className}`.trim()} style={style} aria-hidden />;
}

function SkelTitle() {
  return <SkelLine className="tlab-skel-line--title" />;
}

/**
 * Full 3-column terminal silhouette + skeletons — matches loaded Trader Lab proportions.
 */
export default function TraderLabLoadingShell() {
  return (
    <div
      className="trader-lab-v2 trader-lab-v2--gold trader-lab-v2--compact trader-lab-v2--workspace trader-lab-v2--terminal-desktop trader-lab-v2--loading-skeleton"
      aria-busy="true"
      aria-label="Loading Trader Lab workspace"
    >
      <aside className="trader-lab-v2__left">
        <div className="tlab-card tlab-card--gold tlab-skel-card">
          <SkelTitle />
          <div className="tlab-skel-row tlab-skel-row--pills">
            <SkelLine className="tlab-skel-line--pill" />
            <SkelLine className="tlab-skel-line--pill tlab-skel-line--pill-narrow" />
          </div>
          <SkelLine className="tlab-skel-line--field" />
          <SkelLine className="tlab-skel-line--field" />
          <SkelLine className="tlab-skel-line--slider" />
          <SkelLine className="tlab-skel-line--field" />
        </div>
        <div className="tlab-card tlab-card--gold tlab-skel-card">
          <SkelTitle />
          <SkelLine style={{ width: '92%' }} />
          <SkelLine style={{ width: '78%' }} />
          <SkelLine style={{ width: '85%' }} />
          <div className="tlab-skel-textarea" />
        </div>
        <div className="tl-card-shell tl-card-shell--thesis tlab-skel-thesis">
          <SkelLine className="tlab-skel-line--thesis-title" />
          <SkelLine className="tlab-skel-line--q" />
          <div className="tlab-skel-textarea tlab-skel-textarea--thesis" />
          <SkelLine className="tlab-skel-line--q" />
          <div className="tlab-skel-textarea tlab-skel-textarea--thesis" />
          <SkelLine className="tlab-skel-line--q" />
          <div className="tlab-skel-textarea tlab-skel-textarea--thesis" />
        </div>
      </aside>

      <div className="trader-lab-v2__center">
        <div className="tlab-center-stack">
          <div className="tlab-center-rail-grid">
            <div className="tlab-center-rail tlab-center-rail--left">
              <div className="tlab-card tlab-card--gold tlab-card--dock-fundamental tlab-skel-card">
                <SkelTitle />
                <div className="tlab-skel-textarea tlab-skel-textarea--short" />
              </div>
            </div>
            <div className="tlab-center-rail tlab-center-rail--chart">
              <div className="tlab-card tlab-card--chart tlab-card--gold tlab-card--focal tlab-skel-card">
                <div className="tlab-chart-toolbar tlab-chart-toolbar--terminal">
                  <div className="tlab-chart-toolbar__primary">
                    <SkelLine className="tlab-skel-line--select" />
                    <div className="tlab-skel-tf">
                      <SkelLine className="tlab-skel-line--tf" />
                      <SkelLine className="tlab-skel-line--tf" />
                      <SkelLine className="tlab-skel-line--tf" />
                      <SkelLine className="tlab-skel-line--tf" />
                    </div>
                  </div>
                  <div className="tlab-session-tabs-inline">
                    <SkelLine className="tlab-skel-line--tab" />
                    <SkelLine className="tlab-skel-line--tab" />
                    <SkelLine className="tlab-skel-line--tab" />
                  </div>
                </div>
                <div className="tlab-chart-host tlab-chart-host--fill">
                  <div className="tlab-skel-chart" />
                </div>
                <div className="tlab-level-strip tlab-level-strip--skeleton">
                  <div className="tlab-skel-level">
                    <SkelLine className="tlab-skel-line--lvl-label" />
                    <SkelLine className="tlab-skel-line--lvl-val" />
                  </div>
                  <div className="tlab-skel-level">
                    <SkelLine className="tlab-skel-line--lvl-label" />
                    <SkelLine className="tlab-skel-line--lvl-val" />
                  </div>
                  <div className="tlab-skel-level">
                    <SkelLine className="tlab-skel-line--lvl-label" />
                    <SkelLine className="tlab-skel-line--lvl-val" />
                  </div>
                </div>
              </div>
            </div>
            <div className="tlab-center-rail tlab-center-rail--right">
              <div className="tlab-card tlab-card--gold tlab-card--dock-exec tlab-skel-card">
                <SkelTitle />
                <div className="tlab-skel-textarea tlab-skel-textarea--dock" />
                <div className="tlab-skel-exec-foot">
                  <SkelLine className="tlab-skel-line--meta" />
                  <SkelLine className="tlab-skel-line--btn" />
                </div>
              </div>
              <div className="tlab-card tlab-card--gold tlab-card--dock-decision tlab-skel-card">
                <SkelTitle />
                <div className="tlab-skel-checks">
                  <SkelLine className="tlab-skel-line--check" />
                  <SkelLine className="tlab-skel-line--check" />
                  <SkelLine className="tlab-skel-line--check" />
                  <SkelLine className="tlab-skel-line--check" />
                </div>
                <SkelLine className="tlab-skel-line--conv-label" />
                <div className="tlab-skel-conviction">
                  <SkelLine className="tlab-skel-line--conv" />
                  <SkelLine className="tlab-skel-line--conv" />
                  <SkelLine className="tlab-skel-line--conv" />
                </div>
                <SkelLine className="tlab-skel-line--execute" />
              </div>
            </div>
          </div>

          <div className="tlab-decoder-strip tlab-decoder-strip--log tlab-decoder-strip--skeleton" role="presentation">
            <div className="tlab-decoder-strip__head">
              <SkelLine className="tlab-skel-line--decoder" />
            </div>
            <SkelLine className="tlab-skel-line--decoder" style={{ width: '92%' }} />
            <SkelLine className="tlab-skel-line--decoder" style={{ width: '78%' }} />
          </div>
        </div>
      </div>

      <aside className="trader-lab-v2__right">
        <div className="tlab-card tlab-card--gold tlab-card--plan-rail tlab-skel-card">
          <SkelTitle />
          <SkelLine className="tlab-skel-line--field" />
          <div className="tlab-skel-grid-2">
            <SkelLine className="tlab-skel-line--field" />
            <SkelLine className="tlab-skel-line--field" />
            <SkelLine className="tlab-skel-line--field" />
            <SkelLine className="tlab-skel-line--field" />
          </div>
          <SkelLine className="tlab-skel-line--rr" />
          <SkelLine className="tlab-skel-line--metric" />
          <SkelLine className="tlab-skel-line--metric" />
          <SkelLine className="tlab-skel-line--valid" />
        </div>
        <div className="tlab-card tlab-card--gold tlab-card--validator tlab-skel-card">
          <SkelTitle />
          <div className="tlab-skel-valid-rows">
            <SkelLine />
            <SkelLine />
            <SkelLine />
            <SkelLine style={{ width: '72%' }} />
          </div>
        </div>
        <div className="tlab-card tlab-card--gold tlab-card--session-rail tlab-skel-card">
          <SkelTitle />
          <div className="tlab-skel-textarea tlab-skel-textarea--session" />
          <SkelLine className="tlab-skel-line--field" />
        </div>
        <div className="tlab-card tlab-card--gold tlab-card--saved-labs tlab-skel-card">
          <div className="tlab-skel-saved-head">
            <SkelTitle />
            <SkelLine className="tlab-skel-line--count" />
          </div>
          <SkelLine className="tlab-skel-line--saved" />
          <SkelLine className="tlab-skel-line--saved" />
          <SkelLine className="tlab-skel-line--saved" style={{ width: '80%' }} />
        </div>
        <div className="tlab-card tlab-card--gold tlab-card--desk-context tlab-skel-card">
          <SkelTitle />
          <div className="tlab-skel-table">
            <SkelLine />
            <SkelLine />
          </div>
          <div className="tlab-skel-textarea tlab-skel-textarea--short" />
          <div className="tlab-skel-table">
            <SkelLine />
            <SkelLine />
          </div>
        </div>
      </aside>

      <span className="tlab-sr-only">Loading lab sessions…</span>
    </div>
  );
}
