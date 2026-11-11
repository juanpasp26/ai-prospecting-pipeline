// Infer a company's email pattern from ONE verified address, then apply it to everyone else.
// If verification fails, fall back through up to 3 common patterns.

export const PATTERNS = {
  "first.last": (f: string, l: string) => `${f}.${l}`,
  "flast": (f: string, l: string) => `${f[0]}${l}`,
  "first": (f: string, _l: string) => f,
  "f.last": (f: string, l: string) => `${f[0]}.${l}`,
  "firstlast": (f: string, l: string) => `${f}${l}`,
  "first_last": (f: string, l: string) => `${f}_${l}`,
} as const;
export type PatternId = keyof typeof PATTERNS;

export const FALLBACK_ORDER: PatternId[] = ["first.last", "flast", "f.last"];

export function cleanName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

export function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  return { first: cleanName(parts[0] ?? ""), last: cleanName(parts[1] ?? parts[0] ?? "") };
}

export function inferPattern(knownEmail: string, fullName: string): PatternId | null {
  const local = knownEmail.split("@")[0].toLowerCase();
  const { first, last } = splitName(fullName);
  for (const [id, fn] of Object.entries(PATTERNS) as [PatternId, (f: string, l: string) => string][]) {
    if (fn(first, last) === local) return id;
  }
  return null;
}

export function applyPattern(pattern: PatternId, fullName: string, domain: string): string {
  const { first, last } = splitName(fullName);
  return `${PATTERNS[pattern](first, last)}@${domain}`;
}

export function candidates(fullName: string, domain: string, inferred: PatternId | null): string[] {
  const order = inferred ? [inferred, ...FALLBACK_ORDER.filter(p => p !== inferred)] : FALLBACK_ORDER;
  return order.slice(0, 3).map(p => applyPattern(p, fullName, domain));
}
