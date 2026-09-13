/**
 * Editorial notes for a city, kept apart from the page that renders them.
 *
 * /cities/new-york-ny/ was a hand-written page. Opening Baltimore meant either writing a second
 * one, or a dynamic route that renders the parts derived from data and treats the local knowledge
 * as optional. This is the optional part.
 *
 * Nothing here can be generated, which is exactly why it is a hand-written file: which court
 * hears what, what lawyers charge locally, how long somebody has to file. A city with no entry
 * gets a page without those sections rather than a page with invented ones. That is the whole
 * point of the file being optional.
 *
 * Everything else on a city page, the firm count, the practice areas, the offices, the ranked
 * list, comes off the collection and needs nothing here.
 */

export interface CityNotes {
  /** Replaces the generic lede when a city has something specific worth saying. */
  lede?: string;
  /** Neighbourhood or borough names the city is commonly divided into, for the chip row. */
  areas?: string[];
  /** Local knowledge, rendered as a prose section. Each entry is a heading and its paragraphs. */
  sections?: { heading: string; paragraphs: string[]; list?: string[] }[];
  faq?: { q: string; a: string }[];
}

export const CITY_NOTES: Record<string, CityNotes> = {
  'new-york-ny': {
    lede:
      'New York City is home to more than 80,000 practising attorneys, and to some of the most ' +
      'layered courts in the country. Browse by what you need and compare what each firm ' +
      'publishes.',
    areas: ['Manhattan', 'Brooklyn', 'Queens', 'The Bronx', 'Staten Island', 'Long Island',
            'Westchester'],
    sections: [
      {
        heading: 'Hiring a lawyer in New York City: what is different',
        paragraphs: [
          'New York’s court system is unusually layered. Most civil cases over $50,000 are ' +
          'heard in the Supreme Court of the county, so Manhattan is New York County and ' +
          'Brooklyn is Kings, while criminal matters move through Criminal Court before ' +
          'indictment and Supreme Court after. Federal cases fall in the Southern District, ' +
          'covering Manhattan, the Bronx and Westchester, or the Eastern District, covering ' +
          'Brooklyn, Queens, Staten Island and Long Island. A firm that appears regularly in ' +
          'your courthouse knows its judges, its clerks and its calendars, and that matters.',
        ],
      },
      {
        heading: 'What lawyers cost in New York City',
        paragraphs: [
          'Hourly rates for experienced attorneys in Manhattan run from roughly $450 for a solo ' +
          'practitioner to $1,200 or more at a large firm. Personal injury work is done on ' +
          'contingency, ordinarily a third of the recovery. Uncontested divorces are often ' +
          'flat-fee, and immigration matters are almost always flat-fee by petition type.',
        ],
      },
      {
        heading: 'Deadlines that catch New Yorkers out',
        paragraphs: [],
        list: [
          '<b>Personal injury:</b> three years from the accident, but only <b>90 days</b> to ' +
          'file a Notice of Claim against the City, the MTA or NYCHA.',
          '<b>Medical malpractice:</b> two years and six months from the malpractice, with a ' +
          'discovery rule for foreign objects and missed cancer diagnoses.',
          '<b>Wrongful termination and discrimination:</b> three years under the New York City ' +
          'Human Rights Law, and 300 days to file with the EEOC.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I check if a New York lawyer is licensed?',
        a: 'Search the New York State Unified Court System attorney registration database at ' +
           'iapps.courts.state.ny.us. It is free, and it shows registration status, the year ' +
           'admitted and any public discipline. We run the same check against the state’s ' +
           'open data, and every profile says how many of a firm’s attorneys it covers.',
      },
      {
        q: 'Should I hire a firm in my borough?',
        a: 'Not necessarily. Many Manhattan firms appear regularly in Brooklyn and Queens ' +
           'courts. What matters more is regular practice in the specific courthouse handling ' +
           'your case.',
      },
    ],
  },

  'baltimore-md': {
    lede:
      'Maryland is one of the last places in the country where being even slightly at fault can ' +
      'end a claim outright. Compare Baltimore firms on what they publish and on what we could ' +
      'check for ourselves.',
    areas: ['Downtown', 'Inner Harbor', 'Fells Point', 'Canton', 'Federal Hill', 'Mount Vernon',
            'Hampden', 'Towson'],
    sections: [
      {
        heading: 'Hiring a lawyer in Baltimore: what is different',
        paragraphs: [
          'Maryland still applies contributory negligence. In most of the country a share of the ' +
          'blame means a smaller recovery, but here a plaintiff who contributed to their own ' +
          'injury can recover nothing at all, however careless the other side was. The Court of ' +
          'Appeals reaffirmed it in <i>Coleman v. Soccer Association of Columbia</i> in 2013, ' +
          'leaving Maryland alongside Virginia, North Carolina, Alabama and the District of ' +
          'Columbia. It changes how cases are defended: showing that the injured person shared ' +
          'the blame is not a discount for the other side, it is a complete win, so expect that ' +
          'argument to be made and ask a firm how it handles it.',
          'Where a case is heard depends on what it is worth. The District Court of Maryland ' +
          'takes claims up to $30,000 and has that ground to itself below $5,000, while anything ' +
          'larger belongs in the Circuit Court for Baltimore City. Federal matters go to the ' +
          'United States District Court for the District of Maryland, which sits downtown. A ' +
          'firm that is in those buildings every week knows the judges and the calendars, and ' +
          'that is worth more than an address near the harbour.',
        ],
      },
      {
        heading: 'What lawyers cost in Baltimore',
        paragraphs: [
          'Personal injury work is done on contingency, ordinarily around a third of what is ' +
          'recovered, with nothing owed if the case is lost. Medical malpractice is the ' +
          'expensive exception: a claim has to go through the Health Care Alternative Dispute ' +
          'Resolution Office first and needs a certificate from a qualified expert, which is ' +
          'real cost before anything is filed. Maryland also caps damages for pain and ' +
          'suffering, and the cap rises by a set amount every year, so the year a claim arose ' +
          'changes what that part of it can be worth.',
          'Few firms publish hourly rates for anything else. Where a firm does publish its fee ' +
          'terms we record them on its profile, and where it publishes nothing the profile says ' +
          'so rather than guessing.',
        ],
      },
      {
        heading: 'Deadlines that catch Marylanders out',
        paragraphs: [],
        list: [
          '<b>Personal injury:</b> three years from the date the claim accrues, under ' +
          'Courts and Judicial Proceedings § 5-101.',
          '<b>Claims against Baltimore City or any local government:</b> written notice within ' +
          '<b>one year</b> of the injury, delivered in person or by certified mail, stating the ' +
          'time, place and cause. Nobody is obliged to remind you, and missing it ordinarily ' +
          'ends the claim.',
          '<b>Medical malpractice:</b> the earlier of five years from the injury or three years ' +
          'from the day it was discovered, under § 5-109.',
          '<b>Assault, libel and slander:</b> one year, not three.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I check if a Maryland lawyer is licensed?',
        a: 'Search the Maryland Judiciary attorney listing at ' +
           '<a href="https://www.mdcourts.gov/attysearch" rel="nofollow noopener" ' +
           'target="_blank">mdcourts.gov/attysearch</a>. It is free, it covers everyone admitted ' +
           'in the state, and a status of active means the lawyer is in good standing. Maryland ' +
           'asks automated tools to stay out of that register, so we honour that and run no ' +
           'licence check of our own here. A Maryland profile therefore carries no licence ' +
           'finding at all rather than one we did not actually make. New York publishes the same ' +
           'information as open data, which is why New York profiles do carry it.',
      },
      {
        q: 'I was partly at fault. Is it worth calling a lawyer?',
        a: 'It is worth calling sooner rather than later, precisely because Maryland is strict ' +
           'about it. Whether someone was at fault is a question about the evidence, not a ' +
           'question you should settle for yourself in a phone call with an insurer. Nothing on ' +
           'this page is legal advice, and how the rule applies to a particular accident is what ' +
           'a first consultation is for.',
      },
      {
        q: 'Should I hire a firm based in Baltimore itself?',
        a: 'Not necessarily. Plenty of firms along the Washington corridor appear in Baltimore ' +
           'courts regularly, and several of the firms listed here run offices in both. What ' +
           'matters more is regular practice in the court that will hear your case.',
      },
    ],
  },
};
