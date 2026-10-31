import { Fragment, useCallback, useEffect, useState } from "react";

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080/api";
const DEFAULT_CHANGELOG = "v2: basic tier now gets a 5% loyalty discount.";

const STATUS = {
  NOT_RUN: { label: "Not run", cls: "", solved: false },
  PASSING: { label: "Passing", cls: "t-match", solved: true },
  FIXED: { label: "Fixed", cls: "t-match", solved: true },
  ACCEPTED: { label: "Accepted", cls: "t-accepted", solved: true },
  UNJUDGED: { label: "Differs", cls: "t-differs", solved: false },
  NEEDS_FIX: { label: "Needs fix", cls: "t-differs", solved: false },
  NEEDS_DECISION: { label: "Needs your decision", cls: "t-warn", solved: false },
  ERROR: { label: "Error", cls: "t-differs", solved: false },
};

const VERDICT_LABEL = { INTENDED: "Intended change", BUG: "Suspected bug", UNSURE: "Unsure" };

async function api(path, options) {
  const res = await fetch(`${BASE}${path}`, options);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) throw new Error((data && data.message) || `Request failed (${res.status})`);
  return data;
}

const postJson = (path, body) =>
  api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const resultKey = (x) => `${x.referenceStatus}|${x.candidateStatus}|${x.referenceBody}|${x.candidateBody}`;

let nextId = 1000;

export default function TestLab() {
  const [reference, setReference] = useState("");
  const [candidate, setCandidate] = useState("");
  const [changelog, setChangelog] = useState(DEFAULT_CHANGELOG);
  const [cases, setCases] = useState([]);
  const [results, setResults] = useState({});
  const [verdicts, setVerdicts] = useState({});
  const [decisions, setDecisions] = useState({});
  const [fixed, setFixed] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const working = busy !== "";

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api("/lab/history"));
    } catch {
      /* history is optional */
    }
  }, []);

  useEffect(() => {
    api("/lab/defaults")
      .then((d) => {
        setReference(d.reference);
        setCandidate(d.candidate);
        setCases(d.cases);
      })
      .catch((e) => setError(`Could not load the test defaults: ${e.message}`));
    loadHistory();
  }, [loadHistory]);

  const guarded = async (name, fn) => {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const clearCase = (id) => {
    const drop = (m) => {
      const n = { ...m };
      delete n[id];
      return n;
    };
    setResults(drop);
    setVerdicts(drop);
    setDecisions(drop);
    setFixed(drop);
  };

  const update = (id, patch) => {
    setCases((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    clearCase(id);
  };
  const remove = (id) => {
    setCases((cs) => cs.filter((c) => c.id !== id));
    clearCase(id);
  };
  const add = () => setCases((cs) => [...cs, { id: `c${nextId++}`, method: "GET", path: "/", body: "" }]);

  const decide = (id, value) =>
    setDecisions((d) => {
      const n = { ...d };
      if (value) n[id] = value;
      else delete n[id];
      return n;
    });

  const statusOf = (id) => {
    const r = results[id];
    if (!r) return "NOT_RUN";
    if (r.state === "ERROR") return "ERROR";
    if (r.state === "PASSING") return fixed[id] ? "FIXED" : "PASSING";
    if (decisions[id] === "ACCEPT") return "ACCEPTED";
    if (decisions[id] === "BUG") return "NEEDS_FIX";
    const v = verdicts[id];
    if (!v) return "UNJUDGED";
    if (v.verdict === "INTENDED") return "ACCEPTED";
    if (v.verdict === "BUG") return "NEEDS_FIX";
    return "NEEDS_DECISION";
  };

  const pending = cases.filter((c) => !STATUS[statusOf(c.id)].solved);
  const solvedCount = cases.length - pending.length;
  const hasRun = Object.keys(results).length > 0;

  const runCases = (subset) =>
    guarded("run", async () => {
      const data = await postJson("/lab/run", { reference, candidate, cases: subset });
      const nextResults = { ...results };
      const nextVerdicts = { ...verdicts };
      const nextDecisions = { ...decisions };
      const nextFixed = { ...fixed };
      for (const r of data) {
        const prev = results[r.id];
        if (!prev || resultKey(prev) !== resultKey(r)) {
          delete nextVerdicts[r.id];
          delete nextDecisions[r.id];
        }
        if (r.state === "PASSING") {
          if (prev && prev.state !== "PASSING") nextFixed[r.id] = true;
        } else {
          delete nextFixed[r.id];
        }
        nextResults[r.id] = r;
      }
      setResults(nextResults);
      setVerdicts(nextVerdicts);
      setDecisions(nextDecisions);
      setFixed(nextFixed);
    });

  const judge = () =>
    guarded("judge", async () => {
      const differences = cases
        .filter((c) => results[c.id] && results[c.id].state === "DIFFERS")
        .map((c) => ({ id: c.id, method: c.method, path: c.path, ...pickResult(results[c.id]) }));
      if (differences.length === 0) {
        setNotice("There are no differences to judge.");
        return;
      }
      const data = await postJson("/lab/verdicts", { changelog, differences });
      setVerdicts((prev) => ({ ...prev, ...Object.fromEntries(data.map((v) => [v.id, v])) }));
    });

  const suggest = () =>
    guarded("suggest", async () => {
      const data = await postJson("/lab/suggest", {
        changelog,
        cases: cases.map(({ method, path, body }) => ({ method, path, body })),
      });
      setSuggestions(data);
      if (data.length === 0) setNotice("The AI had no new test cases to suggest.");
    });

  const acceptSuggestion = (s, i) => {
    setCases((cs) => [...cs, { id: `c${nextId++}`, method: s.method, path: s.path, body: s.body || "" }]);
    setSuggestions((list) => list.filter((_, j) => j !== i));
  };
  const dismissSuggestion = (i) => setSuggestions((list) => list.filter((_, j) => j !== i));

  const save = () =>
    guarded("save", async () => {
      const payload = JSON.stringify({ reference, candidate, changelog, cases, results, verdicts, decisions, fixed });
      await postJson("/lab/history", { changelog, total: cases.length, solved: solvedCount, payload });
      await loadHistory();
      setNotice("Run saved to history.");
    });

  const loadRun = (id) =>
    guarded("load", async () => {
      const data = await api(`/lab/history/${id}`);
      const p = JSON.parse(data.payload);
      setReference(p.reference || "");
      setCandidate(p.candidate || "");
      setChangelog(p.changelog || "");
      setCases(p.cases || []);
      setResults(p.results || {});
      setVerdicts(p.verdicts || {});
      setDecisions(p.decisions || {});
      setFixed(p.fixed || {});
      setSuggestions([]);
      setNotice("Run loaded from history.");
    });

  return (
    <div className="stack">
      <section className="panel">
        <h2>Which versions are you comparing?</h2>
        <div className="lab-grid">
          <label>
            Reference version (works today)
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="http://localhost:8081/api" />
          </label>
          <label>
            New version (under test)
            <input value={candidate} onChange={(e) => setCandidate(e.target.value)} placeholder="http://localhost:8082/api" />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>What was this release supposed to change?</h2>
        <textarea rows={3} value={changelog} onChange={(e) => setChangelog(e.target.value)} />
      </section>

      {error && (
        <div className="banner" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}

      <section className="panel">
        <h2>Test cases</h2>
        <p className="sub">Each case is sent to both versions. Edit, add, or remove rows, then run.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Method</th>
                <th>Path</th>
                <th>JSON body (POST)</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const r = results[c.id];
                const v = verdicts[c.id];
                const st = STATUS[statusOf(c.id)];
                return (
                  <Fragment key={c.id}>
                    <tr>
                      <td style={{ width: 90 }}>
                        <select value={c.method} onChange={(e) => update(c.id, { method: e.target.value })}>
                          <option>GET</option>
                          <option>POST</option>
                        </select>
                      </td>
                      <td>
                        <input className="mono" value={c.path} aria-label="Path"
                          onChange={(e) => update(c.id, { path: e.target.value })} />
                      </td>
                      <td>
                        {c.method === "POST" ? (
                          <input className="mono" value={c.body} placeholder='{"key":"value"}' aria-label="JSON body"
                            onChange={(e) => update(c.id, { body: e.target.value })} />
                        ) : (
                          <span className="sub">no body</span>
                        )}
                      </td>
                      <td>
                        <span className={`tag ${st.cls}`}>{st.label}</span>
                      </td>
                      <td>
                        <button className="chip" onClick={() => remove(c.id)} disabled={working}>
                          Remove
                        </button>
                      </td>
                    </tr>
                    {r && r.state !== "PASSING" && (
                      <tr>
                        <td colSpan={5}>
                          {v && (
                            <div className="verdict">
                              <b>
                                AI verdict: {VERDICT_LABEL[v.verdict] || v.verdict}
                                {v.confidence ? ` (${v.confidence} confidence)` : ""}
                              </b>
                              {v.reason && <p>{v.reason}</p>}
                              {v.suspectedCause && <p>Likely cause: {v.suspectedCause}</p>}
                              {v.proposedFix && <p>Suggested fix: {v.proposedFix}</p>}
                              {v.question && <p>Question for you: {v.question}</p>}
                            </div>
                          )}
                          {r.state === "DIFFERS" && (
                            <div className="btnrow" style={{ marginTop: 8 }}>
                              <button className="chip" onClick={() => decide(c.id, "ACCEPT")}>Accept this change</button>
                              <button className="chip" onClick={() => decide(c.id, "BUG")}>Mark as bug</button>
                              {decisions[c.id] && (
                                <>
                                  <span className="sub">
                                    You decided: {decisions[c.id] === "ACCEPT" ? "accept" : "bug"}.
                                  </span>
                                  <button className="chip" onClick={() => decide(c.id, null)}>Clear my decision</button>
                                </>
                              )}
                            </div>
                          )}
                          <details>
                            <summary>{r.note}</summary>
                            <pre className="resp">
                              {`Reference (${r.referenceStatus}): ${r.referenceBody}\nNew version (${r.candidateStatus}): ${r.candidateBody}`}
                            </pre>
                          </details>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="btnrow">
          <button className="btn" onClick={add} disabled={working}>Add test case</button>
          <button className="btn" onClick={suggest} disabled={working || cases.length === 0}>
            {busy === "suggest" ? "Thinking" : "Suggest test cases (AI)"}
          </button>
          <button className="btn primary" onClick={() => runCases(cases)} disabled={working || cases.length === 0}>
            {busy === "run" ? "Running" : "Run all tests"}
          </button>
          <button className="btn" onClick={() => runCases(pending)} disabled={working || !hasRun || pending.length === 0}>
            Re-run remaining
          </button>
          <button className="btn" onClick={judge} disabled={working || !hasRun}>
            {busy === "judge" ? "Judging" : "Ask AI to judge differences"}
          </button>
        </div>
      </section>

      {suggestions.length > 0 && (
        <section className="panel">
          <h2>AI suggested test cases</h2>
          <p className="sub">Nothing is added until you accept it.</p>
          <ul className="plain">
            {suggestions.map((s, i) => (
              <li key={`${s.method}${s.path}`}>
                <span className="mono">{s.method} {s.path}</span>
                {s.body && <span className="mono"> {s.body}</span>}
                <p className="sub">{s.why}</p>
                <div className="btnrow">
                  <button className="chip" onClick={() => acceptSuggestion(s, i)}>Add to my tests</button>
                  <button className="chip" onClick={() => dismissSuggestion(i)}>Dismiss</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasRun && (
        <section className="panel">
          <h2>{solvedCount} of {cases.length} solved</h2>
          {pending.length === 0 ? (
            <p className="sub">Every test case is solved.</p>
          ) : (
            <>
              <p className="sub">Still to solve:</p>
              <ul className="plain">
                {pending
                  .filter((c) => results[c.id])
                  .map((c) => {
                    const st = STATUS[statusOf(c.id)];
                    const v = verdicts[c.id];
                    return (
                      <li key={c.id}>
                        <span className="mono">{c.method} {c.path}</span> <span className={`tag ${st.cls}`}>{st.label}</span>
                        <p className="sub">{(v && v.reason) || results[c.id].note}</p>
                        {v && v.proposedFix && <p className="sub">Suggested fix: {v.proposedFix}</p>}
                      </li>
                    );
                  })}
              </ul>
            </>
          )}
          <div className="btnrow">
            <button className="btn" onClick={save} disabled={working}>
              {busy === "save" ? "Saving" : "Save run to history"}
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Run history</h2>
        {history.length === 0 ? (
          <p className="sub">No saved runs yet. Save a run to keep a record of what was tested and decided.</p>
        ) : (
          <ul className="plain">
            {history.map((h) => (
              <li key={h.id} className="hist">
                <div>
                  <b>{new Date(h.createdAt).toLocaleString()}</b>
                  <span className="sub"> {h.solved} of {h.total} solved</span>
                  <p className="sub clip">{h.changelog || "(no changelog)"}</p>
                </div>
                <button className="chip" onClick={() => loadRun(h.id)} disabled={working}>Load</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function pickResult(r) {
  return {
    referenceStatus: r.referenceStatus,
    candidateStatus: r.candidateStatus,
    referenceBody: r.referenceBody,
    candidateBody: r.candidateBody,
    note: r.note,
  };
}