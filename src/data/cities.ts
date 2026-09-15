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

  'lakeland-fl': {
    lede:
      'Florida rewrote its injury law in 2023, and the deadline most people still quote is the ' +
      'old one. Compare Lakeland firms on what they publish and on what we could check for ' +
      'ourselves.',
    areas: ['Downtown Lakeland', 'Lake Morton', 'Dixieland', 'South Lakeland', 'Winter Haven',
            'Bartow', 'Auburndale', 'Plant City'],
    sections: [
      {
        heading: 'Hiring a lawyer in Lakeland: what is different',
        paragraphs: [
          'Two changes in March 2023 reshaped what an injury claim in Florida is worth and how ' +
          'long you have to bring it. House Bill 837 cut the deadline for a negligence action ' +
          'from four years to two, and it replaced pure comparative negligence with a modified ' +
          'version: a claimant found more than 50 per cent at fault now recovers nothing at all, ' +
          'where before they recovered what was left after their share. Medical negligence is ' +
          'the exception and keeps the old rule. If you were told four years by somebody ' +
          'remembering how this worked, they are remembering a law that changed.',
          'Lakeland cases are not heard in Lakeland. Polk County sits in the Tenth Judicial ' +
          'Circuit, whose courthouse is in Bartow, about fifteen miles south, alongside Hardee ' +
          'and Highlands counties. A firm that is in that building weekly knows its judges and ' +
          'its calendars, and an office on Florida Avenue is not the same thing as appearing in ' +
          'Bartow.',
        ],
      },
      {
        heading: 'The fourteen days that decide your medical bills',
        paragraphs: [
          'Florida is a no-fault state. Every driver carries $10,000 of Personal Injury ' +
          'Protection, and it pays 80 per cent of reasonable medical expenses, but only if you ' +
          'receive initial care <b>within fourteen days</b> of the crash. Miss that window and ' +
          'the coverage you paid for pays nothing toward treatment, whoever caused the ' +
          'collision. It is the single most expensive deadline in Florida injury law and it is ' +
          'the one nobody is told about at the scene.',
          'Stepping outside no-fault to claim pain and suffering needs more than bills. Section ' +
          '627.737 allows it only where there is significant and permanent loss of an important ' +
          'bodily function, permanent injury within a reasonable degree of medical probability, ' +
          'significant and permanent scarring or disfigurement, or death. That threshold, rather ' +
          'than the severity of the crash, is usually what decides whether a claim is worth ' +
          'bringing.',
        ],
      },
      {
        heading: 'Deadlines that catch Floridians out',
        paragraphs: [],
        list: [
          '<b>Personal injury:</b> two years from the accident, under Florida Statutes ' +
          '§ 95.11(5)(a). It was four years until March 2023.',
          '<b>Wrongful death:</b> two years, under § 95.11(5)(e).',
          '<b>PIP medical care:</b> fourteen days from the crash to receive initial treatment, ' +
          'or the $10,000 pays nothing toward it.',
          '<b>Professional malpractice other than medical:</b> two years from the day it was ' +
          'discovered or should have been.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I check if a Florida lawyer is licensed?',
        a: 'The Florida Bar publishes a member directory at ' +
           '<a href="https://www.floridabar.org/directories/find-mbr/" rel="nofollow noopener" ' +
           'target="_blank">floridabar.org</a>, free to search, showing admission date and any ' +
           'public discipline. We do not read it: it refuses our requests, so Florida profiles ' +
           'carry no licence finding rather than one we did not make. What we do check is ' +
           'discipline, from the Supreme Court of Florida\'s own published decisions, and every ' +
           'profile says which of the two it is showing you.',
      },
      {
        q: 'The other driver was mostly at fault. Does my share still matter?',
        a: 'Since March 2023 it can end the claim entirely. Above 50 per cent at fault you ' +
           'recover nothing, and below it your damages are reduced by your share. That makes how ' +
           'fault is apportioned the argument worth having early, which is a reason not to give ' +
           'a recorded statement to an insurer before speaking to someone. Nothing here is legal ' +
           'advice and how the rule applies to a particular crash is what a first consultation ' +
           'is for.',
      },
      {
        q: 'Should I hire a firm in Lakeland itself?',
        a: 'Local matters here more than in a big metro, because the venue is a single ' +
           'courthouse in Bartow rather than a choice of them. Several firms listed here run ' +
           'offices across Polk County and into Tampa. What counts is regular practice in the ' +
           'Tenth Circuit.',
      },
    ],
  },

  'buffalo-ny': {
    lede:
      'Buffalo is the second market this directory covers in New York, and the state register ' +
      'that makes a New York profile checkable covers it too. Compare firms on what they ' +
      'publish and on what we could verify for ourselves.',
    areas: ['Downtown', 'Elmwood Village', 'Allentown', 'North Buffalo', 'South Buffalo',
            'Amherst', 'Cheektowaga', 'Williamsville', 'Tonawanda', 'Niagara Falls'],
    sections: [
      {
        heading: 'Hiring a lawyer in Buffalo: what is different',
        paragraphs: [
          'The deadlines are New York’s, so three years for an injury claim and two years and ' +
          'six months for medical malpractice, and the rule that catches people out is the same ' +
          'one that catches New Yorkers four hundred miles away. A claim against a public body, ' +
          'the City of Buffalo, Erie County, the NFTA, needs a written notice of claim within ' +
          '<b>90 days</b> under General Municipal Law § 50-e, sworn, and setting out when, where ' +
          'and how the claim arose. Nobody sends a reminder.',
          'Where a case is heard is local, though. Erie County sits in the Eighth Judicial ' +
          'District, whose Supreme Court is at 25 Delaware Avenue downtown, and the district ' +
          'also covers Niagara, Chautauqua, Cattaraugus, Genesee, Allegany, Orleans and Wyoming ' +
          'counties. Federal matters go to the Western District of New York, which sits in ' +
          'Buffalo rather than in Manhattan. A firm that appears in those buildings weekly knows ' +
          'their judges and their calendars, and Western New York is a small enough bar that ' +
          'this is a real difference rather than a marketing line.',
        ],
      },
      {
        heading: 'What lawyers cost in Buffalo',
        paragraphs: [
          'Injury work is done on contingency, and New York regulates the share: one third of ' +
          'the recovery is the ordinary arrangement, with a statutory sliding scale in medical ' +
          'malpractice. That is the rule rather than a quote, and no firm in this directory ' +
          'publishes its own percentage, in Buffalo or anywhere else. Hourly rates upstate run ' +
          'well below Manhattan’s, which matters for everything billed by the hour and not at ' +
          'all for a case taken on contingency.',
        ],
      },
      {
        heading: 'Deadlines that catch Western New Yorkers out',
        paragraphs: [],
        list: [
          '<b>Personal injury:</b> three years from the accident, state-wide.',
          '<b>Any claim against the City of Buffalo, Erie County or the NFTA:</b> a sworn notice ' +
          'of claim within <b>90 days</b>, then a year and ninety days to sue.',
          '<b>Medical malpractice:</b> two years and six months, with a discovery rule for ' +
          'foreign objects and missed cancer diagnoses.',
          '<b>A crash with a car registered in Ontario:</b> the deadline is still New York’s, ' +
          'but service and insurance turn into a cross-border problem that is worth raising on ' +
          'the first call in a border city.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I check if a Buffalo lawyer is licensed?',
        a: 'The same way as anywhere in New York, and it is free: the Unified Court System ' +
           'publishes attorney registrations as open data, so we run that check ourselves and ' +
           'every profile says how many of a firm’s attorneys it covers. That is why a New York ' +
           'profile carries a licence finding and a Maryland one does not.',
      },
      {
        q: 'Are Buffalo firms cheaper than New York City firms?',
        a: 'Not on a contingency case, because the share is set by the same state rule rather ' +
           'than by the local market. On anything billed hourly, yes, substantially. What does ' +
           'differ is caseload: a Western New York firm handles fewer cases at once than a ' +
           'high-volume Manhattan practice, and asking who will actually work on yours is worth ' +
           'more than asking what it costs.',
      },
      {
        q: 'Should I hire a firm in Buffalo itself?',
        a: 'For a case in the Eighth District, local practice matters more here than in a big ' +
           'metro: it is one courthouse and a bar small enough that the lawyers and the judges ' +
           'know each other. Several firms listed here run offices across Erie and Niagara ' +
           'counties. What counts is regular appearance in the court that will hear your case.',
      },
    ],
  },

  'dallas-tx': {
    lede:
      'Texas gives you two years to sue and six months to tell a city you were hurt, and the ' +
      'second deadline is the one nobody hears about. Compare Dallas firms on what they publish ' +
      'and on what we could verify ourselves.',
    areas: ['Downtown', 'Uptown', 'Oak Cliff', 'Deep Ellum', 'Plano', 'Irving', 'Garland',
            'Richardson', 'Mesquite'],
    sections: [
      {
        heading: 'Hiring a lawyer in Dallas: what is different',
        paragraphs: [
          'The limitation period is two years from the day the claim accrues, under section ' +
          '16.003 of the Civil Practice and Remedies Code, and that is a year shorter than New ' +
          'York gives. The deadline that catches people is the other one. A claim against a ' +
          'governmental unit needs notice within <b>six months</b> under section 101.101 of the ' +
          'Tort Claims Act, and the City of Dallas requires the same six months in writing under ' +
          'its own charter, saying when, where and how the injury happened. A bus, a city truck, ' +
          'a pothole or a county hospital all sit behind that rule.',
          'Dallas County runs one of the largest civil court systems in the country, with ' +
          'multiple district courts hearing injury cases and county courts at law below them, ' +
          'all at the George Allen Courts Building downtown. Federal matters go to the Northern ' +
          'District of Texas. This is also the most advertised legal market in this directory by ' +
          'a distance, which is worth knowing when you compare: the firm with the most billboards ' +
          'is not a measurement of anything, and it is the reason this site exists.',
        ],
      },
      {
        heading: 'What lawyers cost in Dallas',
        paragraphs: [
          'Injury work is done on contingency and Texas does not cap the share by statute the ' +
          'way New York does for injury matters, so the percentage is genuinely negotiable and ' +
          'genuinely varies. That makes the two questions on our fees guide worth more here than ' +
          'anywhere else we cover: what the percentage is, and whether case expenses come out ' +
          'before or after the fee is worked out. Ask both, and get the answer in the agreement ' +
          'rather than on the phone.',
        ],
      },
      {
        heading: 'Deadlines that catch Texans out',
        paragraphs: [],
        list: [
          '<b>Personal injury:</b> two years from the day the claim accrues, under Civil ' +
          'Practice and Remedies Code § 16.003.',
          '<b>Any claim against the City of Dallas, the county, DART or a public hospital:</b> ' +
          'written notice within <b>six months</b>, under Tort Claims Act § 101.101 and the ' +
          'city charter.',
          '<b>Wrongful death:</b> two years, and the clock runs from the death rather than from ' +
          'the injury that caused it.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I check if a Texas lawyer is licensed?',
        a: 'The State Bar of Texas publishes a Find a Lawyer directory at ' +
           '<a href="https://www.texasbar.com" rel="nofollow noopener" target="_blank">' +
           'texasbar.com</a>, free to search, showing bar number, admission date and public ' +
           'disciplinary history. We do not read it: it refuses our requests, so Texas profiles ' +
           'carry no licence finding rather than one we did not make. New York publishes the ' +
           'same information as open data, which is why New York profiles do carry it.',
      },
      {
        q: 'Why do so many Dallas firms advertise so heavily?',
        a: 'Because it works, and because nothing stops it. Advertising spend is not evidence ' +
           'about a practice, and it is not in this directory’s score at any weight: the ' +
           'measurements are licensure, discipline, what a firm publishes about its own results, ' +
           'client reviews it did not collect through us, and the quality of its own site. A ' +
           'firm can be excellent and loud, or excellent and invisible. We measure the same ' +
           'things either way.',
      },
      {
        q: 'Should I hire a firm in Dallas itself?',
        a: 'Dallas County is where most of these cases are heard, and a firm in Plano or Irving ' +
           'appears there constantly. The metro is one legal market rather than several. What ' +
           'matters is regular practice in the court that will hear your case, which for a ' +
           'serious injury claim usually means a Dallas County district court.',
      },
    ],
  },

  'portland-or': {
    lede:
      'Oregon gives you two years to sue and 180 days to notify a public body, and the second ' +
      'deadline ends more claims than the first. Compare Portland firms on what they publish ' +
      'and on what we could verify ourselves.',
    areas: ['Downtown', 'Pearl District', 'Northeast', 'Southeast', 'Beaverton', 'Gresham',
            'Lake Oswego', 'Hillsboro', 'Tigard'],
    sections: [
      {
        heading: 'Hiring a lawyer in Portland: what is different',
        paragraphs: [
          'Two years is the limitation period for an injury claim, under ORS 12.110. The rule ' +
          'that ends claims quietly is the Oregon Tort Claims Act: a claim against a public body, ' +
          'the city, the county, TriMet, a public hospital or a school district, needs notice ' +
          'within <b>180 days</b> of the loss under ORS 30.275, and no action can be maintained ' +
          'without it. TriMet matters more here than a transit authority does in most cities, ' +
          'because a great many Portland injury claims involve a bus or a train.',
          'Cases are heard in the Multnomah County Circuit Court downtown, with Washington ' +
          'County in Hillsboro and Clackamas County in Oregon City taking the suburbs. Federal ' +
          'matters go to the District of Oregon. Oregon is also a comparative fault state ' +
          'without the harsh cut-off Maryland applies: a share of the blame reduces what you ' +
          'recover rather than ending the claim, up to the point where your share exceeds the ' +
          'other side’s.',
        ],
      },
      {
        heading: 'What lawyers cost in Portland',
        paragraphs: [
          'Contingency, as everywhere in this directory, and as everywhere in this directory no ' +
          'firm here publishes its percentage. Oregon does not set the share by statute for ' +
          'injury work, so it is a term of the agreement rather than a rule, which means it is ' +
          'worth asking about and worth reading. Ask also whether case expenses come out before ' +
          'or after the fee is calculated: on a mid-size settlement that order is worth five ' +
          'figures.',
        ],
      },
      {
        heading: 'Deadlines that catch Oregonians out',
        paragraphs: [],
        list: [
          '<b>Personal injury:</b> two years, under ORS 12.110.',
          '<b>Any claim against the city, the county, TriMet or another public body:</b> notice ' +
          'within <b>180 days</b> of the loss, under ORS 30.275. Wrongful death allows a year.',
          '<b>Medical malpractice:</b> two years from discovery, with an outer limit of five ' +
          'years from the treatment itself.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I check if an Oregon lawyer is licensed?',
        a: 'The Oregon State Bar publishes a member directory at ' +
           '<a href="https://www.osbar.org" rel="nofollow noopener" target="_blank">osbar.org</a>, ' +
           'free to search, showing admission date and public discipline. We do not read it: it ' +
           'refuses our requests, so Oregon profiles carry no licence finding rather than one we ' +
           'did not make. Every profile says which of the two it is showing you.',
      },
      {
        q: 'My accident involved a TriMet bus. Is that different?',
        a: 'Yes, and mainly in the time you have. TriMet is a public body, so the Tort Claims ' +
           'Act notice applies and 180 days is the window rather than two years. It is the single ' +
           'most common way a Portland claim is lost before anybody argues about who was at ' +
           'fault. Nothing here is legal advice and how the rule applies to a particular crash ' +
           'is what a first consultation is for.',
      },
      {
        q: 'Should I hire a firm in Portland itself?',
        a: 'The metro is one legal market and firms in Beaverton, Gresham and Lake Oswego appear ' +
           'in Multnomah County constantly. What counts is regular practice in the court that ' +
           'will hear your case rather than the address on the letterhead.',
      },
    ],
  },

  // A region, not a city, and the file says so because the field is called `city`. Valparaiso
  // holds eight of these firms' offices and Merrillville six, across two counties, and naming
  // either as the market would put the other's firms in the wrong ranking.
  'northwest-indiana': {
    lede:
      'Northwest Indiana is a region rather than a city, and so is its legal market: firms in ' +
      'Valparaiso, Merrillville, Portage and Crown Point appear in the same two courthouses and ' +
      'compete for the same clients. Compare them on what they publish and on what we could ' +
      'verify ourselves.',
    areas: ['Valparaiso', 'Merrillville', 'Portage', 'Crown Point', 'Hammond', 'Gary',
            'Chesterton', 'Griffith', 'Dyer', 'Michigan City'],
    sections: [
      {
        heading: 'Why this market is a region and not a city',
        paragraphs: [
          'Every other market in this directory is a city. This one is two counties, Lake and ' +
          'Porter, and the reason is where the firms are. The offices behind this ranking are ' +
          'spread across Valparaiso, Merrillville, Portage and Crown Point with no town holding ' +
          'more than a third of them, and somebody hurt in Portage would think nothing of hiring ' +
          'a firm in Merrillville twenty miles west. Naming one town as the market would file ' +
          'the others’ firms in the wrong ranking, and splitting the region in two would ' +
          'produce a pair of rankings too small to rank anything.',
          'The courts follow the same shape. Lake County sits in Crown Point and Hammond, Porter ' +
          'County in Valparaiso, and federal matters for both go to the Northern District of ' +
          'Indiana at Hammond. This is also Chicago’s Indiana side: a crash on the Skyway ' +
          'or the Indiana Toll Road can put an Illinois driver, an Indiana road authority and two ' +
          'sets of insurers in the same claim, which is worth raising on a first call.',
        ],
      },
      {
        heading: 'Deadlines that catch Hoosiers out',
        paragraphs: [],
        list: [
          '<b>Personal injury:</b> two years from the day the claim accrues, under Indiana Code ' +
          '34-11-2-4.',
          '<b>A claim against the State of Indiana:</b> written notice within <b>270 days</b> of ' +
          'the loss, under the Indiana Tort Claims Act.',
          '<b>A claim against a city, a county, a school corporation or another political ' +
          'subdivision:</b> the same Act sets a shorter notice period, and we are not printing a ' +
          'number here because we could not confirm one against the statute itself. Ask on the ' +
          'first call, and ask early: this is the deadline that ends these claims.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I check if an Indiana lawyer is licensed?',
        a: 'The Indiana Supreme Court publishes a Roll of Attorneys, free to search, showing ' +
           'admission and any public discipline. We do not read it: Indiana profiles carry no ' +
           'licence finding rather than one we did not make. New York publishes the same ' +
           'information as open data, which is why New York profiles do carry it.',
      },
      {
        q: 'Should I hire a firm in my own town?',
        a: 'Less than anywhere else in this directory. The region is compact, the two county ' +
           'courthouses hear almost everything, and the firms listed here appear in both. What ' +
           'matters is regular practice in the court that will hear your case rather than the ' +
           'distance to the office.',
      },
      {
        q: 'My accident happened in Illinois. Does that change things?',
        a: 'It can change which state’s law applies, which deadline runs and where the case ' +
           'is filed, and those are three different questions. Firms here handle it constantly ' +
           'because the state line runs through the middle of this market, so raise it in the ' +
           'first conversation. Nothing on this page is legal advice.',
      },
    ],
  },

  // Massachusetts blocks automated readers on both of its official sites: malegislature.gov
  // refuses the connection and mass.gov answers 403. So every rule below is cited from a
  // published decision of the state's own appellate courts, which quote the statute, and
  // nothing is printed that could not be traced to one. That is the same standard that left
  // Indiana's political-subdivision deadline off the Northwest Indiana page.
  'boston-ma': {
    lede:
      'Massachusetts is a no-fault state, which changes the first question in a car accident ' +
      'case from who was to blame to how large the medical bills are. Compare Boston firms on ' +
      'what they publish and on what we could check for ourselves.',
    areas: ['Downtown', 'Back Bay', 'South Boston', 'Dorchester', 'Cambridge', 'Somerville',
            'Brookline', 'Quincy', 'Medford', 'Newton'],
    sections: [
      {
        heading: 'Hiring a lawyer in Boston: what is different',
        paragraphs: [
          'In most of the country a car accident claim goes to the other driver’s insurer. ' +
          'In Massachusetts it starts with your own: personal injury protection pays the first ' +
          'part of the medical bills whoever caused the crash, and a claim for pain and ' +
          'suffering is barred outright unless the injury clears a threshold. The Appeals Court ' +
          'put the figure plainly in <i>Chenell v. Central Wheelchair & Van Transport</i> in ' +
          '2018: medical expenses have to exceed <b>$2,000</b> under General Laws chapter 231, ' +
          'section 6D, and the threshold is met without that sum where the injury is a fracture, ' +
          'permanent and serious disfigurement, or loss of sight or hearing. It means two people ' +
          'hurt in the same collision can have very different cases, and it is worth asking a ' +
          'firm early where your bills stand against it.',
          'Blame is then shared rather than fatal. Massachusetts recovery survives the ' +
          'plaintiff’s own carelessness as long as it was not greater than the ' +
          'defendant’s, under chapter 231, section 85, and the award is reduced by the ' +
          'share. That is the ordinary American rule and the opposite of what happens fifty ' +
          'miles down the coast: Maryland, where this directory also ranks firms, still ends a ' +
          'claim entirely when the injured person contributed to it at all.',
          'Where a case is heard depends on its size and its subject. Larger civil claims in the ' +
          'city go to the Superior Court for Suffolk County, smaller ones to the Boston ' +
          'Municipal Court or a District Court, and federal matters to the United States ' +
          'District Court for the District of Massachusetts. Cambridge and Somerville are ' +
          'Middlesex County and Quincy is Norfolk, so a firm two stops away on the Red Line may ' +
          'be appearing in a different courthouse from the one that will hear your case.',
        ],
      },
      {
        heading: 'Deadlines that catch Bostonians out',
        paragraphs: [],
        list: [
          '<b>Personal injury:</b> three years, the period the Appeals Court identified in ' +
          '<i>Davalos v. Bay Watch</i> as specified by General Laws chapter 260, section 2A.',
          '<b>A claim against the city, the T, a school district or any other public ' +
          'employer:</b> written presentment to its executive officer <b>within two years</b> of ' +
          'the day the claim arose, in the words of chapter 258 as the Appeals Court quoted them ' +
          'in <i>Wang v. City of Chelsea</i> in 2026. This is the deadline that ends these ' +
          'claims, it runs a year earlier than the ordinary one, and nobody is obliged to remind ' +
          'you.',
          '<b>Medical malpractice:</b> shorter and more complicated than the ordinary injury ' +
          'deadline, with a tribunal step before the case proceeds. We are not printing a period ' +
          'here because we could not confirm one against the statute itself, and this is a ' +
          'question to ask on a first call rather than read off a directory.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I check if a Massachusetts lawyer is licensed?',
        a: 'The Board of Bar Overseers publishes an attorney lookup at massbbo.org, free to ' +
           'search, showing status and public discipline. We do not read it: Massachusetts ' +
           'profiles carry no licence finding rather than one we did not make. New York ' +
           'publishes the same information as open data, which is why New York profiles do ' +
           'carry it.',
      },
      {
        q: 'My medical bills are small. Do I still have a case?',
        a: 'You may have no claim for pain and suffering, which is a different thing from having ' +
           'no claim. Personal injury protection covers medical bills and lost wages without ' +
           'anyone proving fault, and the $2,000 threshold applies to the pain and suffering ' +
           'part, with fractures and serious permanent injuries exempt from it. A firm that ' +
           'handles these every week can tell you which side of the line you are on. Nothing on ' +
           'this page is legal advice.',
      },
      {
        q: 'Should I hire a firm in my own neighbourhood?',
        a: 'It matters less than the courthouse. Greater Boston is compact and the firms here ' +
           'appear across Suffolk, Middlesex and Norfolk counties, so what counts is regular ' +
           'practice in the court that will hear your case rather than the walk from your ' +
           'front door.',
      },
    ],
  },
};
