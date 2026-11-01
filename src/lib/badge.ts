import type { CollectionEntry } from 'astro:content';
import { ordinal, rankFirms } from './ranking';

/**
 * The badge a firm can put on its own website, drawn here and served as a file.
 *
 * This is the only thing on the site that travels: every other page waits for somebody to come
 * and read it. 982 firms have earned a tier they cannot show anybody, and the methodology page
 * has been headed "The score behind the badge" since before there was a badge.
 *
 * Two kinds, because two different things are true and they are not the same claim.
 *
 *   the tier badge     "LFL Certified 2026". The score is computed for the firm and not for one
 *                      of its practice areas, so this names no practice. One per firm per year.
 *
 *   the ranking badge  "Ranked 1st of 20, Real Estate, Naples, 2026". Position is measured per
 *                      city and per practice, which is the thing a practice line can honestly
 *                      carry. One per ranking the firm is in, per year, so they accumulate.
 *
 * Goodwin Law is why they are separate: first of twenty in real estate in Naples, and its tier
 * is Verified rather than Certified. Both are true, and one badge reading "Certified in Real
 * Estate" would be neither.
 *
 * The file is static and rebuilt on every deploy, so a firm that loses its tier sees the badge
 * on its own site change. That is the opposite of how this industry works, where the award is a
 * JPEG the firm keeps for ever, and it is the reason ours is worth more than theirs.
 *
 * The year is in the address. From January the 2027 files appear beside the 2026 ones rather
 * than replacing them, which is what lets a firm build up a wall. It also means the 2026 set has
 * to be frozen at the turn of the year instead of being regenerated from 2027 data: a badge
 * dated 2026 is a statement about 2026, and nothing here does that yet.
 */
export const BADGE_YEAR = 2026;

/** Tiers that are earned rather than assigned. A Listed firm has nothing to show. */
export const EARNED_TIERS = ['Verified', 'Certified', 'Distinguished', 'Elite'];

/** How far down a ranking a badge is still worth having. */
export const RANK_CUTOFF = 10;

const W = 310;
const H = 96;
const CX = 48;
const CY = 48;
const FONT = 'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';

const SKIN = {
  dark: { bg: '#07080C', title: '#FFFFFF', sub: '#C9CAD2', meta: '#8A8B96', border: true },
  light: { bg: '#FFFFFF', title: '#0A0A0C', sub: '#3B3C43', meta: '#6F7079', border: false },
};

export type Skin = keyof typeof SKIN;

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function rosettePoints(): string {
  const pts: string[] = [];
  for (let i = 0; i < 24; i += 1) {
    const a = (i * 15 * Math.PI) / 180;
    const r = i % 2 === 0 ? 25 : 19.5;
    pts.push(`${(CX + r * Math.cos(a)).toFixed(1)},${(CY + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

/**
 * One self-contained SVG. No external font, no external image, no script: a browser loading
 * this through an <img> on somebody else's site will not fetch anything of ours except the file
 * itself, and would silently drop it if it tried.
 */
export function badgeSvg(opts: {
  line1: string; line2: string; line3: string; skin: Skin; centre?: string;
}): string {
  const s = SKIN[opts.skin];
  const uid = 'lfl';
  const border = s.border ? `stroke="url(#${uid})"` : 'stroke="#E7E7E2"';
  const pts = rosettePoints();
  const centre = opts.centre
    ? `<text x="${CX}" y="${CY + (opts.centre.length <= 2 ? 7 : 5)}" text-anchor="middle" `
      + `fill="${s.title}" font-family="${FONT}" `
      + `font-size="${opts.centre.length <= 2 ? 19 : 15}" font-weight="700" `
      + `letter-spacing="-0.4">${escape(opts.centre)}</text>`
    : `<path d="M${CX - 8} ${CY + 0.5} l5.6 5.6 l11 -12.4" fill="none" stroke="url(#${uid})" `
      + 'stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(`${opts.line1}, ${opts.line2}, ${opts.line3}`)}">
<defs><linearGradient id="${uid}" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#8B5CF6"/><stop offset="0.55" stop-color="#3B82F6"/><stop offset="1" stop-color="#5EEAD4"/></linearGradient></defs>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${s.bg}" ${border}/>
<polygon points="${pts}" fill="url(#${uid})" opacity="0.18"/>
<polygon points="${pts}" fill="none" stroke="url(#${uid})" stroke-width="1.7"/>
<circle cx="${CX}" cy="${CY}" r="14" fill="none" stroke="url(#${uid})" stroke-width="1.7" opacity="0.7"/>
${centre}
<g font-family="${FONT}">
<text x="88" y="38" fill="${s.title}" font-size="16" font-weight="700" letter-spacing="0.3">${escape(opts.line1)}</text>
<text x="88" y="58" fill="${s.sub}" font-size="12.5">${escape(opts.line2)}</text>
<text x="88" y="76" fill="${s.meta}" font-size="10.5" letter-spacing="0.2">${escape(opts.line3)}</text>
</g>
</svg>
`;
}

export interface Badge {
  /** The file name under /badge/<slug>/, without the extension. */
  kind: string;
  alt: string;
  /** What the firm is being told it has, in our own words, on its profile. */
  headline: string;
  /** The two lines the hero card sets, which are the badge's own two lines. */
  line1: string;
  line2: string;
  /** Where the firm placed, on a ranking badge. Absent on a tier badge. */
  place?: number;
  svg: (skin: Skin) => string;
}

/**
 * The rosette on its own, for the hero card.
 *
 * The badge file is for somebody else's website. On our own page we draw the same mark in our
 * own markup rather than pasting the file in, which is the difference between a card that
 * belongs to the design and a sticker sitting on top of it.
 */
export function rosetteMark(label: string | null, size = 54): string {
  const c = size / 2;
  const pts: string[] = [];
  for (let i = 0; i < 24; i += 1) {
    const a = (i * 15 * Math.PI) / 180;
    const r = i % 2 === 0 ? size / 2 - 1 : (size / 2 - 1) * 0.78;
    pts.push(`${(c + r * Math.cos(a)).toFixed(1)},${(c + r * Math.sin(a)).toFixed(1)}`);
  }
  const uid = `hm${size}`;
  const inner = label
    ? `<text x="${c}" y="${(c + size * 0.13).toFixed(1)}" text-anchor="middle" fill="#fff" `
      + `font-size="${(size * 0.3).toFixed(0)}" font-weight="700" letter-spacing="-0.5">${label}</text>`
    : `<path d="M${c - 8} ${c + 0.5} l5.6 5.6 l11 -12.4" fill="none" stroke="url(#${uid})" `
      + 'stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">`
    + `<defs><linearGradient id="${uid}" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">`
    + '<stop offset="0" stop-color="#8B5CF6"/><stop offset="0.55" stop-color="#3B82F6"/>'
    + '<stop offset="1" stop-color="#5EEAD4"/></linearGradient></defs>'
    + `<polygon points="${pts.join(' ')}" fill="url(#${uid})" opacity="0.2"/>`
    + `<polygon points="${pts.join(' ')}" fill="none" stroke="url(#${uid})" stroke-width="1.5"/>`
    + inner + '</svg>';
}

export function tierBadge(tier: string): Badge {
  return {
    kind: `tier-${BADGE_YEAR}`,
    alt: `LFL ${tier} ${BADGE_YEAR}`,
    headline: `LFL ${tier} ${BADGE_YEAR}`,
    line1: `LFL ${tier} ${BADGE_YEAR}`,
    line2: 'Measured from public records',
    svg: skin => badgeSvg({
      line1: `LFL ${tier}`,
      line2: 'Measured from public records',
      line3: `${BADGE_YEAR} · lawfirmlistings.com`,
      skin,
    }),
  };
}

export function rankBadge(
  practiceSlug: string, practiceName: string, city: string, place: number, total: number,
): Badge {
  const nth = ordinal(place);
  return {
    kind: `${practiceSlug}-${BADGE_YEAR}`,
    alt: `Ranked ${nth} of ${total} for ${practiceName} in ${city}, ${BADGE_YEAR}`,
    headline: `Ranked ${nth} of ${total} · ${practiceName} · ${city}`,
    line1: `Ranked ${nth} of ${total}`,
    line2: `${practiceName} in ${city}, ${BADGE_YEAR}`,
    place,
    svg: skin => badgeSvg({
      line1: `Ranked ${nth} of ${total}`,
      line2: `${practiceName} · ${city}`,
      line3: `${BADGE_YEAR} · lawfirmlistings.com`,
      skin,
      centre: nth,
    }),
  };
}

/** How high a placement has to be before it leads the profile rather than the tier. */
export const PODIUM = 3;

/**
 * The one badge to show at the top of a firm's own page.
 *
 * A placement on the podium is the more interesting fact and the one the tier cannot carry:
 * 110 firms are in the first three of a ranking, and for them "Ranked 1st of 20, Real Estate,
 * Naples" says something the chip beside it does not. The other 872 get the tier badge, which
 * repeats the chip as a picture, and that repetition is the point: the chip is a label on our
 * page and the badge is a thing to take away.
 */
export function heroBadge(
  firm: CollectionEntry<'firms'>, all: CollectionEntry<'firms'>[],
): Badge | null {
  const badges = badgesFor(firm, all);
  if (!badges.length) return null;
  const podium = badges
    .filter(b => b.place !== undefined && b.place <= PODIUM)
    .sort((a, b) => (a.place ?? 99) - (b.place ?? 99))[0];
  return podium ?? badges[0];
}

/**
 * Every badge a firm has earned.
 *
 * `all` is the published collection, which is what a position has to be computed against: a
 * ranking badge is a claim about the other firms in that city and practice, so it cannot be
 * worked out from the firm alone.
 */
export function badgesFor(
  firm: CollectionEntry<'firms'>, all: CollectionEntry<'firms'>[],
): Badge[] {
  const tier = firm.data.score?.tier;
  // The gates are the floor, here as everywhere. A Listed firm has one still open, which is
  // usually that it names no attorney we can check, and its position in a ranking is a true
  // number that would be read as an endorsement it has not earned. Thirty-nine firms were in
  // the first ten of a ranking without a tier, and they get nothing until the gate closes.
  if (!tier || !EARNED_TIERS.includes(tier)) return [];

  const out: Badge[] = [tierBadge(tier)];

  for (const practice of firm.data.practices) {
    const peers = all.filter(f =>
      f.data.market.city_slug === firm.data.market.city_slug
      && f.data.practices.some(p => p.slug === practice.slug));
    if (peers.length < 2) continue;         // a ranking of one ranks nobody
    const place = rankFirms(peers).findIndex(f => f.data.slug === firm.data.slug) + 1;
    if (place < 1 || place > RANK_CUTOFF) continue;
    out.push(rankBadge(practice.slug, practice.name, firm.data.market.city, place, peers.length));
  }
  return out;
}
