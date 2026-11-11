// Human-in-the-loop: anything that costs money (phone reveals) waits for a person's approval.
// In the cloud this is a Trigger.dev wait token (up to 7 days, checked every 30 minutes against a Google Sheet).
// Here it is a small in-memory queue with the same states, so the logic can be tested.

export type ApprovalState = "pending_approval" | "approved" | "rejected";

export interface ApprovalRequest { personId: string; reason: string; costCredits: number; state: ApprovalState; requestedAt: string }

export class ApprovalQueue {
  private requests = new Map<string, ApprovalRequest>();

  request(personId: string, reason: string, costCredits: number, now = new Date()): ApprovalRequest {
    const existing = this.requests.get(personId);
    if (existing) return existing; // idempotent: never ask twice for the same person
    const r: ApprovalRequest = { personId, reason, costCredits, state: "pending_approval", requestedAt: now.toISOString() };
    this.requests.set(personId, r);
    return r;
  }

  /** What a person does in the approval sheet. */
  decide(personId: string, approved: boolean) {
    const r = this.requests.get(personId);
    if (!r) throw new Error(`no approval request for ${personId}`);
    r.state = approved ? "approved" : "rejected";
  }

  /** Requests older than maxDays without a decision expire as rejected. */
  expire(now: Date, maxDays = 7) {
    for (const r of this.requests.values()) {
      if (r.state === "pending_approval" && now.getTime() - new Date(r.requestedAt).getTime() > maxDays * 86_400_000) r.state = "rejected";
    }
  }

  pending() { return [...this.requests.values()].filter(r => r.state === "pending_approval"); }
  get(personId: string) { return this.requests.get(personId); }
  spentCredits() { return [...this.requests.values()].filter(r => r.state === "approved").reduce((a, r) => a + r.costCredits, 0); }
}
