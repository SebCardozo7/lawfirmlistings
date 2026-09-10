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
};
