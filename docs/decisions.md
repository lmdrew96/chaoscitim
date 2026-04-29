# Architecture Decisions

Append-style log of locked architecture choices for ChaosCitim.
Newest at top. Each entry is short on purpose — the *why* is what matters.

---

## 2026-04-28 — Database: Neon Postgres + Drizzle ORM

**Decision:** Use Neon (serverless Postgres) with Drizzle ORM.

**Why:**
- ADHDesigns ecosystem standard. Every other project (Cha(t)os,
  ControlledChaos, ChaosPatch, ChaosLimbă, ScribeCat) uses this stack.
  Picking the same stack means shared ops knowledge, shared migration
  patterns, shared local-dev ergonomics.
- Neon's scale-to-zero + branching maps cleanly onto Vercel preview
  deployments and the offline-first PWA pattern (no warm-up cost on a
  cold-deploy preview, branch-per-feature for migrations).
- Drizzle is type-safe, lightweight, and plays well with Next.js App
  Router server components without the Prisma cold-start tax.

**Considered and rejected:**
- Convex — used in ScribeCat, but ChaosCitim's data shape (heavy
  per-token records, batch ingestion) is more comfortable in SQL than
  Convex's document model. The morphology cache especially wants
  joins.
- Supabase — fine, but no advantage over Neon and we'd lose ecosystem
  consistency.
- D1 / Hyperdrive — the Cloudflare path is interesting for global edge,
  but locks us into Workers and we're shipping on Vercel.

**Implications:**
- Schema work happens in `db/schema.ts` (Drizzle convention).
- Migrations via `drizzle-kit generate` + `drizzle-kit push` for dev,
  applied in CI for prod.
- Use Neon's branching for any schema change that touches `texts` or
  `text_tokens` — these tables will be expensive to rebuild once seeded.

---

## 2026-04-28 — Romanian morphology analyzer: UDPipe 2

See [`analyzer-evaluation.md`](analyzer-evaluation.md) and
[`phase2/validation-report.md`](phase2/validation-report.md) for the full
record. TL;DR: UDPipe 2 (`romanian-rrt-ud-2.17-251125`) via LINDAT REST
for tiers 1–2; dexonline as tier-3 paradigm enrichment only. License is
CC BY-NC-SA — accepted, ChaosCitim stays non-commercial.
