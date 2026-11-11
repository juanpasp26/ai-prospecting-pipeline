# Architecture

```mermaid
flowchart TB
    subgraph Local["Local agent (read-only)"]
        SN[Sales Navigator searches<br/>Claude Code + Claude in Chrome<br/>conservative rate limits]
    end
    subgraph Cloud["Cloud workflows (Trigger.dev, TypeScript)"]
        W[weekly-prospecting-sync<br/>Mon 07:00 Prague] --> P[process-company<br/>1 task per company · idempotency key]
        P --> E[Enrichment API<br/>company data]
        P --> L[LLM classification<br/>Claude + Zod schema]
        P --> M[Email pattern inference<br/>+ verification API · max 3 tries]
        L -->|decision maker| A[phone-reveal-approval<br/>wait token up to 7 days]
    end
    SN --> MS[(Google Sheet master<br/>dedupe by URL / email<br/>days since last touch)]
    P --> MS
    MS <--> CRM[CRM]
    MS <--> OUT[Outreach platform]
    H((Human)) -->|approves in the sheet| A
```

**Why hybrid?** The browser part needs a logged-in session, so it runs locally and only reads. Everything that calls APIs, costs money or must run on a schedule lives in the cloud, with retries and logs.
