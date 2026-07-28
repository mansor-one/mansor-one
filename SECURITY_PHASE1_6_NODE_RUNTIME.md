# Security Phase 1.6 Node Runtime

Date: 2026-07-24

## Standard

Mansor One now declares Node.js 22:

- Local: `.nvmrc` contains `22`.
- npm/tooling: `package.json` declares `"node": "22.x"`.
- CI: any future workflow must use `actions/setup-node` with `22.x`.
- Vercel: select Node.js 22.x in Project Settings and verify the Preview build
  log before production promotion. The package engine is also checked in.

No `.node-version` was added because it would duplicate `.nvmrc` without a
repository tool requiring it. No project Dockerfile or GitHub Actions workflow
was found. `vercel.json` contains cron configuration and did not need a runtime
edit.

Validation ran with Node `v22.23.1`. The workstation default was Node
`v24.16.0`, so commands were explicitly executed through Node 22 rather than
claiming the local default was compliant.

## Compatibility boundary

The repository standard is Node 22. This document does not claim that every
version below 22 is technically incapable of running the application; the
standard is chosen for a consistent supported validation/deployment target.

## Supabase Realtime

No server-side `.channel()`/Realtime subscription was found under `app/` or
`lib/`. Browser Supabase clients use the browser WebSocket implementation.
Therefore no current Mansor One server feature was found that depends on Node
22's native WebSocket behavior. Node 22 nevertheless aligns with current
Supabase support and avoids the additional transport setup needed by older
server runtimes.
