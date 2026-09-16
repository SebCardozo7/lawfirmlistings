/**
 * What a firm has actually earned, stated as things rather than as numbers.
 *
 * A scorecard is the right instrument for somebody auditing us and the wrong one for a partner
 * deciding whether this directory is worth showing a client. "D4 3/5" means nothing to them.
 * "Publishes bar admission numbers for every attorney" means something, and it is the same fact.
 *
 * Two rules hold this honest, and they are the whole reason it is a module with tests rather
 * than markup in a template.
 *
 * Every achievement is derived from a measured value, and carries the evidence that produced it.
 * Nothing here can be granted, and nothing is awarded for engaging with us: claiming a profile,
 * being a client, appearing in this directory at all. Those are facts about our relationship with
 * a firm, and a reader looking for a lawyer is owed facts about the firm.
 *
 * An achievement a firm cannot fail to get is not an achievement. Each threshold below either
 * separates firms in this directory today or is a real bar somebody had to clear; a line nobody
 * misses is a participation trophy with better typography.
 */

export interface Achievement {
  /** Stable id, so a design change cannot silently alter which firms hold what. */
  id: string;
  label: string;
  /** The evidence, in a sentence a firm could repeat to a client. */
  detail: string;
  icon: string;
  /** `tier` is the certification itself; `earned` is everything else. */
  kind: 'tier' | 'earned';
  /** The detail is the firm's own sentence rather than ours, so the page sets it as a
   *  quotation. Its punctuation is the firm's and is not ours to tidy. */
  quoted?: boolean;
}

const EARNED_TIERS = ['Certified', 'Distinguished', 'Elite'];

function reviewCount(firm: any): number {
  const label = firm.reviews?.google?.count_label ?? '';
  const digits = String(label).replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

export function achievementsFor(firm: any): Achievement[] {
  const out: Achievement[] = [];
  const s = firm.score;
  const year = s?.computed_at ? new Date(s.computed_at).getUTCFullYear() : null;

  // 1. The certification, which is the one a firm came here for.
  if (s && EARNED_TIERS.includes(s.tier)) {
    out.push({
      id: 'certified', kind: 'tier', icon: 'shield',
      label: `LFL ${s.tier} ${year ?? ''}`.trim(),
      detail: `Scored ${s.total} out of 100 on measured evidence, above the ${
        s.tier === 'Certified' ? 70 : s.tier === 'Distinguished' ? 85 : 93
      } this tier requires, with every eligibility gate its state allows us to check cleared.`,
    });
  } else if (s?.tier === 'Verified') {
    out.push({
      id: 'verified', kind: 'tier', icon: 'check',
      label: `LFL Verified ${year ?? ''}`.trim(),
      detail: 'Every eligibility gate this firm\'s state allows us to check has been checked and '
        + 'held: licensure, discipline, entity, website and footprint. Certification additionally '
        + 'requires a score of 70.',
    });
  }

  // 2. Discipline, checked and clean. The single thing a client most needs to know, and the
  //    reason a directory like this exists at all.
  const g2 = firm.gates?.G2;
  if (g2?.pass) {
    out.push({
      id: 'clean-record', kind: 'earned', icon: 'shield',
      label: 'No public discipline',
      detail: g2.evidence,
    });
  }

  // 3. Client voice. 300 reviews is roughly the top quartile across this directory and is a
  //    number a firm cannot reach without years of actual clients.
  const reviews = reviewCount(firm);
  if (reviews >= 300) {
    out.push({
      id: 'client-voice', kind: 'earned', icon: 'star',
      label: `${reviews.toLocaleString('en-US')} client reviews`,
      detail: `Counted across ${firm.digital?.places?.listing_count ?? 1} verified Google `
        + 'Business Profile listings, not collected by us and not solicited through us.',
    });
  }

  // 4. Held a high rating at volume. Either half alone is easy; together they are not.
  const rating = firm.reviews?.google?.rating;
  if (rating >= 4.7 && reviews >= 100) {
    out.push({
      id: 'rated', kind: 'earned', icon: 'star',
      label: `${rating} average over ${reviews.toLocaleString('en-US')} reviews`,
      detail: 'A high rating is easy at low volume and hard to hold at this one. Pillar C scores '
        + 'it against the market rather than against five stars.',
    });
  }

  // 5. Bar numbers on the bios. Rare, cheap to do, and the thing that makes a roster checkable
  //    by anybody rather than only by us.
  if (firm.digital?.trust_pages?.bar_numbers_on_bios) {
    out.push({
      id: 'bar-numbers', kind: 'earned', icon: 'doc',
      label: 'Bar numbers published',
      detail: 'The firm publishes each attorney\'s bar admission number on their own page, so a '
        + 'reader can check the register without taking anyone\'s word for it.',
    });
  }

  // 6. Fee terms in the open. Most firms say "no fee unless we win" and stop there.
  if (firm.fee_statement && firm.free_consultation) {
    out.push({
      id: 'fees', kind: 'earned', icon: 'check',
      label: 'Fee terms published',
      detail: firm.fee_statement,
      quoted: true,
    });
  }

  // 7. More than one language, published rather than implied.
  const languages = (firm.languages ?? []).filter((l: string) => l && l !== 'English');
  if (languages.length) {
    out.push({
      id: 'languages', kind: 'earned', icon: 'globe',
      label: `Service in ${languages.join(' and ')}`,
      detail: 'Published by the firm on its own pages, which is how this was measured rather '
        + 'than assumed from a name.',
    });
  }

  // 8. Results published with enough detail to mean something. The count alone is not the
  //    achievement: a page of figures with no case types is a page of figures.
  const published = firm.results_published;
  if (published?.readable && published.count >= 10 && (published.case_types?.length ?? 0) >= 5) {
    out.push({
      id: 'results', kind: 'earned', icon: 'doc',
      label: `${published.count} results published`,
      detail: `Across ${published.case_types.length} case types on the firm's own site. We read `
        + 'the page and counted what is on it; the amounts are the firm\'s and we have not '
        + 'confirmed them.',
    });
  }

  // 9. Years in practice, from the registers rather than from a marketing line. Only where a
  //    register actually gave us admission years.
  const a2 = s?.pillars?.A?.subs?.find((x: any) => x.code === 'A2');
  const mean = a2?.source === 'registry' ? /Mean ([0-9.]+) years/.exec(a2.evidence)?.[1] : null;
  if (mean && parseFloat(mean) >= 15) {
    out.push({
      id: 'experience', kind: 'earned', icon: 'check',
      label: `${Math.round(parseFloat(mean))} years average at the bar`,
      detail: a2.evidence,
    });
  }

  return out;
}

/**
 * The administrative marks. Kept apart from achievements on purpose and never mixed into that
 * list: a firm maintaining its own entry is a fact about its relationship with this directory,
 * which is a different kind of thing from a fact about its practice, and the page has to make
 * that difference visible rather than leave a reader to infer it.
 */
export function marksFor(firm: any): Achievement[] {
  if (!firm.claimed) return [];
  return [{
    id: 'firm-managed', kind: 'earned', icon: 'check',
    label: 'Firm-managed profile',
    detail: 'The firm has confirmed it owns this page and keeps its own information current. It '
      + 'changes nothing about the score, the gates or the tier, which stay ours to measure.',
  }];
}
