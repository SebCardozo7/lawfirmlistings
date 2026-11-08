/**
 * The chrome every page of the desk is drawn in: the frame, the sidebar and the stylesheet.
 *
 * Three views share it now, which is the reason it exists. The overview, the leads and the
 * prospects are the same application and have to look like it: the moment the prospecting
 * view carried its own copy of the table styling, the two tables drifted within a day.
 *
 * Everything here is one server-rendered document with no stylesheet request and no script.
 * The desk is behind a bearer token over a Worker, so a second round trip before the page is
 * readable is a second round trip for every click, and the whole stylesheet is smaller than
 * the HTTP overhead of asking for it separately.
 *
 * The colours are the site's own tokens, the same ones worker/emailhtml.ts sends out, because
 * the desk renders the letters it writes. A preview drawn in different greys from the email it
 * previews is a preview that lies about what the firm will see.
 */
import { CHART_CSS } from './charts';

export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export const DAY = 24 * 60 * 60 * 1000;

export const since = (iso?: string): number =>
  iso ? Math.floor((Date.now() - Date.parse(iso)) / DAY) : -1;

export const ago = (n: number): string =>
  n < 0 ? 'unknown' : n === 0 ? 'today' : `${n} day${n === 1 ? '' : 's'} ago`;

export const today = (): string => new Date().toISOString().slice(0, 10);

/** Where each view lives. One table, so a renamed route cannot half-move. */
export const ROUTE = {
  overview: '/api/leads',
  leads: '/api/leads/list',
  lead: (id: string) => `/api/leads/lead/${encodeURIComponent(id)}`,
  prospects: '/api/leads/prospects',
  prospect: (slug: string) => `/api/leads/prospect/${encodeURIComponent(slug)}`,
};

/** A link inside the desk, with the token carried along because every page needs it. */
export const link = (path: string, token: string, query: Record<string, string> = {}): string => {
  const q = new URLSearchParams({ t: token, ...query });
  return `${path}?${q.toString()}`;
};

export interface Nav {
  /** Which entry is the current page. */
  here: 'overview' | 'leads' | 'prospects';
  token: string;
  /** Small counts beside the entries, so the sidebar says what is waiting. */
  open?: number;
  waiting?: number;
}

const ITEMS: { key: Nav['here']; label: string; path: string; hint: string }[] = [
  { key: 'overview', label: 'Overview', path: ROUTE.overview, hint: 'The numbers' },
  { key: 'leads', label: 'Leads', path: ROUTE.leads, hint: 'Firms that wrote to us' },
  { key: 'prospects', label: 'Prospecting', path: ROUTE.prospects, hint: 'Firms we publish' },
];

function sidebar(nav: Nav): string {
  const count = (k: Nav['here']): number | undefined =>
    k === 'leads' ? nav.open : k === 'prospects' ? nav.waiting : undefined;

  return '<nav class="rail"><div class="brand">'
    + '<span class="mark"></span><b>Law Firm Listings</b><span>The desk</span></div>'
    + '<ul>' + ITEMS.map(i => {
      const n = count(i.key);
      return `<li><a href="${esc(link(i.path, nav.token))}"`
        + `${i.key === nav.here ? ' aria-current="page"' : ''}>`
        + `<span>${esc(i.label)}</span>`
        + `${n === undefined ? '' : `<em>${esc(String(n))}</em>`}`
        + `<small>${esc(i.hint)}</small></a></li>`;
    }).join('') + '</ul>'
    + '<p class="rail-foot">Everything on these pages is private. Nothing here is indexed, '
    + 'cached or linked from the site.</p></nav>';
}

const BASE =
  ':root{--ink:#0A0A0C;--body:#3B3C43;--muted:#6F7079;--line:#E7E7E2;--ground:#F6F6F3;'
  + '--panel:#FFFFFF;--raise:#FBFBF9;--link:#15306B;--good:#1C6B4A;--good-bg:#E8F6EF;'
  + '--good-line:#BFE6D4;--warn:#B4541B;--warn-bg:#FFF8EC;--warn-line:#F0DCB0;'
  + '--cool-bg:#EAF1FB;--cool-line:#CBDCF4;--dead-bg:#F4EFEF;--dead-line:#E0D2D2;'
  + "--ui:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
  + "--mono:ui-monospace,SFMono-Regular,'SF Mono',Consolas,monospace;color-scheme:light}"
  + '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){'
  + '--ink:#F4F4F2;--body:#C9C9C4;--muted:#8E8E88;--line:#2B2B30;--ground:#141418;'
  + '--panel:#1C1C21;--raise:#232329;--link:#A8C0F0;--good:#6FD3A8;--good-bg:#16302A;'
  + '--good-line:#26503F;--warn:#E8A569;--warn-bg:#33281A;--warn-line:#574227;'
  + '--cool-bg:#1B2740;--cool-line:#2E4066;--dead-bg:#2E2626;--dead-line:#473838;'
  + 'color-scheme:dark}}'
  + '*{box-sizing:border-box}'
  + 'body{margin:0;background:var(--ground);color:var(--ink);font:400 14px/1.55 var(--ui)}'
  + '.desk{display:grid;grid-template-columns:216px minmax(0,1fr);min-height:100vh}'
  + '@media(max-width:860px){.desk{grid-template-columns:minmax(0,1fr)}}'

  // The rail.
  + '.rail{border-right:1px solid var(--line);background:var(--panel);padding:20px 14px;'
  + 'display:flex;flex-direction:column;gap:18px}'
  + '@media(max-width:860px){.rail{border-right:0;border-bottom:1px solid var(--line)}}'
  + '.brand{display:grid;grid-template-columns:auto 1fr;gap:2px 9px;align-items:center;'
  + 'padding:0 6px}'
  + '.brand .mark{grid-row:1/3;width:26px;height:26px;border-radius:7px;'
  + 'background:linear-gradient(135deg,#8B5CF6,#3B82F6 55%,#5EEAD4)}'
  + '.brand b{font-size:13px;letter-spacing:-.01em}'
  + '.brand span:last-child{color:var(--muted);font-size:11.5px}'
  + '.rail ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}'
  + '.rail a{display:grid;grid-template-columns:1fr auto;gap:0 8px;padding:8px 10px;'
  + 'border-radius:9px;text-decoration:none;color:var(--ink)}'
  + '.rail a:hover{background:var(--raise)}'
  + '.rail a[aria-current]{background:var(--ink);color:var(--ground)}'
  + '.rail a small{grid-column:1/2;color:var(--muted);font-size:11.5px}'
  + '.rail a[aria-current] small{color:var(--ground);opacity:.72}'
  // Column two and row one explicitly. Left to place itself, an item with a definite row is
  // positioned before its siblings and took column one, which put the count to the left of
  // the word it counts.
  + '.rail a em{grid-column:2;grid-row:1/3;align-self:center;font-style:normal;font-size:12px;'
  + 'font-variant-numeric:tabular-nums;background:var(--raise);border:1px solid var(--line);'
  + 'border-radius:99px;padding:1px 8px;color:var(--muted)}'
  + '.rail a[aria-current] em{background:transparent;border-color:currentColor;color:inherit}'
  + '.rail-foot{margin:auto 0 0;padding:0 6px;color:var(--muted);font-size:11.5px;line-height:1.5}'
  + '@media(max-width:860px){.rail-foot{display:none}}'

  // The page.
  + '.page{padding:26px 22px 64px;min-width:0;max-width:1400px}'
  + '.mast{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:0 0 3px}'
  + 'h1{font-size:19px;letter-spacing:-.01em;margin:0}'
  + 'h2{font-size:14px;letter-spacing:-.005em;margin:26px 0 10px}'
  + '.lede{color:var(--muted);margin:0 0 20px;font-size:13px;max-width:72ch}'
  + '.note{color:var(--muted);font-size:13px}'
  + 'a{color:var(--link)}'
  + '.back{display:inline-block;margin:0 0 12px;font-size:13px}'

  // Figures.
  + '.figures{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}'
  + '.fig{background:var(--panel);border:1px solid var(--line);border-radius:10px;'
  + 'padding:10px 14px;min-width:116px;flex:1 1 116px}'
  + '.fig b{display:block;font-size:21px;line-height:1.15;font-variant-numeric:tabular-nums}'
  + '.fig span{color:var(--muted);font-size:11.5px;display:block;margin-top:1px}'
  + '.fig.lit b{color:var(--good)}.fig.hot b{color:var(--warn)}'

  // Flags.
  + '.flag{background:var(--warn-bg);border:1px solid var(--warn-line);border-radius:10px;'
  + 'padding:10px 14px;margin:0 0 12px;color:var(--warn);font-size:13px}'
  + '.flag b{font-weight:600}.flag a{color:inherit}'
  + '.flag ul{margin:6px 0 0;padding-left:18px}'
  + '.good-flag{background:var(--good-bg);border-color:var(--good-line);color:var(--good)}'

  // Sheets and tables.
  + '.sheet{background:var(--panel);border:1px solid var(--line);border-radius:12px;'
  + 'overflow:hidden}'
  + '.scroll{overflow-x:auto}'
  + 'table{width:100%;border-collapse:collapse}'
  + 'th{text-align:left;font:600 10.5px/1.4 var(--ui);text-transform:uppercase;'
  + 'letter-spacing:.06em;color:var(--muted);background:var(--raise);padding:9px 14px;'
  + 'border-bottom:1px solid var(--line);white-space:nowrap}'
  + 'td{padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:top}'
  + 'tr:last-child td{border-bottom:0}'
  + 'tr.lead:hover td{background:var(--raise)}'
  + 'tr.lead.open td{background:var(--raise)}'
  + '.name{font-weight:600;color:var(--ink);text-decoration:none}'
  + '.name:hover{text-decoration:underline}'
  + '.sub{display:block;color:var(--muted);font-weight:400;font-size:12.5px;margin-top:1px}'
  + '.num{font-variant-numeric:tabular-nums;font-weight:600;font-size:15px}'
  + '.warnish{color:var(--warn)}'
  + '.caret{display:inline-block;width:11px;color:var(--muted);text-decoration:none}'

  // Pills.
  + '.pill{display:inline-block;font:500 11.5px/1.5 var(--ui);padding:1px 9px;border-radius:99px;'
  + 'border:1px solid var(--line);white-space:nowrap;background:var(--raise)}'
  + '.pill.won,.pill.replied{background:var(--good-bg);border-color:var(--good-line);color:var(--good)}'
  + '.pill.lost,.pill.bounced{background:var(--dead-bg);border-color:var(--dead-line)}'
  + '.pill.quoted,.pill.sent{background:var(--cool-bg);border-color:var(--cool-line)}'
  + '.pill.chased,.pill.unsubscribed{background:var(--warn-bg);border-color:var(--warn-line);'
  + 'color:var(--warn)}'
  + '.pill.client{background:var(--good-bg);border-color:var(--good-line);color:var(--good)}'

  // The unfolded row.
  + 'tr.panel>td{padding:0;background:var(--ground)}'
  + '.inside{display:grid;grid-template-columns:minmax(0,300px) minmax(0,1fr)}'
  + '@media(max-width:1000px){.inside{grid-template-columns:minmax(0,1fr)}}'
  + '.side{padding:16px 18px;border-right:1px solid var(--line);min-width:0}'
  + '@media(max-width:1000px){.side{border-right:0;border-bottom:1px solid var(--line)}}'
  // A container rather than the viewport. The composer is drawn both on a page of its own
  // and inside an unfolded table row, and those two have very different widths at the same
  // window size: a media query put the email preview in a 370px column and the 560px letter
  // scrolled sideways.
  + '.main{padding:16px 18px;min-width:0;container-type:inline-size}'
  + '.eyebrow{font:600 10.5px/1.4 var(--ui);text-transform:uppercase;letter-spacing:.06em;'
  + 'color:var(--muted);margin:0 0 8px}'
  + '.side .eyebrow:not(:first-child){margin-top:18px}'
  + 'dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:3px 12px;margin:0;font-size:13px}'
  + 'dt{color:var(--muted)}dd{margin:0;min-width:0;overflow-wrap:anywhere}'

  // The dossier block.
  + '.dossier{background:var(--panel);border:1px solid var(--line);border-radius:9px;'
  + 'padding:10px 12px;font-size:13px}'
  + '.dossier .top{display:flex;align-items:center;gap:8px;margin-bottom:4px}'
  + '.dossier .gap{color:var(--muted);font-size:12.5px}'
  + '.bar{height:5px;border-radius:99px;background:var(--line);overflow:hidden;margin:7px 0 5px}'
  + '.bar i{display:block;height:100%;background:var(--c-one);border-radius:99px}'
  + '.dossier.none{color:var(--warn)}'

  // History.
  + '.hist{list-style:none;margin:0;padding:0;font-size:12.5px}'
  + '.hist li{display:flex;gap:10px;padding:5px 0;border-bottom:1px solid var(--line)}'
  + '.hist li:last-child{border-bottom:0}'
  + '.hist time{color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}'
  + '.hist .by{color:var(--muted)}'

  // Controls.
  + '.row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}'
  + 'form{margin:0}'
  + 'button,select,input,textarea{font:inherit;color:inherit;background:var(--panel);'
  + 'border:1px solid var(--line);border-radius:8px;padding:6px 10px}'
  + 'button{cursor:pointer}button:hover{background:var(--raise)}'
  + 'button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,'
  + 'a:focus-visible{outline:2px solid var(--c-one);outline-offset:1px}'
  + 'button.on{background:var(--ink);color:var(--ground);border-color:var(--ink)}'
  + 'button.send{background:var(--good);color:#fff;border-color:var(--good);font-weight:600}'
  + 'button.send:hover{filter:brightness(1.08)}'
  + 'button[disabled]{opacity:.4;cursor:not-allowed}'
  + '.tpl{font-size:13px}'
  + '.field{display:block;width:100%;margin:0 0 6px}'
  + 'textarea.body{font:400 12.5px/1.6 var(--mono);min-height:330px;resize:vertical;width:100%}'
  + '.segs{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}'
  + '.segs button,.segs a{border:0;border-radius:0;padding:5px 11px;font-size:12.5px;'
  + 'background:var(--panel);text-decoration:none;color:var(--ink);display:inline-block}'
  + '.segs button+button,.segs a+a{border-left:1px solid var(--line)}'
  + '.segs .on{background:var(--ink);color:var(--ground)}'

  // The email preview.
  + '.composer{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}'
  + '.composer>div{min-width:0}'
  + '@container (max-width:820px){.composer{grid-template-columns:minmax(0,1fr)}}'
  + '.screen{border:1px solid var(--line);border-radius:9px;overflow:hidden;'
  + 'background:#F6F6F3;height:420px}'
  + '.screen iframe{width:100%;height:100%;border:0;display:block;background:#F6F6F3}'
  + 'pre.plain{margin:0;padding:14px;font:400 12.5px/1.6 var(--mono);white-space:pre-wrap;'
  + 'overflow:auto;height:100%;background:var(--panel);color:var(--body)}'
  + '.meta{color:var(--muted);font-size:12px;margin:6px 0 0}'
  + '.blocked{background:var(--warn-bg);border:1px solid var(--warn-line);color:var(--warn);'
  + 'border-radius:9px;padding:10px 12px;font-size:13px}'
  + '.said{background:var(--good-bg);border:1px solid var(--good-line);color:var(--good);'
  + 'border-radius:10px;padding:10px 14px;margin:0 0 14px;font-size:13px}'
  + '.empty{background:var(--panel);border:1px solid var(--line);border-radius:12px;'
  + 'padding:22px;color:var(--muted)}'
  + 'fieldset{border:1px solid var(--line);border-radius:10px;background:var(--panel);'
  + 'padding:12px 14px;margin:0 0 10px}'
  + 'legend{color:var(--muted);font-size:11.5px;padding:0 6px}';

export const CSS = BASE + CHART_CSS;

/**
 * The response. Every page of the desk goes out through here, so the four headers that keep
 * it out of search results and out of caches cannot be forgotten on one of them.
 */
export function shell(title: string, nav: Nav | null, body: string, status = 200): Response {
  const inner = nav
    ? `<div class="desk">${sidebar(nav)}<main class="page">${body}</main></div>`
    : `<main class="page">${body}</main>`;
  return new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow">'
    + `<title>${esc(title)}</title><style>${CSS}</style>${inner}`,
    {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
        'referrer-policy': 'no-referrer',
      },
    },
  );
}

export const NOT_FOUND = '<h1>Not found</h1><p class="lede">That link is not valid.</p>';

/** The hidden fields every POST on the desk carries, token first. */
export const hidden = (token: string, extra: Record<string, string> = {}): string =>
  `<input type="hidden" name="t" value="${esc(token)}">`
  + Object.entries(extra).map(([k, v]) =>
    `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');

/** One figure tile. */
export const fig = (value: string, label: string, tone?: 'lit' | 'hot'): string =>
  `<div class="fig${tone ? ` ${tone}` : ''}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
