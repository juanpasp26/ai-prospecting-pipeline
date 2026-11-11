import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ClassificationBatchSchema, ClassificationSchema, type Classification, type Company, type Person } from "./schemas.js";

// Written ICP rules: the same text goes to the LLM and drives the offline classifier.
export const ICP_RULES = `
Ideal customer: consumer-goods manufacturers and distributors with field sales teams.
- Include people who run, plan or measure commercial teams. Exclude HR, finance, IT support, interns and students.
- buyingRole: decision_maker = director/head/VP/country manager; influencer = manager/lead; user = analyst/coordinator.
- segment: enterprise >= 1000 employees; mid_market 200-999; small < 200.
- recommendedProduct: field_execution for field sales, trade marketing and route-to-market roles;
  sales_analytics for leadership, sales operations and key accounts; none if excluded.
`;

export interface Classifier {
  classify(people: Person[], companies: Map<string, Company>): Promise<Classification[]>;
}

/** Deterministic classifier that follows ICP_RULES. Used in tests and when no API key is set. */
export class RuleBasedClassifier implements Classifier {
  async classify(people: Person[], companies: Map<string, Company>): Promise<Classification[]> {
    return people.map(p => {
      const t = p.title.toLowerCase();
      const c = companies.get(p.companyDomain);
      const excluded = /(hr|human resources|finance|accountant|it support|intern|student|recruit)/.test(t);
      const buyingRole = excluded ? "not_relevant"
        : /(director|head|vp|country manager|general manager)/.test(t) ? "decision_maker"
        : /(manager|lead)/.test(t) ? "influencer" : "user";
      const employees = c?.employees ?? 0;
      const segment = employees >= 1000 ? "enterprise" : employees >= 200 ? "mid_market" : "small";
      const recommendedProduct = excluded ? "none"
        : /(field|trade|route|merchandis)/.test(t) ? "field_execution" : "sales_analytics";
      return ClassificationSchema.parse({
        personId: p.personId, include: !excluded, buyingRole, segment, recommendedProduct,
        reason: excluded ? "Outside the ICP (non-commercial role)" : `Commercial role at a ${segment} company`,
      });
    });
  }
}

/** Claude with structured output. Every result is validated with Zod; invalid ones are dropped, never patched. */
export class ClaudeClassifier implements Classifier {
  constructor(private client = new Anthropic(), private model = "claude-haiku-5-5") {}

  async classify(people: Person[], companies: Map<string, Company>): Promise<Classification[]> {
    const lines = people.map(p => {
      const c = companies.get(p.companyDomain);
      return `<person id="${p.personId}">${p.title} at ${c?.name ?? p.companyDomain} (${c?.industry ?? "?"}, ${c?.employees ?? "?"} employees, ${p.country})</person>`;
    });
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 8000,
      output_config: { effort: "low", format: zodOutputFormat(ClassificationBatchSchema) },
      system: `Classify each person for B2B prospecting. Follow these rules exactly:\n${ICP_RULES}\nReturn one classification per person id.`,
      messages: [{ role: "user", content: lines.join("\n") }],
    });
    const out = response.parsed_output?.classifications ?? [];
    const wanted = new Set(people.map(p => p.personId));
    return out.filter(c => wanted.has(c.personId) && ClassificationSchema.safeParse(c).success);
  }
}

export function pickClassifier(): Classifier {
  return process.env.ANTHROPIC_API_KEY ? new ClaudeClassifier() : new RuleBasedClassifier();
}
