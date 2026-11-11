# ai-prospecting-pipeline

A hybrid local + cloud system that maps decision-makers, enriches companies, **classifies people with an LLM**, finds their work email and keeps **one master sheet** in sync with the CRM and the outreach platform. A person approves every step that costs money or sends anything.

## The problem
Prospecting data for a B2B sales team lived in five places: a LinkedIn search tool, an enrichment tool, a CRM, an outreach platform and several Excel files. Nobody knew who had been contacted, at which step, or who replied. Enrichment credits were spent on people who were never going to buy, and the same person was imported twice from two tools.

## What I built
- **Cloud workflows in TypeScript (Trigger.dev v4):** a weekly schedule, one task per company with idempotency keys (a re-run never processes a company twice in the same week) and retries.
- **LLM classification with structured output:** Claude receives written ICP rules and returns `include`, `buyingRole`, `segment` and `recommendedProduct` for each person. Every answer is validated with a **Zod schema**; invalid output is dropped, never patched. Without an API key, a deterministic rule-based classifier follows the same rules (used by the tests).
- **Email pattern inference:** one verified address per domain reveals the pattern (`first.last`, `flast`, `f.last`, ...); it is applied to everyone else, with a fallback of at most 3 patterns. Catch-all domains stop after one check.
- **Human-in-the-loop:** phone reveals cost credits, so each one waits for approval in a sheet (a Trigger.dev wait token, up to 7 days). Requests are idempotent and expire as rejected.
- **Single source of truth:** a master sheet de-duplicated by LinkedIn URL *or* email, which keeps CRM status and history when a person shows up again.

Architecture diagram: [docs/architecture.md](docs/architecture.md).

## How to run it
```bash
npm install
npm run sample     # synthetic companies and people in data/sample/
npm run demo       # full pipeline with mocked APIs -> output/master.csv
npm test           # 7 tests
npm run typecheck
```
Optional: put an `ANTHROPIC_API_KEY` in `.env` to classify with Claude instead of the offline rules.

## Results (synthetic data)
```
company                    people  kept  pattern      verifications
andesbeverages.example          6     5   first.last       5
pacificafoods.example           6     5   flast            5
nortedairy.example              8     7   unknown          7
...
Master sheet: 31 people (28 ready for outreach) -> output/master.csv
Re-running the same input added 0 duplicates.
Email checks used: 33 (checking 3 patterns for everyone would cost 93).
Phone reveals waiting for human approval: 11. Credits spent without approval: 0.
```

## Stack
TypeScript · Trigger.dev · Claude API (structured outputs) · Zod · Claude Code · REST APIs (enrichment, email verification, CRM) · Google Sheets · node:test

## What I learned
- **Validate the model, don't trust it.** Schemas turned "the LLM usually gets it right" into "every row in the sheet is valid".
- **The expensive steps deserve a human.** Approval gates made the team comfortable automating everything else.
- **Idempotency is what makes schedules safe.** Weekly jobs get re-run, retried and triggered twice; keys per company and week make that harmless.

## Note
Based on freelance work for B2B companies. Rebuilt with synthetic data and mocked APIs; no client information is included.
