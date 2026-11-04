# TraceTwin AI

An autonomous agent that checks a new API release against the old one. It replays
recorded requests, compares behavior, decides which changes match the changelog
and which are bugs, fixes the bugs, and verifies the fix by replaying again.

Stack: React + Vite, Spring Boot (Java, Maven), Meta Model API.

## Run
1. Backend: open `backend` in IntelliJ and run `TraceTwinApplication` (port 8080).
2. Frontend: `cd frontend`, then `npm install` and `npm run dev` (port 5173).