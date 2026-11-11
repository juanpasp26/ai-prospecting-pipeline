// Per-company processing: enrich → classify → find email → build master rows → ask approval for phone reveals.
import type { Classifier } from "./classify.js";
import { candidates, inferPattern } from "./emailPatterns.js";
import type { ApprovalQueue } from "./approvals.js";
import type { Crm, EmailVerifier, Enrichment } from "./integrations.js";
import { rowKey } from "./master.js";
import type { Company, MasterRow, Person } from "./schemas.js";

export interface Deps { enrichment: Enrichment; verifier: EmailVerifier; classifier: Classifier; crm: Crm; approvals: ApprovalQueue }

export interface CompanyResult { domain: string; rows: MasterRow[]; verifications: number; excluded: number; pattern: string | null }

export async function processCompany(domain: string, people: Person[], deps: Deps): Promise<CompanyResult> {
  const company = await deps.enrichment.company(domain);
  if (!company) return { domain, rows: [], verifications: 0, excluded: people.length, pattern: null };

  const classifications = new Map(
    (await deps.classifier.classify(people, new Map([[domain, company]]))).map(c => [c.personId, c]),
  );
  const crmEmails = await deps.crm.existingEmails();
  const pattern = company.knownEmail ? inferPattern(company.knownEmail.address, company.knownEmail.ownerName) : null;

  let verifications = 0, excluded = 0;
  const rows: MasterRow[] = [];
  for (const p of people) {
    const c = classifications.get(p.personId);
    if (!c || !c.include) { excluded++; continue; }

    let email: string | null = null, emailStatus: MasterRow["emailStatus"] = "not_found";
    for (const candidate of candidates(p.fullName, domain, pattern)) {
      verifications++;
      const result = await deps.verifier.verify(candidate);
      if (result === "valid") { email = candidate; emailStatus = "valid"; break; }
      if (result === "unknown") { email = candidate; emailStatus = "unknown"; break; } // catch-all: keep, don't burn more checks
    }

    const needsPhone = c.buyingRole === "decision_maker";
    if (needsPhone) deps.approvals.request(p.personId, `Phone reveal for ${c.buyingRole} at ${company.name}`, 8);

    rows.push({
      key: rowKey(p.linkedinUrl, email), personId: p.personId, fullName: p.fullName, title: p.title,
      company: company.name, country: p.country, email, emailStatus,
      buyingRole: c.buyingRole, segment: c.segment, recommendedProduct: c.recommendedProduct,
      phoneStatus: needsPhone ? "pending_approval" : "not_requested",
      crmStatus: email && crmEmails.has(email) ? "in_crm" : "new",
      lastTouch: null,
      status: emailStatus === "valid" ? "ready_for_outreach" : "new",
    });
  }
  return { domain, rows, verifications, excluded, pattern };
}

export function groupByCompany(people: Person[]): Map<string, Person[]> {
  const m = new Map<string, Person[]>();
  for (const p of people) m.set(p.companyDomain, [...(m.get(p.companyDomain) ?? []), p]);
  return m;
}

export type { Company };
