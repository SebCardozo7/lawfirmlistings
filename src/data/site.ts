/**
 * Facts about the publisher that the About, Contact, Privacy and Terms pages render.
 *
 * These are the details only Sebastián can supply. Every field is optional and every page
 * omits the line rather than printing a placeholder, so an unfilled field leaves a shorter
 * page instead of a false one.
 *
 * The mailboxes below have to exist before these pages are indexed. A contact page listing an
 * address that bounces is worse than one that says the channel is being set up — a firm trying
 * to correct its own profile is exactly the reader who must get through.
 */
export const SITE = {
  /** Registered legal entity that publishes the site, e.g. "Ranker Studio LLC". */
  legalEntity: '',
  /** Postal address. Several state bar advertising rules expect a publisher address. */
  postalAddress: '',
  /** Jurisdiction whose law governs the Terms, e.g. "the State of New York". */
  governingLaw: '',

  /** General enquiries. */
  emailGeneral: '',
  /** Corrections to a firm profile or a score. The methodology promises a 30-day appeal. */
  emailCorrections: '',
  /** Firms claiming or managing their profile. */
  emailFirms: '',
  /** Privacy requests: access, deletion, objection. */
  emailPrivacy: '',

  /** Who is editorially responsible. Left blank until there is a real name to publish. */
  editorialLead: '',
  /** The licensed attorney who reviews appeals, per methodology section 8. */
  reviewingAttorney: '',

  /** Last substantive revision of the Privacy policy and Terms. */
  policiesUpdated: '2026-09-09',
} as const;

export const hasAnyContact = Boolean(
  SITE.emailGeneral || SITE.emailCorrections || SITE.emailFirms || SITE.emailPrivacy);
