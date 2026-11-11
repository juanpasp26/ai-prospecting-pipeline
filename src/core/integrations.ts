// Interfaces for the external tools, plus in-memory mocks so the whole pipeline runs offline.
import type { Company } from "./schemas.js";

export type VerifyResult = "valid" | "invalid" | "unknown";

export interface EmailVerifier { verify(email: string): Promise<VerifyResult> }
export interface Enrichment { company(domain: string): Promise<Company | null> }
export interface Crm { existingEmails(): Promise<Set<string>> }

/** Accepts only addresses that match the domain's real pattern (known to the mock). */
export class MockVerifier implements EmailVerifier {
  calls = 0;
  constructor(private truth: Map<string, (local: string) => boolean>) {}
  async verify(email: string): Promise<VerifyResult> {
    this.calls++;
    const [local, domain] = email.split("@");
    const rule = this.truth.get(domain);
    if (!rule) return "unknown"; // catch-all or unknown domain
    return rule(local) ? "valid" : "invalid";
  }
}

export class MockEnrichment implements Enrichment {
  calls = 0;
  constructor(private companies: Company[]) {}
  async company(domain: string) {
    this.calls++;
    return this.companies.find(c => c.domain === domain) ?? null;
  }
}

export class MockCrm implements Crm {
  constructor(private emails: string[]) {}
  async existingEmails() { return new Set(this.emails.map(e => e.toLowerCase())); }
}
