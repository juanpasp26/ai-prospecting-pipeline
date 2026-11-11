import { z } from "zod";

export const PersonSchema = z.object({
  personId: z.string(),
  fullName: z.string(),
  title: z.string(),
  companyDomain: z.string(),
  linkedinUrl: z.string(),
  country: z.string(),
});
export type Person = z.infer<typeof PersonSchema>;

export const CompanySchema = z.object({
  domain: z.string(),
  name: z.string(),
  industry: z.string(),
  employees: z.number().int(),
  country: z.string(),
  // One verified email per domain (and whose it is), if we have one. The pattern is inferred from it.
  knownEmail: z.object({ address: z.string(), ownerName: z.string() }).nullable(),
});
export type Company = z.infer<typeof CompanySchema>;

// What the LLM must return for every person. Anything else is rejected, not patched.
export const ClassificationSchema = z.object({
  personId: z.string(),
  include: z.boolean(),
  buyingRole: z.enum(["decision_maker", "influencer", "user", "not_relevant"]),
  segment: z.enum(["enterprise", "mid_market", "small"]),
  recommendedProduct: z.enum(["sales_analytics", "field_execution", "none"]),
  reason: z.string().max(200),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export const ClassificationBatchSchema = z.object({ classifications: z.array(ClassificationSchema) });

export const MasterRowSchema = z.object({
  key: z.string(),
  personId: z.string(),
  fullName: z.string(),
  title: z.string(),
  company: z.string(),
  country: z.string(),
  email: z.string().nullable(),
  emailStatus: z.enum(["valid", "invalid", "unknown", "not_found"]),
  buyingRole: z.string(),
  segment: z.string(),
  recommendedProduct: z.string(),
  phoneStatus: z.enum(["not_requested", "pending_approval", "approved", "rejected"]),
  crmStatus: z.enum(["new", "in_crm"]),
  lastTouch: z.string().nullable(),
  status: z.enum(["new", "ready_for_outreach", "in_sequence", "excluded"]),
});
export type MasterRow = z.infer<typeof MasterRowSchema>;
