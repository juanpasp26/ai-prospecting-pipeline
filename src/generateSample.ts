// Synthetic companies and people (seeded RNG, fictional names, example.com-style domains).
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyPattern, type PatternId } from "./core/emailPatterns.js";
import type { Company, Person } from "./core/schemas.js";

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const r = rng(42);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];

const FIRST = ["Ana", "Luis", "María", "Jorge", "Camila", "Diego", "Valentina", "Andrés", "Lucía", "Mateo", "Sofía", "Tomás", "Daniela", "Felipe", "Paula", "Martín"];
const LAST = ["García", "Rodríguez", "López", "Martínez", "Pérez", "Gómez", "Díaz", "Torres", "Ramírez", "Flores", "Rojas", "Castro", "Vargas", "Morales"];
const TITLES = ["Sales Director", "Head of Trade Marketing", "Key Account Manager", "Field Sales Manager", "Route-to-Market Lead",
  "Sales Operations Analyst", "Country Manager", "HR Business Partner", "Finance Manager", "Commercial Intern", "Merchandising Lead"];
const COUNTRIES = ["MX", "CO", "PE", "CL", "AR"];

export const COMPANY_PATTERNS: Record<string, PatternId> = {};

export function buildSample() {
  const companies: Company[] = [];
  const people: Person[] = [];
  const names = ["Andes Beverages", "Pacifica Foods", "Solaria Home Care", "Caribe Snacks", "Austral Personal Care", "Selva Coffee Co.", "Norte Dairy", "Lago Distribution"];
  const patterns: PatternId[] = ["first.last", "flast", "f.last", "first.last", "firstlast", "flast", "first.last", "first_last"];
  names.forEach((name, i) => {
    const domain = name.toLowerCase().replace(/[^a-z]/g, "") + ".example";
    const country = pick(COUNTRIES);
    COMPANY_PATTERNS[domain] = patterns[i];
    const staff: Person[] = Array.from({ length: 4 + Math.floor(r() * 5) }, (_, j) => {
      const fullName = `${pick(FIRST)} ${pick(LAST)}`;
      return { personId: `p${i}${j}`, fullName, title: pick(TITLES), companyDomain: domain, country,
        linkedinUrl: `https://www.linkedin.example/in/${fullName.toLowerCase().normalize("NFD").replace(/[^a-z ]/g, "").replace(" ", "-")}-${i}${j}/` };
    });
    const owner = staff[0];
    companies.push({ domain, name, industry: "Consumer goods", employees: pick([120, 450, 800, 2500, 12000]), country,
      knownEmail: i === 6 ? null : { address: applyPattern(patterns[i], owner.fullName, domain), ownerName: owner.fullName } });
    people.push(...staff);
  });
  return { companies, people };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { companies, people } = buildSample();
  mkdirSync("data/sample", { recursive: true });
  writeFileSync("data/sample/companies.json", JSON.stringify(companies, null, 1));
  writeFileSync("data/sample/people.json", JSON.stringify(people, null, 1));
  writeFileSync("data/sample/email_patterns.json", JSON.stringify(COMPANY_PATTERNS, null, 1));
  writeFileSync("data/sample/crm_emails.json", JSON.stringify([]));
  console.log(`Sample: ${companies.length} companies, ${people.length} people -> data/sample/`);
}
