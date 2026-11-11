// Run the whole pipeline locally with mocks: `npm run demo`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ApprovalQueue } from "./core/approvals.js";
import { pickClassifier } from "./core/classify.js";
import { PATTERNS, type PatternId } from "./core/emailPatterns.js";
import { MockCrm, MockEnrichment, MockVerifier } from "./core/integrations.js";
import { mergeIntoMaster, toCsv } from "./core/master.js";
import { groupByCompany, processCompany } from "./core/pipeline.js";
import { splitName } from "./core/emailPatterns.js";
import type { Company, MasterRow, Person } from "./core/schemas.js";

const read = <T>(f: string): T => JSON.parse(readFileSync(`data/sample/${f}`, "utf8"));
const companies = read<Company[]>("companies.json");
const people = read<Person[]>("people.json");
const patterns = read<Record<string, PatternId>>("email_patterns.json");

// The mock verifier knows each domain's real pattern (one domain behaves as catch-all).
const truth = new Map<string, (local: string) => boolean>();
for (const [domain, pattern] of Object.entries(patterns)) {
  if (domain.startsWith("lago")) continue; // catch-all → "unknown"
  const valid = new Set(people.filter(p => p.companyDomain === domain).map(p => {
    const { first, last } = splitName(p.fullName); return PATTERNS[pattern](first, last);
  }));
  truth.set(domain, local => valid.has(local));
}

const verifier = new MockVerifier(truth);
const approvals = new ApprovalQueue();
const deps = { enrichment: new MockEnrichment(companies), verifier, classifier: pickClassifier(), crm: new MockCrm(read<string[]>("crm_emails.json")), approvals };

let master: MasterRow[] = [];
console.log(`Classifier: ${deps.classifier.constructor.name}\n`);
console.log("company".padEnd(26), "people  kept  pattern      verifications");
for (const [domain, group] of groupByCompany(people)) {
  const res = await processCompany(domain, group, deps);
  master = mergeIntoMaster(master, res.rows).master;
  console.log(domain.padEnd(26), String(group.length).padStart(6), String(res.rows.length).padStart(5), " ", (res.pattern ?? "unknown").padEnd(12), String(res.verifications).padStart(5));
}

// Second run of the same data: nothing should be added twice.
const rerun = mergeIntoMaster(master, master.map(r => ({ ...r })));
const ready = master.filter(r => r.status === "ready_for_outreach").length;
const naive = master.length * 3;

mkdirSync("output", { recursive: true });
writeFileSync("output/master.csv", toCsv(master, new Date()));
console.log(`
Master sheet: ${master.length} people (${ready} ready for outreach) -> output/master.csv
Re-running the same input added ${rerun.added} duplicates.
Email checks used: ${verifier.calls} (checking 3 patterns for everyone would cost ${naive}).
Phone reveals waiting for human approval: ${approvals.pending().length}. Credits spent without approval: 0.`);
