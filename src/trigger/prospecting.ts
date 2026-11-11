// Cloud version (Trigger.dev v4). Same core logic as the demo; the real integrations replace the mocks.
import { logger, schedules, task, wait } from "@trigger.dev/sdk";
import { ApprovalQueue } from "../core/approvals.js";
import { pickClassifier } from "../core/classify.js";
import { MockCrm, MockEnrichment, MockVerifier } from "../core/integrations.js";
import { processCompany, type Deps } from "../core/pipeline.js";
import type { Person } from "../core/schemas.js";

// In production these are API clients (enrichment, email verification, CRM). Mocks keep the repo runnable.
function deps(): Deps {
  return { enrichment: new MockEnrichment([]), verifier: new MockVerifier(new Map()), classifier: pickClassifier(),
    crm: new MockCrm([]), approvals: new ApprovalQueue() };
}

/** One company at a time, so a failure retries only that company. */
export const processCompanyTask = task({
  id: "process-company",
  queue: { concurrencyLimit: 3 },
  run: async (payload: { domain: string; people: Person[] }) => {
    const result = await processCompany(payload.domain, payload.people, deps());
    logger.info("company processed", { domain: payload.domain, kept: result.rows.length, verifications: result.verifications });
    return result;
  },
});

/** Phone reveals cost credits: wait for a human decision in the approval sheet (up to 7 days). */
export const phoneRevealTask = task({
  id: "phone-reveal-approval",
  run: async (payload: { personId: string; company: string }) => {
    const token = await wait.createToken({ timeout: "7d", tags: [`person:${payload.personId}`] });
    logger.info("approval requested; a sheet watcher completes the token", { tokenId: token.id });
    const decision = await wait.forToken<{ approved: boolean }>(token.id);
    if (!decision.ok || !decision.output.approved) return { revealed: false };
    return { revealed: true }; // the real phone lookup happens here, only after approval
  },
});

/** Monday 07:00 Prague: sync the week's new people; idempotency keys stop double processing. */
export const weeklySync = schedules.task({
  id: "weekly-prospecting-sync",
  cron: { pattern: "0 7 * * 1", timezone: "Europe/Prague" },
  run: async () => {
    const batches: { domain: string; people: Person[] }[] = []; // loaded from the master sheet in production
    const week = new Date().toISOString().slice(0, 10);
    for (const b of batches) {
      await processCompanyTask.trigger(b, { idempotencyKey: `${b.domain}-${week}` });
    }
    return { companies: batches.length };
  },
});
