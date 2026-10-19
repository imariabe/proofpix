# ProofPix

**A digital investigation lab for images.** ProofPix examines JPEG, PNG, and
WebP files with real forensic checks — metadata, structure, encoding,
consistency, compression history, and pixel comparison — and produces a report
that separates **confirmed findings** from **potential warning signs** and
states plainly **what the analysis cannot prove**.

ProofPix never labels an image "Real" or "Fake". The overall reading is always
one of: *No Significant Anomaly Detected by Available Checks*, *Potential
Technical Inconsistencies Identified*, *Inconclusive*, *Analysis Incomplete*,
or *Unsupported File* — each with a plain-language summary.

## What it does

- **Single-image analysis** — content-based validation, EXIF/metadata
  extraction, container structure walk, encoding characteristics, cross-field
  consistency checks, and JPEG Error Level Analysis with an interactive
  hotspot overlay.
- **Two-image comparison** — both files decoded onto a common canvas with
  mean-error/PSNR metrics and a downloadable difference map.
- **Evidence Breakdown panel** — every item the engine measured, grouped into
  *confirmed findings* (facts read from the file's bytes), *potential warning
  signs* (leads with ordinary alternative explanations), and *context* — each
  with its source check and, where relevant, the measurement itself.
- **Honest reports** — per-check "what this means" and "what this check cannot
  prove", a dedicated limitations section, and contextual next-step
  recommendations derived from what actually ran.
- **Guided explanations** — ask questions about a report; answers are labelled
  *AI-assisted* or *Rule-based*. Only structured check results ever leave the
  backend; image bytes are never sent to a model. Falls back to the rule-based
  engine when no model is configured.
- **Workspace** — searchable catalog with outcome filters and stats, per-report
  deletion (files removed with the report), account deletion, print/PDF and
  JSON export.

## Tech stack

| Layer     | Choice |
| --------- | ------ |
| Frontend  | Vite, React 19, TypeScript, React Router v7, Tailwind CSS v4, shadcn/ui, Framer Motion, Lucide |
| Backend   | Convex (queries, mutations, Node actions, storage) |
| Auth      | Convex Auth — email one-time code + anonymous guest sessions |
| Forensics | Pure TypeScript engine (`src/lib/forensics`) using `exifr`, `jpeg-js`, `pngjs` — no native binaries |
| Tests     | Vitest (45 unit tests over the forensics engine) |

## Architecture

```
src/
  lib/forensics/      Pure, dependency-light forensics engine (shared by
                       actions and tests): sniff.ts (format detection +
                       content-based upload validation), decode.ts (pixel
                       decode/encode with a megapixel budget), jpeg.ts /
                       png.ts / webp.ts (structural parsers), ela.ts (error
                       level analysis + hotspot grid), compare.ts (pixel
                       comparison), checks.ts (check builders, evidence
                       items, overall assessment), recommend.ts (next steps)
  lib/explain.ts       Rule-based evidence explainer (also the AI fallback)
  convex/schema.ts     Tables: analyses, analysisResults, analysisArtifacts,
                       aiExplanations (+ auth tables)
  convex/analyses.ts   Customer API: signed uploads, catalog, report query,
                       deletion — every path ownership-checked
  convex/steps.ts      The pipeline: one Node action per step, re-verifying
                       the owner before reading or writing anything
  convex/explain.ts    Q&A action: AI when configured, rule-based otherwise,
                       source stored and shown in the UI
  hooks/use-pipeline.ts Client pipeline runner (sequential steps, per-step
                       progress only when an action genuinely returns)
  pages/               Landing, Auth, Dashboard (catalog), Analyze (upload
                       workspace), Report (result screen), Privacy, Terms,
                       NotFound
```

The pipeline runs as discrete Convex actions invoked in order by the client:
`validate → metadata → structure → consistency → compression → report`
(`validate → compare → report` for comparisons). Progress in the UI marks a
step done only when its action has actually finished, and interrupted runs can
resume from the last completed step.

## Honesty model

- Each check returns `clear`, `flag`, `inconclusive`, `skipped`, or `error` —
  these are never conflated. "No anomaly found" is not "authentic".
- Evidence items are typed `confirmed` / `warning` / `context`, and the report
  renders them as three separate groups with a legend explaining how much each
  group proves.
- Every check carries an explicit `limitations` statement; the report also
  aggregates them into a "What this analysis cannot prove" section (including:
  image analysis cannot establish real-world facts such as whether an event
  happened or who altered a file).
- ELA hotspot regions are labelled as areas that *respond differently to
  recompression*, never as detected edits.

## Getting started

```bash
bun install            # install dependencies
bun convex dev          # start Convex codegen + backend (dev)
bun run dev             # start the Vite dev server
```

Environment variables are documented in `.env.example`. Sign-in codes are sent
through the platform's integrations gateway (`VLY_INTEGRATION_KEY`), and the
optional AI explainer uses the same gateway (`VLY_INTEGRATION_KEY` +
`VLY_INTEGRATION_BASE_URL`). On this platform, secrets are managed in the
**Keys/API keys** tab rather than edited into `.env` files.

## Scripts

| Command | Purpose |
| ------- | ------- |
| `bun run dev` | Vite dev server |
| `bun convex dev --once` | Convex codegen + push (non-interactive) |
| `bun tsc -b --noEmit` | Typecheck |
| `bun run test` | Run the unit test suite (`vitest run`) |
| `bun run lint` | ESLint |
| `bun run build` | Production build |

## Verification status

- `bun convex dev --once` — passes (functions deployed, codegen fresh).
- `bun tsc -b --noEmit` — passes.
- `bun run test` — 45/45 tests pass (sniffing/validation, PNG/JPEG/WebP
  parsing round-trips, decode budget, ELA stats + hotspot thresholds,
  comparison metrics, check builders, assessment rules, evidence ordering,
  rule-based explainer).
- Browser E2E automation is not part of this repo; the interactive flows are
  exercised through the preview environment.

See `docs/implementation-status.md` for the honest implemented / partial /
unimplemented inventory.

## Privacy

Uploads exist only to produce your reports and are deleted with them
(immediately so for files that fail validation). Reports are private to their
owner; every read and write re-checks ownership server-side. Full details in
`/privacy` and `/terms`.
