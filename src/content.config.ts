import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Every measured value carries its source and date. Unsourced values render as "pending".
const measured = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({ value: inner, source: z.string(), measured_at: z.string(), note: z.string().optional() });

const subScore = z.object({
  code: z.string(), label: z.string(), pts: z.number(), max: z.number(),
  source: z.enum(['registry', 'observed', 'ahrefs', 'places', 'psi', 'court', 'firm', 'illustrative', 'pending']),
  evidence: z.string(),
});
const pillar = z.object({ score: z.number(), max: z.number(), subs: z.array(subScore) });

const firms = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/data/firms' }),
  schema: z.object({
    slug: z.string(), name: z.string(), legal_name: z.string().optional(), entity_type: z.string().optional(),
    initials: z.string(), website: z.string().url(), domain: z.string(), phone: z.string(), phone_vanity: z.string().optional(),
    founded_year: z.number().optional(),
    // 'verified' sits between listed and certified: every eligibility gate passed, which is a
    // real and checkable claim, without asserting the score a certification needs.
    status: z.enum(['listed', 'verified', 'certified', 'not_eligible', 'sample']),
    // Written by scripts/check_ny_dos.py from the state's active corporations register.
    entity: z.object({
      legal_name: z.string(), entity_type: z.string().nullable().optional(), dos_id: z.string(),
      formed: z.string(), source: z.string(), checked_at: z.string(),
    }).optional(),
    // The firm proved it owns this page and maintains its own information. It says nothing
    // about quality — that is what `status` and `score` are for — so it never touches either,
    // and a claimed profile is deliberately styled apart from the certification badge.
    claimed: z.object({
      claimed_at: z.string(),
      verified_via: z.string(),
      contact_role: z.string().optional(),
    }).optional(),
    tagline: z.string().optional(),
    practices: z.array(z.object({ slug: z.string(), name: z.string(), primary: z.boolean().default(false) })),
    market: z.object({ city_slug: z.string(), city: z.string(), state: z.string(), state_name: z.string() }),
    offices: z.array(z.object({ label: z.string(), address: z.string(), by_appointment: z.boolean().default(false), is_hq: z.boolean().default(false), source_url: z.string().optional() })),
    attorneys: z.array(z.object({ name: z.string(), role: z.string(), bar_state: z.string().optional(), bar_number: z.string().optional(), admitted_year: z.number().optional(), registry_status: z.string().optional(), registry_basis: z.string().optional(), registry_note: z.string().optional(), checked_at: z.string().optional() })),
    languages: z.array(z.string()),
    fee_model: z.string(), fee_statement: z.string().optional(), free_consultation: z.boolean(),
    availability: z.array(z.string()).default([]),
    about: z.array(z.string()), quote: z.object({ text: z.string(), attribution: z.string() }).optional(),
    highlights: z.array(z.object({ icon: z.string(), title: z.string(), text: z.string() })).default([]),
    reviews: z.object({
      google: z.object({ rating: z.number(), count_label: z.string(), source: z.string(), fetched_at: z.string() }).optional(),
      // Dates and ratings for the reviews Places returned, five per business listing. The text is
      // deliberately not stored: nothing quotes it, so holding it would serve no purpose.
      sample: z.array(z.object({ published_at: z.string().nullable().optional(), rating: z.number().nullable().optional() })).default([]),
      quotes: z.array(z.object({ text: z.string(), author: z.string(), source: z.string() })).default([]),
    }),
    results: z.array(z.object({ type: z.string(), title: z.string(), description: z.string(), amount: z.string().nullable(), verified: z.boolean(), docket: z.string().optional(), source_url: z.string().optional() })).default([]),
    digital: z.object({
      ahrefs: z.object({ dr: z.number(), ahrefs_rank: z.number(), refdomains: z.number(), refdomains_dofollow: z.number(), backlinks: z.number(), org_keywords: z.number(), org_traffic: z.number(), paid_keywords: z.number(), ai_citations: z.object({ total: z.number(), pages: z.number(), by_platform: z.record(z.number()) }), measured_at: z.string() }).optional(),
      trust_pages: z.record(z.boolean()).optional(),
      schema_detected: z.boolean().optional(),
      psi: measured(z.object({ performance: z.number(), cwv_pass: z.boolean() })).optional(),
      // Google Business Profile aggregate behind pillar C and the measurable half of D3.
      // Counts are summed across the firm's verified listings and the rating is weighted by
      // count, so a multi-office firm is neither rewarded nor penalised for how it splits them.
      places: z.object({
        listing_count: z.number(), review_count_total: z.number(),
        rating_weighted: z.number().nullable(), source: z.string(), measured_at: z.string(),
      }).optional(),
    }),
    // What the firm publishes about its own results: the input for pillar B at v2.0. `readable`
    // separates "publishes nothing", which is a finding, from "we could not read the page", which
    // leaves the pillar pending rather than scoring the firm zero for our failure.
    results_published: z.object({
      readable: z.boolean(), count: z.number().optional(), amounts: z.array(z.number()).default([]),
      largest: z.number().nullable().optional(), aggregate_claims: z.array(z.number()).default([]),
      case_types: z.array(z.string()).default([]), disclaimer: z.boolean().optional(),
      venues: z.array(z.string()).default([]), counted_from: z.string().optional(),
      text_length: z.number().optional(), why: z.string().optional(),
      url: z.string().optional(), checked_at: z.string(),
    }).optional(),
    gates: z.record(z.object({
      pass: z.boolean(), evidence: z.string(), source: z.string(), checked_at: z.string(),
      // Satisfied by the firm's written attestation rather than by our own measurement. Shown
      // as such on the profile: a reader is entitled to know which is which.
      attested: z.boolean().optional(), attested_by: z.string().optional(),
    })),
    cohort_id: z.string(),
    assessments: z.record(z.object({ pts: z.number(), source: z.string().optional(), evidence: z.string() })).optional(),
    // written by scripts/score.py — do not edit by hand
    score: z.object({
      total: z.number(), tier: z.string(), verdict: z.string(), computed_at: z.string(), methodology: z.string(),
      // total is now a percentage of what we could assess. raw and assessed carry the inputs, so
      // no template can print the score without being able to print its coverage too.
      raw: z.number().optional(), assessed: z.number().optional(), coverage: z.number().optional(),
      floor_abc_pct: z.number().optional(),
      pillars: z.object({ A: pillar, B: pillar, C: pillar, D: pillar, E: pillar }),
      floor_abc: z.number(),
      next_tier: z.object({ name: z.string(), needed: z.number(), gap: z.number(), floor_met: z.boolean(), coverage_met: z.boolean().optional(), path: z.array(z.string()) }).nullable(),
    }).optional(),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    similar: z.array(z.object({ name: z.string(), slug: z.string().nullable(), rating: z.string() })).default([]),
  }),
});

const cohorts = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/data/cohorts' }),
  schema: z.object({
    id: z.string(), state: z.string(), practice: z.string(), label: z.string(), measured_at: z.string(), source: z.string(),
    full_size_estimate: z.number().optional(),
    firms: z.array(z.object({ domain: z.string(), name: z.string().optional(), dr: z.number(), refdomains: z.number(), org_keywords: z.number(), org_traffic: z.number() })),
    unresolved: z.array(z.string()).default([]),
  }),
});

export const collections = { firms, cohorts };
