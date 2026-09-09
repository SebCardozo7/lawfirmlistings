/**
 * Meta-description length rules, enforced at build time.
 *
 * A description outside roughly 70–155 characters is either truncated in the result snippet or
 * too thin to say anything, so the range is a house rule rather than a preference. Several pages
 * had drifted past 200 because their description was assembled from computed figures and nobody
 * was counting, which is exactly the kind of thing a build should notice instead of a person.
 *
 * The check warns rather than throwing: a description is written for a reader, and failing a
 * production build over a snippet three characters long would be the wrong trade. `npm run
 * check:meta` reads the built HTML and exits non-zero, so the rule is still enforceable in CI.
 */
export const META_MIN = 70;
export const META_MAX = 155;

const seen = new Set<string>();

export function checkDescription(description: string, pathname: string): void {
  const n = description.length;
  if (n >= META_MIN && n <= META_MAX) return;
  // One line per page, not per render, so a dynamic route with many pages stays readable.
  if (seen.has(pathname)) return;
  seen.add(pathname);
  const how = n > META_MAX ? `${n - META_MAX} over the ${META_MAX} limit` : `${META_MIN - n} short of ${META_MIN}`;
  console.warn(`[meta] ${pathname} — description is ${n} characters, ${how}`);
}

/**
 * Join sentence fragments into a description that fits, dropping trailing fragments that would
 * push it over. For descriptions built from data, where the length is not knowable when the
 * template is written — a firm whose name runs to 70 characters should lose the last clause,
 * not the first.
 */
export function fitDescription(head: string, ...tail: string[]): string {
  let out = head.trim();
  for (const part of tail) {
    const next = `${out} ${part.trim()}`.trim();
    if (next.length > META_MAX) break;
    out = next;
  }
  return out;
}
