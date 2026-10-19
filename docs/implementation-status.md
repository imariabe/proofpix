# ProofPix — implementation status

Honest inventory of what the product does today. "Partial" means the feature
works but with a stated boundary; "unimplemented" means it does not exist and
the UI/docs do not pretend otherwise.

## Implemented (end-to-end)

**Product surface**

- Landing page (hero, capabilities, workflow, investigation-not-certification
  section, privacy section, CTAs) in the dark forensic-lab identity
- Auth: email one-time-code sign-in + guest sessions, themed for the product
- Protected workspace shell (sidebar on desktop, sheet on mobile)
- Dashboard catalog: search, outcome filters, aggregate stats, navigation into
  reports, report deletion (analysis + results + artifacts + stored files)
- Upload workspace (`/analyze`): single-image and two-image comparison modes,
  drag-and-drop with previews and client-side pre-flight, then the real
  pipeline with per-step progress that only advances when an action returns
- Result screen (`/report/:id`):
  - overall reading with plain-language summary and stats (confirmed / warning
    signs / checks completed) — never a Real/Fake label
  - **Evidence Breakdown**: confirmed findings vs potential warning signs vs
    context, with a legend explaining what each group proves, per-item source
    and measurement chips, and explicit empty states
  - interactive image stage: original / ELA toggle with hoverable hotspot
    region overlay and a readout that explains what a region is (and is not)
  - comparison mode: File A / File B / difference-map views with an honest
    caption about what differences mean
  - check-by-check detail: findings, measurements, "what this means", "what
    this check cannot prove"
  - dedicated "What this analysis cannot prove" section
  - contextual next-step recommendations
  - ask-an-explanation box with suggested questions; every answer labelled
    *AI-assisted* or *Rule-based*; history persisted per report
  - export: print/PDF (print styles included) and machine-readable JSON
  - interrupted-run resume: completed steps are kept, missing steps re-run
- Privacy and terms pages; footer/header navigation wired
- Failure handling: failed analyses show the recorded reason and a path to
  start over; malformed uploads are deleted immediately

**Forensics engine** (`src/lib/forensics`, pure TS, unit-tested)

- Content-based format sniffing (magic bytes, never extension trust) and
  upload validation with explicit problems
- JPEG / PNG / WebP structural parsers (markers, chunks, dimensions,
  truncation/trailing bytes, software hints, quality estimation for JPEG)
- Pixel decode (JPEG/PNG) with a megapixel budget and explicit failure modes
- EXIF extraction and normalization (camera, software, timestamps, GPS flags)
- Metadata, structure, encoding, and cross-field consistency check builders
- Error Level Analysis with amplification stats and a dominance-thresholded
  4×4 hotspot grid; ELA artifact stored as PNG with overlay metadata
- Two-image comparison: common-canvas resampling, MAE/RMSE/PSNR, changed-pixel
  percentages, difference-map artifact
- Overall assessment rules (unsupported / incomplete / inconsistencies /
  inconclusive / no_anomaly), evidence collection with stable ordering,
  context-derived recommendations
- Rule-based explainer covering reading, metadata, ELA, comparison, and
  next-step questions with overlong-input and off-topic fallbacks

**Backend** (Convex)

- Schema for analyses, results, artifacts, explanations
- Signed upload URLs (file bytes never pass through function payloads)
- Ownership checks on every query, mutation, and action path
- Pipeline actions with per-step persistence; artifacts upsert by kind so
  resumed runs cannot duplicate blobs; best-effort storage cleanup
- Q&A action: AI completion through the platform gateway when configured,
  rule-based fallback otherwise, source stored with each answer
- Account deletion removes analyses, results, artifacts, explanations, stored
  files, and the user record

## Partial (works, with stated boundaries)

- **AI explanations** — available only when the integration key is configured
  on the deployment; otherwise (or on provider failure) answers come from the
  rule-based engine. The label in the UI always reflects the real source.
- **WebP** — full container/metadata analysis, but there is no WebP pixel
  decoder in this pipeline, so ELA and pixel-diff checks report "not
  applicable" for WebP inputs instead of running. Comparisons need both files
  to be JPEG or PNG for pixel metrics.
- **ELA** — JPEG-only by design (converting first would measure the
  conversion, not the uploaded file). PNG/WebP uploads get an explicit skip
  reason, not a fake result.
- **PNG metadata** — extraction depends on EXIF living in the `eXIf` chunk and
  on the extractor's support for it; many PNGs honestly report "no embedded
  metadata" (inconclusive), which the report frames as normal.
- **Hotspot resolution** — the overlay is a coarse 4×4 region grid (a review
  aid), not a pixel-accurate manipulation mask.
- **Pipeline orchestration** — steps are client-invoked actions; a run
  interrupted by closing the tab stops, and the report offers Resume from the
  last completed step. There is no server-side scheduler/auto-retry.
- **Report sharing** — reports are private to the owner; export (print/PDF,
  JSON) is the sharing mechanism. No public links.

## Unimplemented (and not implied anywhere in the UI)

- HEIC, TIFF, AVIF, GIF, or BMP inputs — rejected at validation with a clear
  message
- C2PA / Content Credentials / cryptographic provenance validation
- Deepfake or AI-generation detection (no ML classifier); checks are
  structural and statistical only
- Object-level or semantic manipulation localization (no segmentation model)
- Batch/multi-file submissions, comparisons of more than two files
- Team/organisation accounts, roles beyond the default user model
- Public API / webhooks for programmatic analysis
- Email notifications or in-app notification centre
- Paid plans, quotas, or billing

## Verification

- `bun convex dev --once` — passes (codegen fresh, functions deployed)
- `bun tsc -b --noEmit` — passes
- `bun run test` — 45/45 unit tests pass across 6 suites covering sniffing,
  container parsing round-trips, decode budget, ELA stats and hotspot
  thresholds, comparison metrics, check builders, assessment rules, evidence
  ordering, and the rule-based explainer
- No automated browser E2E suite exists; interactive flows are exercised in
  the preview environment
