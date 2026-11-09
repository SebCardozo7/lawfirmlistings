/**
 * The thing that writes a letter: a text box on the left, and on the right the email as the
 * firm will actually receive it.
 *
 * The desk used to show a textarea and nothing else, which meant the only person who never saw
 * the email was the person sending it. Every outbound message here goes out as
 * multipart/alternative, and the part almost every client displays is the HTML one, built by
 * worker/emailhtml.ts from this same text. Approving the plain-text half and shipping the HTML
 * half unseen is approving the wrong document.
 *
 * So the preview is not a mock-up of the email. It is htmlFromText() called on the exact
 * string in the textarea, dropped into a sandboxed iframe. If the renderer turns a line into a
 * heading the author did not want, it is visible here before anybody gets it, which is how the
 * uppercase-heading bug was found at all.
 *
 * Branded or sober is a send option and not a view option, for the same reason. The sober
 * version is what first contact goes out as, and a toggle that changed only the preview would
 * be a toggle that makes the preview wrong. What is on screen is what is posted.
 *
 * It works with scripting switched off. Every control is a submit button on the one form, so
 * the round trip carries the edited draft back and renders it. The script at the bottom is an
 * enhancement that does the same round trip without the page jumping, and nothing depends on
 * it running.
 */
import { htmlFromText } from './emailhtml';
import { esc, hidden } from './deskui';

export interface ComposeState {
  view: 'html' | 'text';
  /** Letter rather than campaign: no gradient, no logo, no button. The default. */
  restrained: boolean;
}

/**
 * The view state, read from wherever it came from.
 *
 * Restrained is the default, and the only thing that turns it off is an explicit "branded",
 * because a parameter that went missing must not quietly switch a first contact into something
 * that looks like an advertisement.
 */
export function readCompose(src: URLSearchParams | FormData): ComposeState {
  const get = (k: string): string => String(src.get(k) ?? '');
  // The segmented controls post as their own named buttons, so one click says both what the
  // reader wants to change and that nothing is to be sent.
  const view = src.get('to_text') ? 'text'
    : src.get('to_html') ? 'html'
    : get('view') === 'text' ? 'text' : 'html';
  const restrained = src.get('to_brand') ? false
    : src.get('to_sober') ? true
    : get('brand') !== '1';
  return { view, restrained };
}

/** True when this POST only wants to see the letter again, having changed nothing. */
export const isPreview = (form: FormData): boolean =>
  Boolean(form.get('to_text') || form.get('to_html')
    || form.get('to_brand') || form.get('to_sober') || form.get('to_refresh'));

/** The rendered email, for the iframe or for the fragment endpoint. */
export const previewHtml = (text: string, state: ComposeState): string =>
  htmlFromText(text, {
    footer: 'Law Firm Listings measures what US law firms publish about themselves and'
      + ' scores it against public records.',
    restrained: state.restrained,
  });

const seg = (name: string, label: string, on: boolean): string =>
  `<button name="${esc(name)}" value="1"${on ? ' class="on"' : ''}>${esc(label)}</button>`;

export function composer(opts: {
  token: string;
  /** Where the form posts. Each view owns its own URL, so the back button behaves. */
  action: string;
  /** id, slug, tpl: whatever the handler needs to know which letter this is. */
  extra: Record<string, string>;
  to: string;
  subject: string;
  text: string;
  state: ComposeState;
  /** Said under the send button. The one place to warn about what sending means. */
  foot?: string;
}): string {
  const { state } = opts;
  const screen = state.view === 'html'
    // allow-same-origin, and nothing else. A bare `sandbox` gives the frame an opaque origin,
    // and the browser then does not even request the logo: the preview showed a broken image
    // for a letter whose logo was fine in the recipient's inbox, which is the worst kind of
    // wrong, because it makes you doubt the thing that works.
    //
    // What the sandbox is for is scripts, and allow-scripts is still absent, so none run. The
    // dangerous pairing is allow-same-origin together with allow-scripts, because then the
    // frame can reach up and take its own sandbox off. check_desk asserts it never appears.
    ? '<div class="screen"><iframe title="The email as it will arrive" sandbox="allow-same-origin" '
      + `srcdoc="${esc(previewHtml(opts.text, state))}"></iframe></div>`
    : `<div class="screen"><pre class="plain">${esc(opts.text)}</pre></div>`;

  return `<form method="post" action="${esc(opts.action)}" class="compose">`
    + hidden(opts.token, {
      ...opts.extra,
      view: state.view,
      brand: state.restrained ? '0' : '1',
    })
    + '<div class="composer"><div>'
    + `<input class="field" name="subject" value="${esc(opts.subject)}" `
    + 'aria-label="Subject">'
    + `<textarea class="body" name="body" aria-label="The letter">${esc(opts.text)}</textarea>`
    + '<p class="meta">What is in this box is what gets sent. The preview is the same text '
    + 'through the same renderer, not an impression of it.</p>'
    + '</div><div>'
    + '<div class="row" style="margin-bottom:8px;justify-content:space-between">'
    + '<div class="segs">'
    + seg('to_html', 'Rendered', state.view === 'html')
    + seg('to_text', 'Plain text', state.view === 'text')
    + '</div><div class="segs">'
    + seg('to_sober', 'Sober', state.restrained)
    + seg('to_brand', 'Branded', !state.restrained)
    + '</div></div>'
    + screen
    + '<div class="row" style="margin-top:10px">'
    + `<button class="send" name="action" value="send">Send to ${esc(opts.to)}</button>`
    + '<button name="to_refresh" value="1">Refresh preview</button>'
    + '</div>'
    + `<p class="meta">${esc(opts.foot ?? 'Both halves go out. This is the half almost every '
      + 'client shows.')}</p>`
    + '</div></div></form>'
    + LIVE;
}

/**
 * Live preview, as an enhancement and nothing more.
 *
 * It posts the draft to the same handler with to_refresh set and asks for the fragment, which
 * is the rendered email on its own. The same code path the full round trip uses, so the two
 * cannot disagree about what the letter looks like.
 *
 * It never sends. The only button it is wired to is the textarea, and the request it makes
 * carries to_refresh, which the handler checks before it looks at anything else.
 */
const LIVE = '<script>(function(){'
  + 'var f=document.querySelector("form.compose");if(!f)return;'
  + 'var a=f.querySelector("textarea[name=body]"),i=f.querySelector("iframe");'
  + 'if(!a||!i)return;'
  // getAttribute, not f.action. A form exposes its own named controls as properties, and this
  // one has a button called "action", so f.action is that button and posting to it gives
  // /api/leads/prospect/[object HTMLButtonElement]. It 404s silently and the preview simply
  // stops following the text, which is the kind of broken that gets shipped.
  + 'var url=f.getAttribute("action");var t;'
  + 'a.addEventListener("input",function(){clearTimeout(t);t=setTimeout(function(){'
  + 'var d=new FormData(f);d.set("to_refresh","1");d.set("fragment","1");'
  + 'fetch(url,{method:"POST",body:d,credentials:"omit"})'
  + '.then(function(r){return r.ok?r.text():null})'
  + '.then(function(h){if(h!==null)i.srcdoc=h});},260);});})();</script>';
