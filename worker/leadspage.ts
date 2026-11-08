/**
 * The owner's view of the ledger: every enquiry, what became of it, and the two numbers.
 *
 * Deliberately not part of /claim/. That is the firm panel, its accounts are one per law firm,
 * and a firm signing in there must never be one URL away from a list of other firms' enquiries.
 * This is a separate address behind a token, minted by scripts/leads_link.mjs.
 *
 * The token is a random value held in KV rather than something signed, for the same reason the
 * panel credentials are: PANEL_SECRET is a Worker secret and cannot be read back, so a script
 * on a laptop cannot sign anything with it, while it can write a key through wrangler exactly
 * as panel_account.mjs already does. Revoking is then a delete rather than a wait for an expiry.
 *
 * It is a bearer credential all the same: whoever holds the link sees the list, which carries
 * firm names and the addresses they wrote from. So the page is noindex, Cache-Control:
 * no-store, under the /api/ prefix robots.txt already disallows, and the comparison is
 * constant time.
 */
import { sameBytes } from './auth';
import { listLeads, type Lead, type LeadStatus } from './ledger';

export interface LeadsEnv {
  FOLLOWUPS?: KVNamespace;
  PANEL?: KVNamespace;
}

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const NOT_FOUND = '<h1>Not found</h1><p class="sub">That link is not valid.</p>';
const DAY = 24 * 60 * 60 * 1000;
const since = (iso?: string): number =>
  iso ? Math.floor((Date.now() - Date.parse(iso)) / DAY) : -1;

const LABEL: Record<LeadStatus, string> = {
  arrived: 'Arrived', quoted: 'Quoted', chased: 'Chased', closed: 'Closed',
};

function shell(title: string, body: string, status = 200): Response {
  return new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow">'
    + `<title>${esc(title)}</title>`
    + '<style>'
    + ':root{--ink:#0A0A0C;--soft:#3B3C43;--muted:#6F7079;--line:#E7E7E2;--ground:#F6F6F3}'
    + 'body{font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--ground);'
    + 'color:var(--ink);margin:0;padding:28px 18px}main{max-width:1000px;margin:0 auto}'
    + 'h1{font-size:1.3rem;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 22px}'
    + '.row{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 22px}'
    + '.stat{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 16px;min-width:116px}'
    + '.stat b{display:block;font-size:1.5rem;line-height:1.1}'
    + '.stat span{color:var(--muted);font-size:.82rem}'
    + 'table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);'
    + 'border-radius:12px;overflow:hidden}'
    + 'th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}'
    + 'th{font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);'
    + 'background:#FBFBF9}tr:last-child td{border-bottom:0}'
    + 'td.firm{font-weight:600;max-width:24ch}td small{display:block;color:var(--muted);font-weight:400}'
    + '.tag{display:inline-block;font-size:.76rem;padding:2px 9px;border-radius:999px;border:1px solid var(--line)}'
    + '.closed{background:#E8F6EF;border-color:#BFE6D4}.chased{background:#FDF1DC;border-color:#F0DCB0}'
    + '.empty{background:#fff;border:1px solid var(--line);border-radius:12px;padding:28px;color:var(--muted)}'
    + '</style>'
    + `<main>${body}</main>`,
    {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    },
  );
}

export async function handleLeads(request: Request, env: LeadsEnv, url: URL): Promise<Response> {
  if (!env.PANEL) {
    return shell('Not configured', '<h1>Not configured</h1>'
      + '<p class="sub">The PANEL namespace is not bound, so this page cannot check a token.</p>', 503);
  }
  const stored = await env.PANEL.get('access:leads');
  const given = url.searchParams.get('t') ?? '';
  // 404 rather than 401 on every failure, including the one where no token has been minted at
  // all: an address that answers differently when it is unconfigured is an address that tells
  // a stranger it exists.
  if (!stored || !given) return shell('Not found', NOT_FOUND, 404);
  let want = '';
  try {
    want = (JSON.parse(stored) as { token?: string }).token ?? '';
  } catch {
    return shell('Not found', NOT_FOUND, 404);
  }
  const enc2 = new TextEncoder();
  if (!want || want.length !== given.length
      || !sameBytes(enc2.encode(want), enc2.encode(given))) {
    return shell('Not found', NOT_FOUND, 404);
  }

  const leads = await listLeads(env, 400);
  const count = (s: LeadStatus) => leads.filter(l => l.status === s).length;
  const closed = count('closed');
  const last30 = leads.filter(l => since(l.arrived_at) >= 0 && since(l.arrived_at) <= 30).length;
  const rate = leads.length ? Math.round((closed / leads.length) * 100) : 0;

  const stats = [
    [String(leads.length), 'enquiries, all time'],
    [String(last30), 'in the last 30 days'],
    [String(closed), 'closed as paid or handled'],
    [`${rate}%`, 'of all enquiries closed'],
  ].map(([n, label]) => `<div class="stat"><b>${esc(n)}</b><span>${esc(label)}</span></div>`).join('');

  const rows = leads.map((l: Lead) => {
    const age = since(l.arrived_at);
    return '<tr>'
      + `<td class="firm">${esc(l.firm)}<small>${esc(l.contact)}</small></td>`
      + `<td><a href="mailto:${esc(l.email)}">${esc(l.email)}</a>`
      + `${l.website ? `<small>${esc(l.website)}</small>` : ''}</td>`
      + `<td>${esc(l.city ?? '')}<small>${esc(l.practice ?? '')}</small></td>`
      + `<td>${esc(l.request ?? '')}</td>`
      + `<td><span class="tag ${l.status}">${esc(LABEL[l.status] ?? l.status)}</span>`
      + `${l.closed_as ? `<small>${esc(l.closed_as)}</small>` : ''}`
      + `${l.note ? `<small>${esc(l.note)}</small>` : ''}</td>`
      + `<td>${esc(l.arrived_at.slice(0, 10))}<small>${age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}</small></td>`
      + '</tr>';
  }).join('');

  const table = leads.length
    ? '<table><tr><th>Firm</th><th>Contact</th><th>Market</th><th>Asked for</th>'
      + '<th>Status</th><th>Arrived</th></tr>' + rows + '</table>'
    : '<div class="empty">No enquiries recorded yet. Rows appear here from the moment the next '
      + 'one arrives: anything that came in before this ledger existed was never written down.</div>';

  return shell('Leads', '<h1>Leads</h1>'
    + '<p class="sub">Every enquiry through the form, newest first. Closed means the link in '
    + 'your own notice was clicked.</p>'
    + `<div class="row">${stats}</div>${table}`);
}
