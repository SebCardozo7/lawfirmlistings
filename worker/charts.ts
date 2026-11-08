/**
 * The charts on the desk, drawn as SVG on the server.
 *
 * No library and no client-side rendering, for three reasons that all point the same way. The
 * page is a Worker response behind a bearer token, so every kilobyte of JavaScript is a
 * kilobyte that has to be fetched before the desk is useful. The data is already in the Worker
 * when the HTML is written, so sending it twice, once as numbers and once as a script that
 * turns numbers into bars, is work done for nothing. And an SVG the server wrote is a chart
 * that still exists in a saved page, a screenshot and a printout.
 *
 * Every chart here prints its numbers as text on the bars. Colour carries the grouping and
 * nothing else, so the chart reads the same to somebody who cannot tell the greens from the
 * oranges, and a reader never has to measure a bar against an axis to find out what it says.
 *
 * The one rule worth stating is the refusal. A chart drawn from two points is not a smaller
 * chart, it is a picture that implies a trend nobody measured, and this desk spent its first
 * year with six leads in it. Below the minimum, every function here returns the sentence
 * instead: the count, in words, and what it would take to make the chart worth drawing.
 */

export type Tone = 'one' | 'two' | 'three' | 'good' | 'warn' | 'dead' | 'quiet';

export interface Slice {
  label: string;
  value: number;
  tone?: Tone;
  /** Shown under the value when there is room. Never load-bearing. */
  note?: string;
}

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/**
 * The fills, as custom properties rather than literals, so the dark theme is one block of CSS
 * in the stylesheet rather than a second copy of this table.
 */
const FILL: Record<Tone, string> = {
  one: 'var(--c-one)',
  two: 'var(--c-two)',
  three: 'var(--c-three)',
  good: 'var(--c-good)',
  warn: 'var(--c-warn)',
  dead: 'var(--c-dead)',
  quiet: 'var(--c-quiet)',
};

const fill = (t?: Tone): string => FILL[t ?? 'one'];

const num = (n: number): string =>
  Number.isInteger(n) ? n.toLocaleString('en-US') : String(Math.round(n * 10) / 10);

/** The card every chart sits in, so a refusal and a chart are the same shape on the page. */
export function figure(title: string, note: string, inner: string): string {
  return '<figure class="chart">'
    + `<figcaption><b>${esc(title)}</b>${note ? `<span>${esc(note)}</span>` : ''}</figcaption>`
    + inner
    + '</figure>';
}

/**
 * What a chart says when there is not enough to draw.
 *
 * Not an empty frame and not a chart with two bars in it. The sentence states the count and
 * what the chart is waiting for, which is the honest version of the same information and is
 * also the only version that is true today.
 */
export function tooFew(title: string, have: number, need: number, what: string): string {
  return figure(title, '', '<p class="thin">'
    + `${have === 0 ? 'Nothing' : esc(num(have))} ${esc(what)} so far. `
    + `This chart starts drawing at ${need}.</p>`);
}

const svg = (w: number, h: number, title: string, body: string): string =>
  `<svg viewBox="0 0 ${w} ${h}" role="img" style="width:100%;height:auto;display:block">`
  + `<title>${esc(title)}</title>${body}</svg>`;

/**
 * Vertical bars over a time axis: a count per month, per day, per anything ordered.
 *
 * Every bar is labelled with its own number above it. A zero month draws a one-pixel stub on
 * the baseline rather than nothing, because a gap in a row of bars reads as missing data and a
 * flat line reads as a month in which nobody wrote.
 */
export function columns(opts: {
  title: string; note?: string; data: Slice[]; min?: number; unit?: string;
}): string {
  const { title, data } = opts;
  const min = opts.min ?? 3;
  if (data.length < min) return tooFew(title, data.length, min, opts.unit ?? 'points');

  const W = 620;
  const H = 180;
  const TOP = 24;
  const BASE = 142;
  const peak = Math.max(1, ...data.map(d => d.value));
  const slot = W / data.length;
  const bw = Math.max(5, Math.min(44, slot * 0.58));

  const body = data.map((d, i) => {
    const x = slot * i + (slot - bw) / 2;
    const tall = Math.round(((BASE - TOP) * d.value) / peak);
    const y = BASE - Math.max(d.value > 0 ? 2 : 1, tall);
    const mid = slot * i + slot / 2;
    return `<rect x="${x.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" `
      + `height="${(BASE - y).toFixed(1)}" rx="3" fill="${fill(d.tone)}"`
      + `${d.value === 0 ? ' opacity=".35"' : ''}></rect>`
      + `<text x="${mid.toFixed(1)}" y="${y - 6}" text-anchor="middle" class="v">`
      + `${esc(num(d.value))}</text>`
      + `<text x="${mid.toFixed(1)}" y="${BASE + 18}" text-anchor="middle" class="k">`
      + `${esc(d.label)}</text>`;
  }).join('');

  const axis = `<line x1="0" y1="${BASE}" x2="${W}" y2="${BASE}" class="axis"></line>`;
  return figure(title, opts.note ?? '', svg(W, H, title, axis + body));
}

/**
 * Horizontal bars with a name on each one: a value per lead, per firm, per bucket.
 *
 * Used where the label is a name rather than a date, because a name does not fit under a
 * vertical bar and a chart whose labels are turned on their side is a chart nobody reads.
 *
 * `mark` draws one vertical line across the chart, for a threshold the bars are being judged
 * against. The line is labelled; an unlabelled rule on a chart is decoration.
 */
export function rows(opts: {
  title: string; note?: string; data: Slice[]; min?: number; unit?: string;
  mark?: { at: number; label: string };
}): string {
  const { title, data } = opts;
  const min = opts.min ?? 3;
  if (data.length < min) return tooFew(title, data.length, min, opts.unit ?? 'points');

  const W = 620;
  const LEFT = 168;
  const ROW = 26;
  const PAD = opts.mark ? 22 : 8;
  const H = PAD + data.length * ROW + 6;
  const peak = Math.max(1, ...data.map(d => d.value), opts.mark?.at ?? 0);
  const span = W - LEFT - 46;

  const bars = data.map((d, i) => {
    const y = PAD + i * ROW;
    const wide = Math.max(d.value > 0 ? 2 : 0, Math.round((span * d.value) / peak));
    return `<text x="${LEFT - 10}" y="${y + 14}" text-anchor="end" class="k">`
      + `${esc(d.label)}</text>`
      + `<rect x="${LEFT}" y="${y + 3}" width="${wide}" height="14" rx="3" `
      + `fill="${fill(d.tone)}"></rect>`
      + `<text x="${LEFT + wide + 7}" y="${y + 14}" class="v">${esc(num(d.value))}`
      + `${d.note ? ` ${esc(d.note)}` : ''}</text>`;
  }).join('');

  let mark = '';
  if (opts.mark) {
    const x = LEFT + Math.round((span * opts.mark.at) / peak);
    mark = `<line x1="${x}" y1="${PAD - 6}" x2="${x}" y2="${H - 4}" class="mark"></line>`
      + `<text x="${x + 5}" y="${PAD - 10}" class="k">${esc(opts.mark.label)}</text>`;
  }

  return figure(title, opts.note ?? '', svg(W, H, title, mark + bars));
}

/**
 * One bar, divided: how a population splits across states that add up to the whole.
 *
 * A bar rather than a pie because the parts here are usually one big one and four small ones,
 * and five slices of a circle at four per cent each are five slivers nobody can compare. The
 * legend carries the counts, so a part too narrow to label is still readable.
 */
export function stacked(opts: {
  title: string; note?: string; parts: Slice[]; min?: number; unit?: string;
}): string {
  const { title } = opts;
  const parts = opts.parts.filter(p => p.value > 0);
  const total = parts.reduce((n, p) => n + p.value, 0);
  const min = opts.min ?? 1;
  if (total < min) return tooFew(title, total, min, opts.unit ?? 'rows');

  const W = 620;
  const H = 34;
  let x = 0;
  const bar = parts.map((p, i) => {
    const wide = i === parts.length - 1 ? W - x : Math.round((W * p.value) / total);
    const at = x;
    x += wide;
    const label = wide > 44
      ? `<text x="${at + wide / 2}" y="22" text-anchor="middle" class="on">`
        + `${esc(num(p.value))}</text>`
      : '';
    return `<rect x="${at}" y="0" width="${wide}" height="${H}" fill="${fill(p.tone)}"></rect>`
      + label;
  }).join('');

  const legend = '<ul class="legend">' + parts.map(p =>
    `<li><i style="background:${fill(p.tone)}"></i>${esc(p.label)} `
    + `<b>${esc(num(p.value))}</b>`
    + `<span>${Math.round((p.value / total) * 100)}%</span></li>`).join('') + '</ul>';

  return figure(title, opts.note ?? '',
    `<div class="clip">${svg(W, H, title, bar)}</div>${legend}`);
}

/**
 * The CSS the charts need, kept beside them rather than in the page's stylesheet.
 *
 * A chart whose colours live in another file is a chart that loses them the day somebody
 * tidies that file, and these five fills are not general-purpose UI colour: they exist to be
 * told apart from each other.
 */
export const CHART_CSS =
  ':root{--c-one:#3B82F6;--c-two:#8B5CF6;--c-three:#5EEAD4;--c-good:#1C6B4A;'
  + '--c-warn:#B4541B;--c-dead:#B8A9A9;--c-quiet:#CFCFC8}'
  + '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){'
  + '--c-one:#60A5FA;--c-two:#A78BFA;--c-three:#5EEAD4;--c-good:#6FD3A8;'
  + '--c-warn:#E8A569;--c-dead:#6B5F5F;--c-quiet:#3A3A41}}'
  + '.chart{background:var(--panel);border:1px solid var(--line);border-radius:12px;'
  + 'padding:14px 16px 12px;margin:0}'
  + '.chart figcaption{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin:0 0 10px}'
  + '.chart figcaption b{font-size:13px;letter-spacing:-.005em}'
  + '.chart figcaption span{color:var(--muted);font-size:12px}'
  + '.chart .thin{color:var(--muted);font-size:13px;margin:4px 0 6px}'
  + '.chart .clip{border-radius:6px;overflow:hidden}'
  // Twelve and a half rather than ten and a half. The SVG is drawn at 620 wide and scaled to
  // whatever the column is, so every point of type here is multiplied by that ratio: at four
  // charts across a laptop the labels came out at five pixels and could not be read at all.
  + '.chart text{font:500 12.5px/1 var(--ui);font-variant-numeric:tabular-nums}'
  + '.chart text.k{fill:var(--muted);font-weight:400}'
  + '.chart text.v{fill:var(--ink)}'
  + '.chart text.on{fill:#fff;font-weight:600}'
  + '.chart .axis{stroke:var(--line);stroke-width:1}'
  + '.chart .mark{stroke:var(--warn);stroke-width:1;stroke-dasharray:3 3}'
  + '.legend{list-style:none;display:flex;flex-wrap:wrap;gap:4px 16px;margin:12px 0 0;padding:0;'
  + 'font-size:12px;color:var(--muted)}'
  + '.legend li{display:flex;align-items:center;gap:6px}'
  + '.legend i{width:9px;height:9px;border-radius:2px;display:block}'
  + '.legend b{color:var(--ink);font-variant-numeric:tabular-nums}'
  // Two across a laptop, one on anything narrower. Three fitted and were unreadable: a chart
  // whose axis labels have to be guessed at is a decoration with numbers on it.
  + '.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(430px,1fr));gap:12px;'
  + 'margin:0 0 18px}'
  + '.charts .wide{grid-column:1/-1}';
