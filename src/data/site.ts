/**
 * Facts about the publisher that the About, Contact, Privacy and Terms pages render.
 *
 * Every field is optional and every page omits its line rather than printing a placeholder, so
 * an unfilled field leaves a shorter page instead of a false one.
 */
export const SITE = {
  /** Registered legal entity that publishes the site. */
  legalEntity: 'CASICIEN SRL',
  /**
   * Postal address. Several state bar advertising rules expect a publisher address, and a
   * reader deciding whether to trust a directory should be able to see where it is written
   * from. City and country are spelled out because the audience is in the United States and
   * "11300" means nothing to them.
   */
  postalAddress: 'Víctor Soliño 349, 11300 Montevideo, Uruguay',
  /**
   * Jurisdiction whose law governs the Terms. Uruguay, where the publishing entity is
   * registered.
   *
   * Worth being clear-eyed about what this clause does: it sets which law governs the contract
   * between the site and its readers. It does not decide where a rated firm could sue, and it
   * does not put the site outside the reach of United States regulators — state bar advertising
   * rules and the FTC attach to where content is published and read. This is one of the
   * specific things the pending legal review should look at.
   */
  governingLaw: 'Uruguay',

  /**
   * One address for everything, on purpose: a second mailbox is a second bill the day this
   * moves off Cloudflare Email Routing onto a provider that charges per user. The contact page
   * pre-fills a subject line per reason instead, so one inbox can still be triaged.
   */
  email: 'hello@lawfirmlistings.com',

  /** Who is editorially responsible. Left blank until there is a real name to publish. */
  editorialLead: '',
  /** The licensed attorney who reviews appeals, per methodology section 8. */
  reviewingAttorney: '',

  /** Last substantive revision of the Privacy policy and Terms. */
  policiesUpdated: '2026-09-09',
} as const;

/** mailto: with a subject that says why, so a single inbox can be filtered. */
export function mailto(subject?: string) {
  if (!SITE.email) return null;
  return subject
    ? `mailto:${SITE.email}?subject=${encodeURIComponent(subject)}`
    : `mailto:${SITE.email}`;
}
