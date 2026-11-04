import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import TestLab from "./TestLab.jsx";

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080/api";
const MAX_ROUNDS = 5;

const PRESETS = [
  { label: "Loyalty discount", text: "v2: basic tier now gets a 5% loyalty discount." },
  { label: "No behavior changes", text: "v2: internal refactor only. No behavior changes." },
];

const STAGES = [
  { key: "OBSERVE", label: "Replay", hint: "Send the same requests to v1 and v2" },
  { key: "TRIAGE", label: "Triage", hint: "Decide which differences are bugs" },
  { key: "FIX", label: "Patch", hint: "Correct the bugs within guardrails" },
  { key: "DONE", label: "Verified", hint: "Replay again to prove the fix" },
];

const KIND_LABEL = {
  OBSERVE: "Replayed traffic",
  TRIAGE: "Judged the changes",
  FIX: "Patched the rules",
  DONE: "Verified",
  FAILED: "Stopped",
};

const STATUS_LABEL = { idle: "Ready", running: "Working", success: "Resolved", failed: "Stopped" };

const ROW_LABEL = {
  match: "Same on both",
  fixed: "Fixed by agent",
  intended: "Intended change",
  differs: "Differs",
};
const MARK = { match: "✓", fixed: "✓", intended: "✓", differs: "✗" };
const TAG = { match: "t-match", fixed: "t-match", intended: "t-accepted", differs: "t-differs" };

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(String(res.status));
}

function parseRequest(request) {
  const q = new URLSearchParams(request.split("?")[1] || "");
  return { price: q.get("price"), tier: q.get("tier") };
}

const money = (n) => (n == null ? "–" : Number(n).toFixed(2));

function Demo() {
  const [changelog, setChangelog] = useState(PRESETS[0].text);
  const [log, setLog] = useState({ status: "idle", steps: [] });
  const [rows, setRows] = useState([]);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [openRow, setOpenRow] = useState(-1);
  const [fixedKeys, setFixedKeys] = useState({});
  const prevChanged = useRef([]);

  const loadReplay = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/replay`);
      setRows(await res.json());
    } catch {
      /* the log poll already reports connection problems */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`${BASE}/agent/log`);
        const data = await res.json();
        if (alive) {
          setLog(data);
          setOnline(true);
        }
      } catch {
        if (alive) setOnline(false);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (online) loadReplay();
  }, [online, log.steps.length, log.status, loadReplay]);

  // A request that differed before and matches now was fixed by the agent.
  useEffect(() => {
    if (rows.length === 0) return;
    setFixedKeys((f) => {
      const next = { ...f };
      rows.forEach((r, i) => {
        if (prevChanged.current[i] === true && !r.changed) next[i] = true;
      });
      return next;
    });
    prevChanged.current = rows.map((r) => r.changed);
  }, [rows]);

  const run = async () => {
    setError("");
    setBusy(true);
    try {
      await post("/agent/run", { changelog });
    } catch {
      setError("Could not start the agent. Check that the backend is running on port 8080.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError("");
    try {
      await post("/agent/reset");
      setFixedKeys({});
      prevChanged.current = [];
      setStageFilter("");
      setOpenRow(-1);
      await loadReplay();
    } catch {
      setError("Could not reset the demo. Check that the backend is running.");
    }
  };

  const running = log.status === "running";
  const failed = log.status === "failed";
  const success = log.status === "success";
  const last = log.steps[log.steps.length - 1];
  const round = last ? last.round : 0;

  const differing = rows.filter((r) => r.changed).length;
  const fixedCount = rows.filter((r, i) => !r.changed && fixedKeys[i]).length;
  const accepted = success ? differing : 0;
  const stillOpen = differing - accepted;
  const found = differing + fixedCount;
  const resolvedPct = found === 0 ? 0 : Math.round(((fixedCount + accepted) / found) * 100);

  const latestOf = (kind) => {
    const m = log.steps.filter((s) => s.kind === kind);
    return m.length ? m[m.length - 1] : null;
  };
  const triage = latestOf("TRIAGE");

  const lastStageStep = [...log.steps].reverse().find((s) => STAGES.some((g) => g.key === s.kind));
  const stageIdx = lastStageStep ? STAGES.findIndex((g) => g.key === lastStageStep.kind) : -1;
  const stageState = (i) => {
    if (success) return "done";
    if (stageIdx < 0) return "";
    if (i < stageIdx) return "done";
    if (i === stageIdx) return failed ? "failed" : running ? "active" : "done";
    return "";
  };

  const rowState = (r, i) => {
    if (!r.changed) return fixedKeys[i] ? "fixed" : "match";
    return success ? "intended" : "differs";
  };

  const shownSteps = stageFilter ? log.steps.filter((s) => s.kind === stageFilter) : log.steps;
  const filterLabel = STAGES.find((s) => s.key === stageFilter)?.label;

  return (
    <div className="shell">
      <header className="top">
        <div>
          <p className="brand">TraceTwin</p>
          <h1>Catch what your release changed by accident.</h1>
          <p className="lede">
            The agent replays real requests against v1 and v2, decides which differences match your
            changelog, fixes the rest, and checks its own work.
          </p>
        </div>
        <span className={`pill s-${log.status}`}>{STATUS_LABEL[log.status] || log.status}</span>
      </header>

      {!online && (
        <div className="banner" role="alert">
          Can't reach the backend at {BASE}. Start the Spring Boot app. This page reconnects on its own.
        </div>
      )}
      {error && (
        <div className="banner" role="alert">
          {error}
        </div>
      )}

      <div className="grid">
        <aside className="panel controls">
          <label htmlFor="changelog" className="field">
            What did this release intend to change?
          </label>
          <textarea
            id="changelog"
            rows={4}
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
            disabled={running}
          />
          <div className="chips">
            {PRESETS.map((p) => (
              <button key={p.label} className="chip" onClick={() => setChangelog(p.text)} disabled={running}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="actions">
            <button className="btn primary" onClick={run} disabled={running || busy || !online || !changelog.trim()}>
              {running ? "Agent is working" : "Run agent"}
            </button>
            <button className="btn" onClick={reset} disabled={running || !online}>
              Reset demo
            </button>
          </div>

          <div className="meter" aria-label={`Round ${round} of ${MAX_ROUNDS}`}>
            <span>
              Round {round} of {MAX_ROUNDS}
            </span>
            <div className="ticks">
              {Array.from({ length: MAX_ROUNDS }, (_, i) => (
                <i key={i} className={i < round ? "on" : ""} />
              ))}
            </div>
          </div>
        </aside>

        <main>
          {success && (
            <div className="summary ok">
              Resolved in {round} round{round === 1 ? "" : "s"}. {fixedCount} change
              {fixedCount === 1 ? "" : "s"} fixed by the agent, {accepted} accepted as intended.
            </div>
          )}
          {failed && (
            <div className="summary bad">
              The agent stopped before it could verify a fix. The rules file backup is kept in sample-data.
            </div>
          )}

          <section className="panel">
            <h2>Stages</h2>
            <div className="stages">
              {STAGES.map((s, i) => {
                const state = stageState(i);
                const out = latestOf(s.key);
                return (
                  <button
                    key={s.key}
                    className={`stage ${state}`}
                    aria-pressed={stageFilter === s.key}
                    onClick={() => setStageFilter(stageFilter === s.key ? "" : s.key)}
                  >
                    <span className="num">{state === "done" ? "✓" : state === "failed" ? "✗" : i + 1}</span>
                    <span className="name">{s.label}</span>
                    <span className="hint">{s.hint}</span>
                    {out && <span className="out">{out.detail}</span>}
                  </button>
                );
              })}
            </div>

            <div className="stats">
              <div className="stat">
                <b>{found}</b>
                <span>Changes found</span>
              </div>
              <div className="stat good">
                <b>{fixedCount}</b>
                <span>Fixed by agent</span>
              </div>
              <div className="stat info">
                <b>{accepted}</b>
                <span>Accepted as intended</span>
              </div>
              <div className="stat bad">
                <b>{stillOpen}</b>
                <span>Still open</span>
              </div>
            </div>
            <div
              className="bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={resolvedPct}
            >
              <i style={{ width: `${resolvedPct}%` }} />
            </div>
            <p className="sub" style={{ marginTop: 8, marginBottom: 0 }}>
              {fixedCount + accepted} of {found} changes resolved
            </p>
          </section>

          <section className="panel">
            <h2>Agent trace</h2>
            {stageFilter && (
              <p className="sub">
                Showing only {filterLabel} steps.{" "}
                <button className="chip on" onClick={() => setStageFilter("")}>
                  Show all
                </button>
              </p>
            )}
            {shownSteps.length === 0 ? (
              <p className="empty">
                {log.steps.length === 0
                  ? "No run yet. Pick a changelog and press Run agent. Each decision the agent makes shows up here as it happens."
                  : "No steps for this stage yet."}
              </p>
            ) : (
              <ol className="trace" aria-live="polite">
                {shownSteps.map((s, i) => (
                  <li key={i} className={`k-${s.kind}`}>
                    {(i === 0 || shownSteps[i - 1].round !== s.round) && s.round > 0 && (
                      <p className="round">Round {s.round}</p>
                    )}
                    <p className="kind">{KIND_LABEL[s.kind] || s.kind}</p>
                    <p className="detail">{s.detail}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="panel">
            <h2>Replay proof</h2>
            <p className="sub">
              The same {rows.length || 7} requests sent to v1 and v2. {differing} still differ. Click a row for
              details.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tier</th>
                    <th>Price</th>
                    <th>v1 pays</th>
                    <th>v2 pays</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const { price, tier } = parseRequest(r.request);
                    const st = rowState(r, i);
                    const diff = Number(r.v2.finalPrice) - Number(r.v1.finalPrice);
                    return (
                      <Fragment key={i}>
                        <tr className={`row-${st}`}>
                          <td>
                            <button
                              className="rowbtn"
                              aria-expanded={openRow === i}
                              onClick={() => setOpenRow(openRow === i ? -1 : i)}
                            >
                              <span className={`mark ${st}`} aria-hidden="true">
                                {MARK[st]}
                              </span>
                              <span>{tier}</span>
                            </button>
                          </td>
                          <td className="num">{money(price)}</td>
                          <td className="num">{money(r.v1.finalPrice)}</td>
                          <td className="num">{money(r.v2.finalPrice)}</td>
                          <td>
                            <span className={`tag ${TAG[st]}`}>{ROW_LABEL[st]}</span>
                          </td>
                        </tr>
                        {openRow === i && (
                          <tr className="detail-row">
                            <td colSpan={5}>
                              <div className="detail-grid">
                                <pre className="resp">{`v1: ${JSON.stringify(r.v1)}`}</pre>
                                <pre className="resp">{`v2: ${JSON.stringify(r.v2)}`}</pre>
                              </div>
                              {r.changed ? (
                                <p className="sub" style={{ marginTop: 8 }}>
                                  v2 charges {money(Math.abs(diff))} {diff > 0 ? "more" : "less"} than v1 for this
                                  request.
                                  {triage ? ` Agent's latest reasoning: ${triage.detail}` : ""}
                                </p>
                              ) : (
                                <p className="sub" style={{ marginTop: 8 }}>
                                  {fixedKeys[i]
                                    ? "This request differed earlier. The agent's fix made both versions agree."
                                    : "Both versions return the same answer."}
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="empty">
                        Waiting for the backend.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function getInitialTheme() {
  try {
    const saved = localStorage.getItem("tracetwin-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage can be blocked; fall back to the system setting */
  }
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [tab, setTab] = useState("demo");
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("tracetwin-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const next = theme === "dark" ? "light" : "dark";

  return (
    <>
      <nav className="tabs">
        <button className={`tab ${tab === "demo" ? "on" : ""}`} onClick={() => setTab("demo")}>
          Agent demo
        </button>
        <button className={`tab ${tab === "lab" ? "on" : ""}`} onClick={() => setTab("lab")}>
          Test your API
        </button>
        <button className="theme-toggle" onClick={() => setTheme(next)} aria-label={`Switch to ${next} theme`}>
          {theme === "dark" ? "☀ Light" : "☾ Dark"}
        </button>
      </nav>
      <div hidden={tab !== "demo"}>
        <Demo />
      </div>
      <div hidden={tab !== "lab"} className="shell">
        <TestLab />
      </div>
    </>
  );
}