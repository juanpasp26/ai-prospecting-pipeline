// The single source of truth: one row per person, de-duplicated by LinkedIn URL or email.
import type { MasterRow } from "./schemas.js";

export function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().split("?")[0].replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?/, "");
}

export function rowKey(linkedinUrl: string, email: string | null): string {
  return linkedinUrl ? normalizeUrl(linkedinUrl) : (email ?? "").toLowerCase();
}

/** Merge incoming rows into the master. Existing rows keep their history (CRM status, last touch, phone). */
export function mergeIntoMaster(master: MasterRow[], incoming: MasterRow[]): { master: MasterRow[]; added: number; updated: number } {
  const byKey = new Map(master.map(r => [r.key, r]));
  const byEmail = new Map(master.filter(r => r.email).map(r => [r.email!.toLowerCase(), r]));
  let added = 0, updated = 0;
  for (const row of incoming) {
    const existing = byKey.get(row.key) ?? (row.email ? byEmail.get(row.email.toLowerCase()) : undefined);
    if (existing) {
      Object.assign(existing, {
        title: row.title, buyingRole: row.buyingRole, segment: row.segment, recommendedProduct: row.recommendedProduct,
        email: existing.email ?? row.email, emailStatus: existing.email ? existing.emailStatus : row.emailStatus,
      });
      updated++;
    } else {
      const copy = { ...row };
      byKey.set(copy.key, copy);
      if (copy.email) byEmail.set(copy.email.toLowerCase(), copy);
      added++;
    }
  }
  return { master: [...byKey.values()], added, updated };
}

export function daysSince(isoDate: string | null, today: Date): number | null {
  if (!isoDate) return null;
  return Math.floor((today.getTime() - new Date(isoDate).getTime()) / 86_400_000);
}

export function toCsv(rows: MasterRow[], today: Date): string {
  const cols = ["key", "fullName", "title", "company", "country", "email", "emailStatus", "buyingRole", "segment",
    "recommendedProduct", "phoneStatus", "crmStatus", "lastTouch", "status"] as const;
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const header = [...cols, "daysSinceLastTouch"].join(",");
  return [header, ...rows.map(r => [...cols.map(c => esc(r[c])), esc(daysSince(r.lastTouch, today))].join(","))].join("\n");
}
