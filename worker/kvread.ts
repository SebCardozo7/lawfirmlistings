/**
 * Reading a lot of KV at once, which the desk does on every page it draws.
 *
 * Two things here, and both are about the same mistake: treating a network round trip like a
 * property access. A KV read is a request to another machine. One is a few milliseconds and
 * costs nothing to think about, and the loop that reads six hundred of them one after another
 * looks exactly the same in the source.
 *
 * It is not the same. The desk's overview read 569 prospect rows and up to 400 leads in two
 * sequential loops and took 133 seconds to answer, which is not a slow page, it is a page
 * nobody will ever see the bottom of. The fix is not fewer reads, it is not waiting for each
 * one before starting the next.
 */

/**
 * How many keys one list call may ask for.
 *
 * 999 and not 1,000 because the two sources disagree: Cloudflare's documentation says 1,000
 * is the maximum, and the 400 a real namespace answers with says "Please specify integer less
 * than 1000". One of them is wrong, and the way to find out which is to put it in production
 * and watch every page of the desk return "Worker threw exception", which is how we got here.
 */
const PAGE = 999;

/**
 * How many reads are in flight at once.
 *
 * Not unbounded. Six hundred simultaneous reads is a thundering herd against one namespace
 * and a good way to be rate limited, and the time saved between sixty-four at a time and six
 * hundred at a time is nothing worth having: both finish in about the same number of round
 * trips once the pipe is full.
 */
const FAN = 64;

/**
 * Every key under a prefix, followed to the end.
 *
 * Two different silent failures live in the list call. Ask for more than KV allows and it
 * does not clamp, it refuses the whole request with a 400, which surfaces as an unhandled
 * exception and a 1101 page. Ask for an allowed number and it answers that many and stops,
 * with `list_complete: false` as the only sign that the rest exists.
 *
 * A Map standing in for KV in a test does neither. It ignores the limit and returns
 * everything, so a read that asked for 2,000 rows passed fifteen guards and took the desk
 * down the first time a real namespace answered it.
 */
export async function keysUnder(ns: KVNamespace, prefix: string): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await ns.list({ prefix, limit: PAGE, cursor });
    for (const k of page.keys) names.push(k.name);
    if (page.list_complete) return names;
    cursor = (page as { cursor?: string }).cursor;
    if (!cursor) return names;
  }
}

/**
 * The values for those keys, read in parallel, in the order the names were given.
 *
 * The order matters: callers pair the result with the names they passed, and a read that
 * finished first is not a row that belongs first.
 */
export async function getMany(
  ns: KVNamespace, names: string[],
): Promise<(string | null)[]> {
  const out: (string | null)[] = new Array(names.length).fill(null);
  let next = 0;
  const reader = async (): Promise<void> => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= names.length) return;
      out[i] = await ns.get(names[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(FAN, names.length) }, () => reader()));
  return out;
}

/** Every value under a prefix, read to the end and in parallel. The common case. */
export async function readUnder(
  ns: KVNamespace, prefix: string,
): Promise<{ name: string; raw: string }[]> {
  const names = await keysUnder(ns, prefix);
  const raws = await getMany(ns, names);
  const out: { name: string; raw: string }[] = [];
  for (let i = 0; i < names.length; i += 1) {
    const raw = raws[i];
    if (raw !== null) out.push({ name: names[i], raw });
  }
  return out;
}
