/**
 * Naming an office.
 *
 * Office labels come from Google Business Profile, which means they are whatever a firm typed
 * into its listing rather than the name of a place. In practice they read back as the firm's own
 * name with a sales tail bolted on:
 *
 *   "Sakkas, Cahn & Weiss, LLP — Manhattan, NY, Personal Injury Lawyers"
 *   "Shulman & Hill - Manhattan Personal Injury Lawyer"
 *   "Frekhtman & Associates (Brooklyn)"
 *
 * Under a heading that already carries the firm's name, that is the name twice and a keyword
 * string. Cutting the tail off is not enough either, because what is left is usually the firm's
 * name on its own.
 *
 * So an office is named by where it is. The postal address is structured and says "New York" or
 * "Brooklyn" or "Garden City", and that is the one thing a reader scanning eight offices
 * actually wants. A label that says something the firm's name does not is kept, because a firm
 * that wrote "Mount Vernon Office" or "By appointment only" was telling us something.
 */

/** The postal city, which is the field before the one holding the state and ZIP. */
export function locality(address: string | undefined | null): string {
  const parts = (address || '').split(',').map(p => p.trim()).filter(Boolean);
  const i = parts.findIndex(p => /^[A-Z]{2}\s+\d{5}(-\d{4})?$/.test(p));
  if (i > 0) {
    const city = parts[i - 1];
    // A Manhattan address is written "New York, NY", so the postal city repeats the state.
    return city === 'New York' && parts[i].startsWith('NY') ? 'Manhattan' : city;
  }
  return parts.length > 2 ? parts[1] : '';
}

/** The label with its keyword tail removed, which is where a firm's name usually ends. */
export function shortLabel(label: string | undefined | null): string {
  if (!label) return '';
  const cut = label.split(/\s+[—–-]\s+|\s*[(|]/)[0];
  return (cut || label).replace(/[,\s]+$/, '').trim();
}

const bare = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function officeLabel(label: string | undefined | null,
                            address: string | undefined | null,
                            firmName: string): string {
  const short = shortLabel(label);
  const place = locality(address);
  if (!short) return place;

  // Does the label just say the firm's name again? Compared without punctuation, because
  // "Sakkas, Cahn & Weiss, LLP" and "Sakkas Cahn & Weiss LLP" are the same claim.
  const a = bare(short);
  const b = bare(firmName);
  const sameAsFirm = a.length > 3 && b.length > 3 && (a.includes(b) || b.includes(a));

  return sameAsFirm && place ? place : short;
}
