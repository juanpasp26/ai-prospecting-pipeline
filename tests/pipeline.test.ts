import { test } from "node:test";
import assert from "node:assert/strict";
import { ApprovalQueue } from "../src/core/approvals.js";
import { RuleBasedClassifier } from "../src/core/classify.js";
import { applyPattern, candidates, inferPattern, PATTERNS, splitName } from "../src/core/emailPatterns.js";
import { MockCrm, MockEnrichment, MockVerifier } from "../src/core/integrations.js";
import { mergeIntoMaster, normalizeUrl } from "../src/core/master.js";
import { processCompany } from "../src/core/pipeline.js";
import { ClassificationSchema, type Company, type Person } from "../src/core/schemas.js";

const company: Company = { domain: "acme.example", name: "Acme Foods", industry: "Consumer goods", employees: 2500, country: "CO",
  knownEmail: { address: "ana.garcia@acme.example", ownerName: "Ana García" } };
const person = (id: string, fullName: string, title: string): Person =>
  ({ personId: id, fullName, title, companyDomain: "acme.example", linkedinUrl: `https://linkedin.example/in/${id}/`, country: "CO" });

test("infers the email pattern from one verified address, accents included", () => {
  assert.equal(inferPattern("ana.garcia@acme.example", "Ana García"), "first.last");
  assert.equal(inferPattern("agarcia@x.example", "Ana García"), "flast");
  assert.equal(applyPattern("f.last", "Tomás Díaz", "acme.example"), "t.diaz@acme.example");
  assert.equal(inferPattern("info@acme.example", "Ana García"), null);
});

test("falls back to at most 3 candidates, inferred pattern first", () => {
  const c = candidates("Luis Pérez", "acme.example", "flast");
  assert.deepEqual(c, ["lperez@acme.example", "luis.perez@acme.example", "l.perez@acme.example"]);
});

test("classifier output always matches the schema and follows the ICP rules", async () => {
  const out = await new RuleBasedClassifier().classify(
    [person("1", "Ana García", "Sales Director"), person("2", "Luis Pérez", "HR Business Partner"), person("3", "Tomás Díaz", "Field Sales Manager")],
    new Map([[company.domain, company]]));
  out.forEach(c => assert.ok(ClassificationSchema.safeParse(c).success));
  assert.deepEqual(out.map(c => [c.include, c.buyingRole, c.recommendedProduct]), [
    [true, "decision_maker", "sales_analytics"], [false, "not_relevant", "none"], [true, "influencer", "field_execution"]]);
});

test("invalid LLM output is rejected, not patched", () => {
  assert.equal(ClassificationSchema.safeParse({ personId: "1", include: true, buyingRole: "boss", segment: "enterprise",
    recommendedProduct: "none", reason: "x" }).success, false);
});

test("approvals are idempotent, cost nothing until approved, and expire after 7 days", () => {
  const q = new ApprovalQueue();
  const t0 = new Date("2026-11-02T08:00:00Z");
  q.request("p1", "phone", 8, t0); q.request("p1", "phone", 8, t0); q.request("p2", "phone", 8, t0);
  assert.equal(q.pending().length, 2);
  assert.equal(q.spentCredits(), 0);
  q.decide("p1", true);
  q.expire(new Date("2026-11-10T08:00:00Z"));
  assert.equal(q.get("p2")!.state, "rejected");
  assert.equal(q.spentCredits(), 8);
});

test("master de-duplicates by LinkedIn URL and by email", () => {
  assert.equal(normalizeUrl("HTTPS://www.LinkedIn.example/in/ana/?trk=x"), "linkedin.example/in/ana");
  const row = { key: "linkedin.example/in/ana", personId: "1", fullName: "Ana", title: "Director", company: "Acme", country: "CO",
    email: "ana@acme.example", emailStatus: "valid" as const, buyingRole: "decision_maker", segment: "enterprise",
    recommendedProduct: "sales_analytics", phoneStatus: "approved" as const, crmStatus: "in_crm" as const, lastTouch: "2026-11-01", status: "in_sequence" as const };
  const first = mergeIntoMaster([], [row]);
  const again = mergeIntoMaster(first.master, [{ ...row, key: "other-key", title: "VP Sales" }]); // same email, different URL
  assert.equal(again.master.length, 1);
  assert.equal(again.added, 0);
  assert.equal(again.master[0].title, "VP Sales");
  assert.equal(again.master[0].crmStatus, "in_crm"); // history kept
});

test("processCompany finds emails with the inferred pattern and asks approval for decision makers only", async () => {
  const people = [person("1", "Ana García", "Sales Director"), person("2", "Luis Pérez", "Key Account Manager"), person("3", "Paula Rojas", "Finance Manager")];
  const valid = new Set(people.map(p => { const { first, last } = splitName(p.fullName); return PATTERNS["first.last"](first, last); }));
  const verifier = new MockVerifier(new Map([["acme.example", (l: string) => valid.has(l)]]));
  const approvals = new ApprovalQueue();
  const res = await processCompany("acme.example", people,
    { enrichment: new MockEnrichment([company]), verifier, classifier: new RuleBasedClassifier(), crm: new MockCrm([]), approvals });
  assert.equal(res.pattern, "first.last");
  assert.equal(res.rows.length, 2);              // finance excluded
  assert.equal(res.verifications, 2);            // first guess right for both
  assert.ok(res.rows.every(r => r.emailStatus === "valid"));
  assert.deepEqual(approvals.pending().map(a => a.personId), ["1"]);
});
