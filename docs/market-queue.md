# Market queue

Firms we have verified and have not published, and firms we could not verify, with the reason
for each. It exists because a discovery run finds more firms than a publishing pass can measure,
and the ones left over are worth keeping rather than rediscovering: a firm with 2,652 reviews
that we could not read is a fact about our crawler, not about the firm, and the next person to
open this market should start from what is already known.

Review counts are summed across a firm's verified Google listings on the date given. They move.

## New York City, personal injury

A Places discovery run on 2026-09-16 returned 218 firms in this market, 185 of which the
SEO-derived cohort had never seen. The twenty-five largest by review count were crawled and
twenty-four were published; the rest are below.

### Verified, waiting for a publishing pass

Each of these publishes a personal-injury practice page or names the practice among its practice
areas, which is what G2 asks for. They were below the review-count line for this pass and need
the same eight-step crawl the published firms had.

| Firm | Domain | Reviews | Based in |
| --- | --- | --- | --- |
| Levy & Borukh, PLLC | levyborukhlaw.com | 256 | Ozone Park, Queens |
| Macaluso & Fafinski, P.C. | lawyers24-7.com | 229 | Fordham Plaza, Bronx |
| The Case Handler (Adam Handler) | thecasehandler.com | 220 | Broadway, Manhattan |
| Law Office of Evan W. Kohn | bronxlawfirm.net | 220 | White Plains Road, Bronx |
| Omrani & Taub, P.C. | omranitaub.com | 218 | Madison Avenue, Manhattan |
| Morelli Law Firm | morellilaw.com | 206 | Third Avenue, Manhattan |
| Law Offices of Eric Richman | richman-law.com | 205 | Lexington Avenue, Manhattan |
| De Caro & Kaplen, LLP | brainlaw.com | 202 | East 45th Street, Manhattan |
| Metro Injury Law | metrolawpllc.com | 201 | Metropolitan Avenue, Forest Hills |
| Sobo & Sobo L.L.P. | sobolaw.com | 201 | Gun Hill Road, Bronx |
| Stillman & Stillman PC | stillmanstillmanlaw.com | 200 | East Tremont Avenue, Bronx |
| Davidov & Cohen Law, PLLC | dcnyclaw.com | 169 | Union Turnpike, Fresh Meadows |
| Gitelman Legal Group | gitlegalgroup.com | 169 | Coney Island Avenue, Brooklyn |
| K L Sanchez Law Office, P.C. | accidentlawyer-queens.com | 167 | Jackson Heights, Queens |
| The Newman Firm, LLP | nyaccidentcase.com | 161 | Queens Boulevard, Rego Park |
| Law Office of Seni Popat, P.C. | splawpc.com | 1,226 | Queens |
| Law Office of Helene Mark | helenemarkesq.com | 300 | New York |

The last two were read only on the second attempt, after the practice check learned to accept a
combined practice-areas page. They belong at the top of the next pass: with 1,226 reviews, Seni
Popat's firm would enter this ranking third by review count.

### Verified listing, practice page not readable

These are real firms with large review counts whose practice evidence we could not read on
2026-09-16. G2 needs a page the firm publishes about the practice, or a page listing its
practices that names it. Where the reason is ours, it says so.

| Firm | Domain | Reviews | What happened |
| --- | --- | --- | --- |
| Ofshtein Law Firm, P.C. | olf.nyc | 2,652 | Its own home page links /practice-areas/personal-injury and that address returns 404 to a standards-compliant client. The largest review count in the market, unreadable through no fault of ours and no fault worth guessing at. |
| Mikhail Yadgarov & Associates, P.C. | myadgarovlaw.com | 1,611 | Links /personal-injury-attorney/, which also returns 404. Its practice-areas page names the practice and says nothing specific to it. |
| The Kasen Law Firm | kasenlawfirm.com | 1,388 | No page whose address names the practice, and no page listing its practice areas. |
| Gregory Spektor & Associates P.C. | spektorlaw.com | 945 | The site returns 403 to our crawler. We do not work around bot protection, so this firm gets a manual entry or none. |
| The New York Injury & Malpractice Law Firm | protectingpatientrights.com | 1,113 | No readable practice page. |
| KOLPLAW (Peter W. Kolp) | kolplaw.com | 605 | No readable practice page. |
| Abogados de accidentes Cantaso | abogadosde1800cantaso.com | 590 | No readable practice page. |
| Law Office of Yuriy Prakhin, P.C. | prakhinlaw.com | 347 | Has a page titled for the practice that says nothing specific to it, which is what the corroboration test is for. |
| GW Law Group | gwlawgroups.com | 344 | Page is not titled for the practice. |
| NY Injury Lawyers PLLC | nyinjurypllc.com | 325 | The site renders in the browser and serves an empty document to a crawler, so there is nothing to read. |
| Kalra Law Firm | unionlawyer.com | 289 | No readable practice page. |
| Caesar, Napoli & Spivak | libaolilaw.com | 287 | Its practice-areas page does not name this practice. |
| Krause & Glassmith, LLP | cn.krauseandglassmith.com | 198 | Page is not titled for the practice. This is the firm's Chinese-language subdomain. |
| Linden Law | linden.law | 187 | No readable practice page. |
| Law Office of Charles C. DeStefano | charlesdestefanolaw.com | 161 | No readable practice page. |

Two of these are in other practices and should not be forced into this one: Hansen & Rosasco
(911victimlawyer.com, 561 reviews) works on the September 11th Victim Compensation Fund, and
Helen F. Dalton & Associates (helendalton.com, 404 reviews) works on wage and hour claims.
Meirowitz & Wasserberg (samndan.com, 391 reviews) publishes as a medical malpractice and injury
firm and belongs in the first group rather than this one once its practice page can be read; it
is not the same firm as Finkelstein, Meirowitz & Eidlisz, which is already published here.

### Held for a person to read

- **Allen Law Group** (allen.law). Not published pending a human reading of *In the Matter of
  Kenneth J. Allen* (2002). A disciplinary matter is a statement about a named person and it is
  not published on the strength of a search result.
- **Brandon J. Broderick.** Not published pending a human reading of the suspension order that a
  register search returned.

## Other markets

- **The Ward Law Group, PL** (855dolor55.com). Found by the New York run, removed from the New
  York cohort on 2026-09-16: its own structured data gives Miami Lakes, Florida as the firm's
  address, and its Google listings hold 5,859 reviews there and 571 in Orlando against 439 on
  Fifth Avenue. It is the obvious first entry for a Miami market and is not comparable against
  firms whose whole practice is in New York.
