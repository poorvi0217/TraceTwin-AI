import { useCallback, useEffect, useState } from "react";
import "./App.css";
import TestLab from "./TestLab.jsx";

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080/api";
const MAX_ROUNDS = 5;

const PRESETS = [
  { label: "Loyalty discount", text: "v2: basic tier now gets a 5% loyalty discount." },
  { label: "No behavior changes", text: "v2: internal refactor only. No behavior changes." },
];

const PHASES = [
  { key: "OBSERVE", label: "Replay" },
  { key: "TRIAGE", label: "Triage" },
  { key: "FIX", label: "Patch" },
  { key: "DONE", label: "Verified" },
];

const KIND_LABEL = {
  OBSERVE: "Replayed traffic",
  TRIAGE: "Judged the changes",
  FIX: "Patched the rules",
  DONE: "Verified",
  FAILED: "Stopped",
};

const STATUS_LABEL = { idle: "Ready", running: "Working", success: "Resolved", failed: "Stopped" };

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
      await loadReplay();
    } catch {
      setError("Could not reset the demo. Check that the backend is running.");
    }
  };

  const running = log.status === "running";
  const last = log.steps[log.steps.length - 1];
  const round = last ? last.round : 0;
  const fixes = log.steps.filter((s) => s.kind === "FIX").length;
  const differing = rows.filter((r) => r.changed).length;
  const phaseIndex = last ? PHASES.findIndex((p) => p.key === last.kind) : -1;

  const phaseState = (i) => {
    if (log.status === "success") return "done";
    if (phaseIndex < 0) return "";
    if (i < phaseIndex) return "done";
    if (i === phaseIndex) return running ? "active" : "done";
    return "";
  };

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

          <div className="pipe" aria-label="Agent pipeline">
            {PHASES.map((p, i) => (
              <div key={p.key} className={`node ${phaseState(i)}`}>
                {p.label}
              </div>
            ))}
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
          {log.status === "success" && (
            <div className="summary ok">
              Resolved in {round} round{round === 1 ? "" : "s"} with {fixes} patch{fixes === 1 ? "" : "es"}.{" "}
              {differing} difference{differing === 1 ? "" : "s"} left, accepted as intended.
            </div>
          )}
          {log.status === "failed" && (
            <div className="summary bad">
              The agent stopped before it could verify a fix. The rules file backup is kept in sample-data.
            </div>
          )}

          <section className="panel">
            <h2>Agent trace</h2>
            {log.steps.length === 0 ? (
              <p className="empty">
                No run yet. Pick a changelog and press Run agent. Each decision the agent makes shows up here as it
                happens.
              </p>
            ) : (
              <ol className="trace" aria-live="polite">
                {log.steps.map((s, i) => (
                  <li key={i} className={`k-${s.kind}`}>
                    {(i === 0 || log.steps[i - 1].round !== s.round) && s.round > 0 && (
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
              The same {rows.length || 7} requests sent to v1 and v2. {differing} still differ.
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
                    const state = !r.changed ? "match" : log.status === "success" ? "accepted" : "differs";
                    return (
                      <tr key={i} className={`row-${state}`}>
                        <td>{tier}</td>
                        <td className="num">{money(price)}</td>
                        <td className="num">{money(r.v1.finalPrice)}</td>
                        <td className="num">{money(r.v2.finalPrice)}</td>
                        <td>
                          <span className={`tag t-${state}`}>
                            {state === "match" ? "Match" : state === "accepted" ? "Accepted change" : "Differs"}
                          </span>
                        </td>
                      </tr>
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

export default function App() {
  const [tab, setTab] = useState("demo");
  return (
    <>
      <nav className="tabs">
        <button className={`tab ${tab === "demo" ? "on" : ""}`} onClick={() => setTab("demo")}>
          Agent demo
        </button>
        <button className={`tab ${tab === "lab" ? "on" : ""}`} onClick={() => setTab("lab")}>
          Test your API
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