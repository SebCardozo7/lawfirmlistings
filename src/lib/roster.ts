/**
 * Who on a firm's roster we can actually call an attorney.
 *
 * This exists because of a default. scripts/crawl_attorneys.py reads names off a firm's team
 * pages and wrote `role: "Attorney"` whenever the firm printed no role beside a name, and
 * promote_measurements.py then dropped the field that recorded the firm had said nothing. So a
 * profile showed "27 attorneys" for a firm where seventeen of those names came off an
 * /our-team/ page with no role, no registration and, on inspection, several that read as an
 * operations team rather than a bar-admitted one.
 *
 * Calling somebody an attorney is a statement about a real person's credentials, and it is the
 * kind of statement this directory exists to be careful with. So the roster splits three ways,
 * and nothing is inferred from a name:
 *
 *   attorney   the state register matched them, or the firm itself printed a lawyer's role
 *              beside their name. Evidence either way, held on the record.
 *   colleague  the firm names them among its people and printed no role we could read. That is
 *              a fact about the firm's page, not about the person, and it is all we can say.
 *   staff      the firm printed a role that is not a lawyer's: paralegal, case manager, intake.
 *
 * The count a profile publishes is the first group. The others are named, because the firm
 * names them, and are not counted as attorneys.
 */

export type RosterRole = 'attorney' | 'colleague' | 'staff';

export interface RosterPerson {
  name: string;
  role?: string;
  role_source?: string;
  bar_number?: string;
  bar_state?: string;
  admitted_year?: number;
  registry_status?: string;
  source_url?: string;
}

/** A role a firm prints beside a name that means the person practises law. */
const LAWYER_ROLE = /\b(attorney|lawyer|partner|associate|of counsel|counsel|esq|solicitor|advocate|shareholder|founder|principal)\b/i;

/** A role a firm prints that means they do not. Checked first: "paralegal" contains no lawyer
 *  word, but "litigation paralegal" and "attorney's assistant" both would. */
const NOT_A_LAWYER_ROLE = /\b(paralegal|legal assistant|assistant|case manager|case worker|intake|receptionist|office manager|administrator|admin|clerk|investigator|nurse|marketing|operations|bookkeeper|accountant|translator|interpreter|coordinator|specialist|analyst)\b/i;

export function classify(person: RosterPerson): RosterRole {
  const role = person.role ?? '';
  // "not stated by the firm" is what the crawler records when it printed no role. An older
  // crawl wrote the word "Attorney" in that case, which is why the source field is checked
  // before the role string and not after.
  const stated = role && person.role_source !== 'not stated by the firm';

  if (stated && NOT_A_LAWYER_ROLE.test(role)) return 'staff';
  if (person.bar_number) return 'attorney';
  if (stated && LAWYER_ROLE.test(role)) return 'attorney';
  return 'colleague';
}

export interface RosterSummary {
  attorneys: RosterPerson[];
  colleagues: RosterPerson[];
  staff: RosterPerson[];
  /** How many of the attorneys carry a registration we matched. */
  verified: number;
  /** The sentence a profile prints under the heading, or null where there is nothing to add. */
  note: string | null;
}

export function rosterFor(firm: {
  attorneys?: RosterPerson[];
  market?: { state_name?: string };
}): RosterSummary {
  const people = firm.attorneys ?? [];
  const attorneys = people.filter(p => classify(p) === 'attorney');
  const colleagues = people.filter(p => classify(p) === 'colleague');
  const staff = people.filter(p => classify(p) === 'staff');
  const verified = attorneys.filter(p => p.bar_number).length;
  const state = firm.market?.state_name ?? 'state';

  const parts: string[] = [];
  if (attorneys.length === 0) {
    parts.push('the firm names its people without saying who among them practises law');
  } else if (verified === 0) {
    parts.push(`listed by the firm, licensure not yet checked against the ${state} attorney register`);
  } else if (verified === attorneys.length) {
    parts.push(`every licence checked against the ${state} attorney register`);
  } else {
    parts.push(`${verified} of ${attorneys.length} licences checked against the ${state} attorney register`);
  }
  if (colleagues.length) {
    parts.push(`${colleagues.length} more ${colleagues.length === 1 ? 'person is' : 'people are'} `
      + 'named by the firm without a role, so we do not call them attorneys');
  }

  return { attorneys, colleagues, staff, verified, note: parts.join(' · ') || null };
}
