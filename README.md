# TraceTwin AI

An autonomous agent that checks a new API release against the old one. It replays requests on both versions, decides which differences match the changelog and which are bugs, fixes the bugs it is allowed to fix, and proves the result by replaying again.

Demo video: _add your link here_

## The problem

Tests pass, a release ships, and a behavior quietly changes, like a gold-tier discount dropping from 20% to 2% because of a typo. TraceTwin catches behavior that changed without anyone intending it.

## What it does

- **Agent demo:** one click starts a loop of up to 5 rounds: replay, triage against the changelog, fix, replay again to verify. Guardrails: it edits one rules file, only existing tiers, only rates between 0 and 1, with a backup before every change.
- **Test your API:** enter a reference address and a new-version address, edit test cases (GET or POST), run them, and get AI verdicts (intended change, suspected bug, or unsure), AI-suggested test cases, solved and remaining tracking, re-run of unsolved cases, and saved run history.

## Tech stack

Spring Boot 4 (Java 17), React with Vite, MySQL, and the Meta Model API (`muse-wonder-1.0`).

## Quick start

1. Install JDK 17+, Node 18+, and MySQL 8 (running), and get a Meta API key from dev.meta.ai.
2. Configure `META_API_KEY` and `DB_PASSWORD` locally. The backend loads an ignored `.env` file from its working directory; do not commit real credentials.

```
META_API_KEY=your-key
DB_PASSWORD=your-mysql-password
```

3. Run `BackendApplication` from the Maven module in `backend/backend` (port 8080). For the existing `backend/.env`, set the IntelliJ working directory to `backend`.
4. In a second terminal:

```
cd frontend
npm install
npm run dev
```

5. Open http://localhost:5173. On the Agent demo tab, click Reset demo, then Run agent.

## Limits

- It is regression testing: the reference version is treated as correct, and only the requests you test are checked.
- The agent edits only the demo rules file. For your own API, the AI explains and proposes a fix and you apply it.
- The lab calls the addresses you enter, so it is built for local use. Add a host allowlist before hosting it publicly.
- Secrets live only in `.env`, which git ignores.

Built for the Meta AI hackathon, agent track.
