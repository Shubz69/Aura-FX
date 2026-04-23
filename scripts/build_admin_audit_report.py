import json
from pathlib import Path

root = Path(r"c:\Users\1230s\OneDrive\Documents\Samy\Aura FX")
json_path = root / "e2e" / "reports" / "admin-audit-data.json"
md_path = root / "e2e" / "reports" / "admin-audit-report.md"

d = json.loads(json_path.read_text(encoding="utf-8"))
rows = d.get("rows", [])
findings = d.get("findings", [])
working = [r for r in rows if r.get("category") == "working"]
partial = [r for r in rows if r.get("category") == "partially_working"]
gated = [r for r in rows if r.get("category") == "gated"]
placeholder = [r for r in rows if r.get("category") == "placeholder"]
broken = [r for r in rows if r.get("category") == "broken"]
shell = [r for r in partial if (r.get("content") or {}).get("shellLikely")]

timings = sorted(
    [{"path": r.get("path"), "suiteId": r.get("suiteId", "?"), "durationMs": r.get("durationMs", 0)} for r in rows],
    key=lambda x: x["durationMs"],
    reverse=True,
)
longest = timings[0] if timings else None

lines = [
    "# Aura Terminal™ â€” admin session audit (bounded)",
    "",
    f"- **When:** {d.get('updatedAt', '')}",
    f"- **Base:** {d.get('base', '')}",
    f"- **Session:** `{d.get('sessionFile', '')}`",
    f"- **Pages audited:** {len(rows)}",
    f"- **Suites completed:** {', '.join(d.get('slicesCompleted', [])) or 'â€”'}",
    (
        f"- **Longest page:** `{longest['path']}` ({longest['durationMs']}ms, suite {longest['suiteId']})"
        if longest
        else "- **Longest page:** â€”"
    ),
    "",
    "## 1. Executive summary",
    "",
    f"Counts: working {len(working)}, partially_working {len(partial)}, gated {len(gated)}, placeholder {len(placeholder)}, broken {len(broken)}. Findings: {len(findings)}.",
    "",
    "## 2. Broken features",
    "",
]

if broken:
    for r in broken:
        err = f" â€” _{r.get('error')}_" if r.get("error") else ""
        lines.append(f"- `{r.get('path')}` -> {r.get('finalUrl', '')}{err}")
else:
    lines.append("- _None classified as broken._")

lines += ["", "## 3. Partially working / gated", ""]
lines += [f"- `{r.get('path')}` (partial)" for r in partial]
lines += [f"- `{r.get('path')}` (gated)" for r in gated]

lines += ["", "## 4. Shell-only pages", ""]
if shell:
    lines += [f"- `{r.get('path')}` (scoreâ‰ˆ{(r.get('content') or {}).get('score', 'n/a')})" for r in shell]
else:
    lines += ["- _None._"]

lines += ["", "## 5. Dead buttons / interactions", ""]
dead = [f for f in findings if any(k in (f.get("title") or "") for k in ["Button click skipped", "Tab click skipped", "Interaction phase capped"])]
lines += [f"- {f.get('page', '')}: {f.get('title', '')}" for f in dead[:80]]

lines += ["", "## 6. Console/network (sample)", ""]
lines += [f"- HTTP {x.get('status')} {x.get('url')}" for x in d.get("failedHttp", [])[:25]]
lines += [f"- {x.get('err')}: {x.get('url')}" for x in d.get("requestFailed", [])[:25]]
lines += [f"- {x.get('url')} :: {(x.get('text') or '')[:180]}..." for x in d.get("consoleErrors", [])[:25]]

lines += ["", "## 7. Highest-priority fixes", ""]
hp = [f for f in findings if (f.get("severity") or "").lower() in ["critical", "high"]]
lines += [f"{i+1}. {f.get('title', '')}{' (' + f.get('page') + ')' if f.get('page') else ''}" for i, f in enumerate(hp[:25])]

lines += ["", "## 8. Failure analysis", ""]
lines += [f"- Longest page: {longest['path']} ({longest['durationMs']}ms)" if longest else "- Longest page: n/a"]
lines += ["- Stalls/skips: derived from timeout/interaction-capped findings."]
lines += ["- Fully tested: completed suites listed above."]
lines += ["- Partially/not reached: pages categorized as partial/gated above."]

md_path.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {md_path}")
