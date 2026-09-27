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

  // The first market here that is not about injuries, and the local knowledge is a different
  // kind: what the state fixes, what it leaves to custom, and the two deadlines that decide
  // whether a Collier County closing happens this month or next. Every figure is cited from the
  // Florida Statutes as the Senate publishes them, which unlike Massachusetts answer a reader.
  'naples-fl': {
    lede:
      'The price of title insurance in Florida is set by the state, so every firm quotes the ' +
      'same premium and the only fee worth comparing is the one almost nobody publishes. ' +
      'Compare Naples firms on what they put in writing and on what we could check ourselves.',
    areas: ['Old Naples', 'Park Shore', 'Pelican Bay', 'North Naples', 'Vanderbilt Beach',
            'Golden Gate', 'East Naples', 'Marco Island', 'Bonita Springs', 'Immokalee'],
    sections: [
      {
        heading: 'Hiring a real estate lawyer in Naples: what is different',
        paragraphs: [
          'Shopping the title premium is a waste of an afternoon. Section 627.782 of the Florida ' +
          'Statutes requires the Financial Services Commission to adopt a rule "specifying the ' +
          'premium to be charged in this state by title insurers", and it is the same at every ' +
          'agency and every law firm in Florida for the same policy amount. What varies is the ' +
          'firm\u2019s own settlement fee for handling the file, and that one is negotiable, ' +
          'rarely published, and worth asking for in dollars before anybody signs.',
          'A law firm here is often not in the state\u2019s title agency register, and that is ' +
          'the statute working as intended rather than a gap. Section 626.8417(4) exempts ' +
          '"attorneys duly admitted to practice law in this state and in good standing with The ' +
          'Florida Bar" from the licensing and appointment rules that apply to an agency. So ' +
          'where a firm does hold an agency licence we print the number, and where it does not ' +
          'the profile says the exemption is the ordinary reason. An absence from a register is ' +
          'never a finding here.',
          'Collier County is condominium country, and that changes which documents decide a ' +
          'closing. An association\u2019s estoppel certificate, its reserve position and its ' +
          'inspection history matter more here than a survey line does, and the two deadlines ' +
          'below are the ones that move a closing date.',
        ],
      },
      {
        heading: 'Deadlines that decide a Collier County closing',
        paragraphs: [],
        list: [
          '<b>The estoppel certificate:</b> an association has <b>10 business days</b> from a ' +
          'written request to issue one, under Florida Statutes section 720.30851, and it has to ' +
          'publish on its website who receives the request. Nothing closes without it, and two ' +
          'weeks is the difference between a closing date that holds and one that does not.',
          '<b>The milestone inspection:</b> under section 553.899 a condominium or cooperative ' +
          'building must have a structural milestone inspection at <b>30 years</b> from the date ' +
          'its certificate of occupancy was issued, and every 10 years after that. A building ' +
          'that turned 30 before 1 July 2022 was required to have its first inspection before ' +
          '<b>31 December 2024</b>; one reaching 30 between then and the end of 2024 has until ' +
          '<b>31 December 2025</b>. It does not apply to a one, two, three or four family ' +
          'dwelling.',
          '<b>The contract\u2019s own dates:</b> the inspection period and the financing ' +
          'contingency are written into the purchase agreement rather than into a statute, which ' +
          'means they are negotiable before signature and unforgiving afterwards.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I check if a Florida lawyer is licensed?',
        a: 'The Florida Bar publishes a member search with each attorney\u2019s status and public ' +
           'discipline history, free to use. We also read the discipline the Supreme Court of ' +
           'Florida publishes, through the decisions index, and every Florida profile says what ' +
           'that check found and what it cannot show.',
      },
      {
        q: 'Do I need a lawyer to close on a house in Naples?',
        a: 'No. Florida lets a title company handle a closing and most closings are done that ' +
           'way. A lawyer adds advice about the contract and somebody who can act for you when ' +
           'the deal stops being routine, which in a condominium purchase happens more often ' +
           'than people expect. Nothing on this page is legal advice.',
      },
      {
        q: 'Why are there title companies in the search results and not on this page?',
        a: 'Because this is a directory of law firms. Several of the most reviewed businesses ' +
           'that come back from a search for a real estate lawyer in Naples are title agencies ' +
           'rather than law firms, and a title agency handling a dispute would be practising law ' +
           'without a licence. They are listed in the cohort file as excluded, with the reason.',
      },
    ],
  },

  'houston-tx': {
    lede:
      'Texas gives you two years to sue, six months to tell a city you were hurt, and a separate ' +
      'set of rules again if the defendant is a hospital. Compare Houston firms on what they ' +
      'publish and on what we could verify ourselves.',
    areas: ['Downtown', 'Midtown', 'The Heights', 'Montrose', 'Sugar Land', 'Katy', 'Pasadena',
            'Pearland', 'Spring'],
    sections: [
      {
        heading: 'Hiring a lawyer in Houston: what is different',
        paragraphs: [
          'The limitation period is two years from the day the claim accrues, under section ' +
          '16.003 of the Civil Practice and Remedies Code. A claim against a governmental unit ' +
          'needs written notice within <b>six months</b> under section 101.101 of the Tort Claims ' +
          'Act, and that covers METRO, a county hospital district, a city truck and a flooded ' +
          'road alike.',
          'What sets Houston apart from the rest of Texas is the Texas Medical Center, the ' +
          'largest concentration of hospitals in the world, and with it a volume of medical ' +
          'claims no other city in this directory carries. Those claims run on their own track. ' +
          'Chapter 74 of the Civil Practice and Remedies Code requires notice sixty days before ' +
          'suit and an expert report served within <b>120 days</b> of the defendant answering, ' +
          'and a case without that report is dismissed with the defendant’s fees attached. It is ' +
          'the single most unforgiving deadline on this page, and it is why a firm that does ' +
          'medical work and a firm that does car accidents are not interchangeable here.',
          'Harris County hears these cases in its civil district courts, and federal matters go ' +
          'to the Southern District of Texas. Houston is also, like Dallas, one of the most ' +
          'heavily advertised legal markets in the country, which is worth remembering while ' +
          'comparing: billboards are not a measurement, and their absence from our score is the ' +
          'reason this directory exists.',
        ],
      },
      {
        heading: 'What lawyers cost in Houston',
        paragraphs: [
          'Injury work is done on contingency and Texas sets no statutory cap on the share, so ' +
          'the percentage is genuinely negotiable and genuinely varies between firms. Ask what ' +
          'the percentage is, ask whether it rises if the case is filed or tried, and ask ' +
          'whether case expenses come out before or after the fee is calculated. That last one ' +
          'moves the number more than most people expect, and the answer belongs in the written ' +
          'agreement rather than on the phone.',
          'Medical claims carry a second cost worth asking about. Texas caps non-economic ' +
          'damages against physicians under Chapter 74, and the expert report the statute ' +
          'demands has to be paid for early, long before any recovery. A firm that takes these ' +
          'cases advances that money; ask what happens to it if the case does not succeed.',
        ],
      },
      {
        heading: 'Deadlines that catch Houstonians out',
        paragraphs: [],
        list: [
          '<b>Personal injury:</b> two years from the day the claim accrues, under Civil ' +
          'Practice and Remedies Code § 16.003.',
          '<b>Any claim against the City of Houston, Harris County, METRO or a public hospital ' +
          'district:</b> written notice within <b>six months</b>, under Tort Claims Act § 101.101.',
          '<b>Medical malpractice:</b> two years, plus sixty days’ notice before filing and an ' +
          'expert report within <b>120 days</b> of the answer, under Chapter 74.',
          '<b>Wrongful death:</b> two years, running from the death rather than from the injury ' +
          'that caused it.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I check if a Houston lawyer is licensed?',
        a: 'The State Bar of Texas publishes a Find a Lawyer directory at ' +
           '<a href="https://www.texasbar.com" rel="nofollow noopener" target="_blank">' +
           'texasbar.com</a>, free to search, showing bar number, admission date and public ' +
           'disciplinary history. We do not read it: it refuses our requests, so Texas profiles ' +
           'carry no licence finding rather than one we did not make.',
      },
      {
        q: 'What can you verify about a Texas firm that you cannot verify elsewhere?',
        a: 'Its registration. The Texas Comptroller publishes every active franchise taxpayer as ' +
           'open data, refreshed daily, with the Secretary of State file number and usually the ' +
           'charter date, so a Houston profile can show that the entity exists and holds the ' +
           'right to transact business. A firm missing from that list is not a firm in trouble: ' +
           'a sole proprietor and a general partnership are not franchise taxpayers at all, so ' +
           'the profile says the check could not be completed rather than that it failed.',
      },
      {
        q: 'Should I hire a firm in Houston itself?',
        a: 'Harris County is where most of these cases are heard, and a firm in Sugar Land or ' +
           'Katy appears there constantly. The metro is one legal market. What matters is ' +
           'regular practice in the court that will hear your case, and for a medical claim, ' +
           'whether the firm does that work at all rather than referring it on.',
      },
    ],
  },

  'atlanta-ga': {
    lede:
      'Georgia gives you two years to sue and as little as six months to notify a city, and the ' +
      'notice deadline changes depending on whether you are suing a city, a county or the state. ' +
      'Compare Atlanta firms on what they publish and on what we could verify ourselves.',
    areas: ['Downtown', 'Midtown', 'Buckhead', 'West End', 'Decatur', 'Sandy Springs', 'Marietta',
            'Alpharetta', 'East Point'],
    sections: [
      {
        heading: 'Hiring a lawyer in Atlanta: what is different',
        paragraphs: [
          'The limitation period for a personal injury is two years from the injury, under ' +
          'section 9-3-33 of the Official Code of Georgia. The deadlines that catch people are ' +
          'the notice rules, and Georgia has three different ones depending on who you are ' +
          'suing. A municipality wants written ante litem notice within <b>six months</b> under ' +
          'section 36-33-5. A county wants <b>twelve months</b> under section 36-11-1. The State ' +
          'of Georgia and its agencies want twelve months under the Tort Claims Act at section ' +
          '50-21-26, delivered to the Department of Administrative Services. Miss the right one ' +
          'and the claim is gone regardless of its merits.',
          'Georgia also bars recovery entirely once you are found fifty per cent or more at ' +
          'fault, under section 51-12-33, which is stricter than a pure comparative state and ' +
          'makes the apportionment argument the whole case in a contested crash.',
          'Fulton County hears civil matters in both its State Court and its Superior Court, ' +
          'and injury cases commonly go to the State Court. DeKalb, Cobb and Gwinnett run their ' +
          'own. Federal matters go to the Northern District of Georgia.',
        ],
      },
      {
        heading: 'What we can and cannot verify about a Georgia firm',
        paragraphs: [
          'Less than anywhere else in this directory, and the profiles say so rather than ' +
          'quietly scoring a zero. Georgia publishes no attorney register we are able to query ' +
          'and no business register we may read, so licensure and entity registration are both ' +
          'recorded as checks without a source rather than as findings against a firm.',
          'One check does have a source. Attorney discipline in Georgia is decided by the ' +
          'Supreme Court of Georgia and published as opinions styled “In the Matter of”, which ' +
          'are indexed and readable, so that is the one gate in this state standing on evidence ' +
          'rather than on an absence. Without it every Atlanta profile would carry three ' +
          'unanswered checks instead of two.',
        ],
      },
      {
        heading: 'Deadlines that catch Georgians out',
        paragraphs: [],
        list: [
          '<b>Personal injury:</b> two years from the injury, under OCGA § 9-3-33.',
          '<b>A claim against the City of Atlanta or another municipality:</b> written ante ' +
          'litem notice within <b>six months</b>, under OCGA § 36-33-5.',
          '<b>A claim against Fulton, DeKalb or another county:</b> <b>twelve months</b>, under ' +
          'OCGA § 36-11-1.',
          '<b>A claim against the State or MARTA:</b> twelve months’ notice under the Georgia ' +
          'Tort Claims Act, OCGA § 50-21-26.',
          '<b>Loss of consortium:</b> four years, which outlives the injury claim it arises ' +
          'from and is routinely missed for that reason.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I check if a Georgia lawyer is licensed?',
        a: 'The State Bar of Georgia publishes a member directory at ' +
           '<a href="https://www.gabar.org" rel="nofollow noopener" target="_blank">gabar.org</a>, ' +
           'free to search, showing admission date and public discipline. We do not read it, so ' +
           'Atlanta profiles carry no licence finding rather than one we did not make. Checking ' +
           'it yourself takes a minute and is worth doing.',
      },
      {
        q: 'Why does the ante litem deadline differ between a city and a county?',
        a: 'Because they come from different statutes written at different times, and Georgia ' +
           'never harmonised them. It is a genuine trap rather than a technicality: a crash ' +
           'involving a county ambulance and a city police car can carry both deadlines at once, ' +
           'and the shorter one governs that half of the claim. This is not legal advice, and a ' +
           'claim against any public body is a reason to talk to a lawyer early rather than ' +
           'after six months.',
      },
    ],
  },

  'miami-fl': {
    lede:
      'Florida halved its deadline for injury claims in 2023, from four years to two, and a lot ' +
      'of advice online still says four. Compare Miami firms on what they publish and on what we ' +
      'could verify ourselves.',
    areas: ['Downtown', 'Brickell', 'Little Havana', 'Coral Gables', 'Hialeah', 'Miami Beach',
            'Kendall', 'Doral', 'Homestead'],
    sections: [
      {
        heading: 'Hiring a lawyer in Miami: what is different',
        paragraphs: [
          'In March 2023 Florida rewrote the rules for injury claims. The limitation period for ' +
          'general negligence went from four years to <b>two</b>, under section 95.11 of the ' +
          'Florida Statutes, and it applies to causes of action accruing after the change. A ' +
          'great deal of the advice still published online was written before it. If you are ' +
          'reading a page that says four years, check when it was written.',
          'The same reform moved Florida to modified comparative negligence: a claimant found ' +
          'more than fifty per cent at fault recovers nothing, under section 768.81. Florida ' +
          'used to be a pure comparative state where fault only reduced the recovery, so this is ' +
          'a real change in what a contested case is worth.',
          'Miami-Dade hears civil matters in the Eleventh Judicial Circuit, and federal cases go ' +
          'to the Southern District of Florida. Two local facts shape the practice here more ' +
          'than the statutes do. Florida runs a no-fault auto system, so a car claim starts with ' +
          'personal injury protection and only becomes a lawsuit once the injury meets the ' +
          'statutory threshold. And this is the most Spanish-speaking legal market in this ' +
          'directory by a distance, which is why our profiles record which firms publish in ' +
          'Spanish rather than merely saying they speak it.',
        ],
      },
      {
        heading: 'What lawyers cost in Miami',
        paragraphs: [
          'Injury work is done on contingency, and Florida is unusual in setting a sliding scale ' +
          'in its Bar rules rather than leaving the share entirely to negotiation. The ' +
          'percentage ordinarily steps down as the recovery rises and steps up once a case is ' +
          'answered or tried, so the number quoted on a first call is not necessarily the number ' +
          'that applies later. Ask which tier applies to your case and what moves it.',
          'Ask the expenses question too. Whether case costs come out before or after the fee is ' +
          'calculated changes the final figure materially, and it is answered in the written ' +
          'agreement rather than on the phone.',
        ],
      },
      {
        heading: 'Deadlines that catch Floridians out',
        paragraphs: [],
        list: [
          '<b>Personal injury:</b> <b>two years</b> for causes of action accruing after the 2023 ' +
          'reform, under Fla. Stat. § 95.11. Older claims may still carry the four-year rule.',
          '<b>A claim against the city, the county or the State:</b> written notice under Fla. ' +
          'Stat. § 768.28, and the agency has six months to respond before suit can be filed, so ' +
          'the practical deadline is earlier than it looks.',
          '<b>Medical malpractice:</b> two years from when the incident was or should have been ' +
          'discovered, with a longer outer limit, plus a pre-suit investigation period.',
          '<b>Wrongful death:</b> two years from the death.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I check if a Florida lawyer is licensed?',
        a: 'The Florida Bar publishes a member search at ' +
           '<a href="https://www.floridabar.org" rel="nofollow noopener" target="_blank">' +
           'floridabar.org</a>, showing admission date and public discipline. We do not read it, ' +
           'so Miami profiles carry no licence finding. Discipline is different: it is decided by ' +
           'the Supreme Court of Florida and published as opinions, which we do read, so that ' +
           'gate stands on evidence.',
      },
      {
        q: 'What does the Florida register tell you about a firm?',
        a: 'Whether the entity is active, what type it is and when it was filed, from the ' +
           'Division of Corporations. It is worth reading carefully: a filing date is when that ' +
           'entity was registered, not when the practice began, and a firm that reorganised or ' +
           'changed its name files again and shows a new date. Where the two disagree our ' +
           'profiles say so rather than publishing the register date as the firm’s age.',
      },
      {
        q: 'Does it matter that a firm publishes in Spanish?',
        a: 'For a client who needs it, entirely. We record it because it is checkable rather ' +
           'than because we are scoring it heavily: a firm that publishes a real page in Spanish ' +
           'has done something a badge saying “se habla español” does not prove. Our study of ' +
           'what law firms publish in Spanish found injury firms do it far more often than ' +
           'divorce firms, which is the opposite of where a client most needs to be understood.',
      },
    ],
  },

  'chicago-il': {
    lede:
      'Illinois gives you two years to sue almost anybody and <b>one year</b> to sue the city, ' +
      'the park district or the CTA. That second rule ends more Chicago claims than any argument ' +
      'about fault. Compare Chicago firms on what they publish and on what we could verify ' +
      'ourselves.',
    areas: ['The Loop', 'Near North Side', 'Lincoln Park', 'Wicker Park', 'Hyde Park',
            'Logan Square', 'Pilsen', 'Rogers Park', 'South Loop'],
    sections: [
      {
        heading: 'Hiring a lawyer in Chicago: what is different',
        paragraphs: [
          'The ordinary limitation period for a personal injury is two years, under section ' +
          '13-202 of the Code of Civil Procedure. Then there is the rule that catches Chicagoans ' +
          'specifically. A claim against a local public entity is cut to <b>one year</b> by ' +
          'section 8-101 of the Tort Immunity Act, and “local public entity” is a wide net here: ' +
          'the City of Chicago, the Park District, the Housing Authority, a public school, a ' +
          'community college, a forest preserve. A slip on a city pavement and a slip in a ' +
          'private lobby carry deadlines a year apart.',
          'The Chicago Transit Authority is stricter again. Section 41 of the Metropolitan ' +
          'Transit Authority Act gives one year to sue and requires written notice within ' +
          '<b>six months</b> of the injury, naming the date, the place and the treating ' +
          'hospital. A bus or an L platform is the most common way an ordinary commuter falls ' +
          'into a six-month deadline without knowing one exists.',
          'Cook County runs the largest unified court system in the country. Civil cases above ' +
          'thirty thousand dollars go to the Law Division at the Daley Center and smaller ones ' +
          'to the Municipal Department, with the suburban districts hearing matters from their ' +
          'own areas. Federal cases go to the Northern District of Illinois. Illinois also bars ' +
          'recovery entirely once a claimant is more than fifty per cent at fault, under section ' +
          '2-1116, so apportionment is not a side issue in a contested crash.',
        ],
      },
      {
        heading: 'What we can and cannot verify about an Illinois firm',
        paragraphs: [
          'Less here than in most states we cover, and the profiles say so rather than scoring a ' +
          'zero. Illinois publishes no business register we are able to read: the Secretary of ' +
          'State’s search answers an automated request with a refusal, and we do not work around ' +
          'that. So entity registration is recorded as a check without a source.',
          'Discipline is the same, for a different reason. Illinois runs attorney discipline ' +
          'through the Attorney Registration and Disciplinary Commission, and the Supreme Court ' +
          'acts on those matters by order on an M.R. docket rather than by published opinion. ' +
          'The opinion indexes that carry Pennsylvania’s and Nevada’s discipline therefore hold ' +
          'none of Illinois’s. A Chicago profile carries that gate unanswered and says why.',
          'The ARDC does publish a public lawyer search of its own, showing registration status ' +
          'and public discipline, and checking a name there takes a minute. It is worth doing, ' +
          'and it is the check we cannot do for you.',
        ],
      },
      {
        heading: 'Deadlines that catch Chicagoans out',
        paragraphs: [],
        list: [
          '<b>Personal injury:</b> two years, under 735 ILCS 5/13-202.',
          '<b>A claim against the City of Chicago, the Park District, a public school or any ' +
          'local public entity:</b> <b>one year</b>, under the Tort Immunity Act, 745 ILCS ' +
          '10/8-101.',
          '<b>A claim against the CTA:</b> one year to sue, and written notice within <b>six ' +
          'months</b>, under 70 ILCS 3605/41.',
          '<b>Medical malpractice:</b> two years from when the injury was or should have been ' +
          'discovered, with a four-year outer limit under 735 ILCS 5/13-212.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I check if an Illinois lawyer is licensed?',
        a: 'The Attorney Registration and Disciplinary Commission publishes a lawyer search at ' +
           '<a href="https://www.iardc.org" rel="nofollow noopener" target="_blank">iardc.org</a>, ' +
           'free, showing registration status and public discipline. We do not read it, so ' +
           'Chicago profiles carry no licence finding rather than one we did not make.',
      },
      {
        q: 'Why does a Chicago profile show fewer verified checks than a New York one?',
        a: 'Because New York publishes more. Its attorney register is open data and its ' +
           'Department of State register is readable, so a New York profile can show licensure ' +
           'and entity registration as findings. Illinois publishes neither in a form we may ' +
           'read. The score is earned points over measured points rather than over a hundred, so ' +
           'a Chicago firm is not punished for its state’s policy, but fewer of its rows rest on ' +
           'evidence and the profile says which ones.',
      },
      {
        q: 'Is the one-year deadline really that common a problem?',
        a: 'It is the reason this section exists. A person hurt on a Chicago pavement, in a ' +
           'public park, on a CTA bus or at a public school has a year rather than two, and ' +
           'nothing about the injury announces which rule applies. Nothing here is legal advice, ' +
           'and any injury involving a public body is a reason to talk to a lawyer in weeks ' +
           'rather than months.',
      },
    ],
  },

  'philadelphia-pa': {
    lede:
      'Pennsylvania lets drivers give up the right to sue for pain and suffering in exchange for ' +
      'a cheaper premium, and many people do it without realising. Compare Philadelphia firms on ' +
      'what they publish and on what we could verify ourselves.',
    areas: ['Center City', 'South Philadelphia', 'North Philadelphia', 'West Philadelphia',
            'Northeast Philadelphia', 'Germantown', 'Fishtown', 'University City'],
    sections: [
      {
        heading: 'Hiring a lawyer in Philadelphia: what is different',
        paragraphs: [
          'One rule matters more than every other on this page. Pennsylvania auto policies ask ' +
          'the buyer to choose between <b>full tort</b> and <b>limited tort</b> under section ' +
          '1705 of the Vehicle Code. Limited tort is cheaper, and it gives up the right to ' +
          'recover for pain and suffering unless the injury is a serious one as the statute ' +
          'defines it. The choice is made once, often years before any crash, usually on a form ' +
          'nobody reread. It is the first thing a Philadelphia injury lawyer asks about and it ' +
          'is worth knowing your own answer before you call one. There are exceptions, including ' +
          'for some claims against drunk drivers and out-of-state vehicles.',
          'The ordinary limitation period is two years, under section 5524 of the Judicial Code. ' +
          'A claim against a local agency needs written notice within <b>six months</b> under ' +
          'section 5522, which covers the city, SEPTA and a public school district alike.',
          'Philadelphia hears civil matters in the Court of Common Pleas of the First Judicial ' +
          'District, which runs compulsory arbitration for smaller claims and a Complex ' +
          'Litigation Center for mass tort work that draws cases from well beyond the city. ' +
          'Federal matters go to the Eastern District of Pennsylvania. Pennsylvania bars ' +
          'recovery once a claimant is more than fifty per cent at fault, under section 7102.',
        ],
      },
      {
        heading: 'What we can and cannot verify about a Pennsylvania firm',
        paragraphs: [
          'Discipline, yes, and well. The Disciplinary Board prosecutes in the Supreme Court of ' +
          'Pennsylvania and the decisions are published as opinions styled “Office of ' +
          'Disciplinary Counsel v.”, which gives this directory its largest disciplinary index ' +
          'after Florida’s. That gate stands on evidence on a Philadelphia profile.',
          'Entity registration, no. The Department of State’s business search answers an ' +
          'automated request with a refusal, and we do not work around that, so registration is ' +
          'recorded as a check without a source. Licensure is the same: the attorney register is ' +
          'not published in a form we may query.',
        ],
      },
      {
        heading: 'Deadlines that catch Philadelphians out',
        paragraphs: [],
        list: [
          '<b>Personal injury:</b> two years, under 42 Pa.C.S. § 5524.',
          '<b>A claim against the City of Philadelphia, SEPTA or a school district:</b> written ' +
          'notice within <b>six months</b>, under 42 Pa.C.S. § 5522.',
          '<b>Wrongful death:</b> two years from the death.',
          '<b>The limited tort election:</b> not a deadline, but it is decided before the ' +
          'accident and it governs what a claim is worth. 75 Pa.C.S. § 1705.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I check if a Pennsylvania lawyer is licensed?',
        a: 'The Disciplinary Board of the Supreme Court of Pennsylvania publishes an attorney ' +
           'search at <a href="https://www.padisciplinaryboard.org" rel="nofollow noopener" ' +
           'target="_blank">padisciplinaryboard.org</a>, showing status and public discipline. ' +
           'We do not read it, so Philadelphia profiles carry no licence finding. We do read the ' +
           'court’s published discipline decisions, so that gate does rest on evidence.',
      },
      {
        q: 'How do I find out whether I have limited tort?',
        a: 'It is on your own auto policy declarations page, and your insurer will tell you. ' +
           'Nothing here is legal advice and the exceptions are genuinely technical, which is ' +
           'the argument for asking a lawyer rather than reading a summary. It is also the ' +
           'reason two people with identical injuries from the same crash can have claims worth ' +
           'very different amounts in this state.',
      },
      {
        q: 'Why do so many mass tort cases end up in Philadelphia?',
        a: 'The Court of Common Pleas runs a Complex Litigation Center that consolidates them, ' +
           'and it has done for decades, so firms far outside the city file here. It is worth ' +
           'knowing when you compare: a firm with a Philadelphia address may do most of its work ' +
           'in that programme rather than in the ordinary injury courts, and those are different ' +
           'practices. The profiles record what each firm publishes about its own results.',
      },
    ],
  },

  'las-vegas-nv': {
    lede:
      'Nevada gives you two years to sue, sends most smaller cases to compulsory arbitration ' +
      'before a courtroom, and caps what a medical claim can recover for suffering. Compare Las ' +
      'Vegas firms on what they publish and on what we could verify ourselves.',
    areas: ['Downtown', 'The Strip', 'Summerlin', 'Henderson', 'North Las Vegas', 'Paradise',
            'Spring Valley', 'Enterprise'],
    sections: [
      {
        heading: 'Hiring a lawyer in Las Vegas: what is different',
        paragraphs: [
          'The limitation period for a personal injury is two years, under section 11.190 of the ' +
          'Nevada Revised Statutes. A claim against the State or one of its political ' +
          'subdivisions has to be presented to the right body under section 41.036 before it can ' +
          'be sued on, which is a step rather than a shorter clock and is still routinely missed.',
          'Two local features shape what a case looks like here. The first is that Clark ' +
          'County sends most civil cases below fifty thousand dollars to compulsory arbitration ' +
          'before they ever reach a courtroom, under the Nevada Arbitration Rules, with a path ' +
          'to a trial afterwards for a party willing to risk the costs. A great many ordinary ' +
          'injury claims are resolved in that programme, and it is worth asking a firm how much ' +
          'of its work happens there.',
          'The second is the visitors. Las Vegas receives tens of millions of them a year, and a ' +
          'large share of the claims in this market are brought by people who were hurt here and ' +
          'live somewhere else: on a casino floor, in a hotel, in a rideshare on the Strip. That ' +
          'raises questions of where a case is heard and under which state’s law that simply do ' +
          'not arise in the other markets in this directory, and it is a reasonable thing to ask ' +
          'a firm about directly if you were a visitor.',
          'Clark County hears these cases in the Eighth Judicial District Court, and federal ' +
          'matters go to the District of Nevada. Nevada bars recovery once a claimant is more ' +
          'than fifty per cent at fault, under section 41.141.',
        ],
      },
      {
        heading: 'Medical claims are a different practice here',
        paragraphs: [
          'Nevada caps what a medical malpractice claim can recover for non-economic loss, under ' +
          'chapter 41A, and the legislature reset that cap in 2023 on a schedule that raises it ' +
          'by a fixed amount each year. The figure that applies depends on when the claim ' +
          'accrues, so it is a question for a lawyer rather than a number to read off a page.',
          'A medical complaint also has to be filed with a supporting affidavit from a ' +
          'practitioner in the relevant specialty, under section 41A.071, and one filed without ' +
          'it is void. As in Houston, that means the firm has to pay an expert before there is ' +
          'any recovery to pay them from. Ask what happens to that money if the case does not ' +
          'succeed.',
        ],
      },
      {
        heading: 'Deadlines that catch Nevadans out',
        paragraphs: [],
        list: [
          '<b>Personal injury:</b> two years, under NRS 11.190(4)(e).',
          '<b>A claim against the State, Clark County or the City of Las Vegas:</b> it has to be ' +
          'presented under NRS 41.036 before suit.',
          '<b>Medical malpractice:</b> filed with a supporting expert affidavit under NRS ' +
          '41A.071, or the complaint is void.',
          '<b>Wrongful death:</b> two years from the death.',
        ],
      },
    ],
    faq: [
      {
        q: 'How do I check if a Nevada lawyer is licensed?',
        a: 'The State Bar of Nevada publishes a member search at ' +
           '<a href="https://www.nvbar.org" rel="nofollow noopener" target="_blank">nvbar.org</a>, ' +
           'showing status and public discipline. We do not read it, so Las Vegas profiles carry ' +
           'no licence finding. We do read the Supreme Court of Nevada’s published discipline ' +
           'decisions, which name the attorney in full, so that gate rests on evidence.',
      },
      {
        q: 'I was visiting and got hurt. Do I need a lawyer in Las Vegas?',
        a: 'Usually yes, because the case will ordinarily be heard where the injury happened and ' +
           'the firm needs to appear there. Nothing here is legal advice. What is worth asking ' +
           'any firm you call is how it handles a client who lives in another state: how much ' +
           'has to be done in person, what happens with medical treatment at home, and who pays ' +
           'for travel if the case is tried.',
      },
      {
        q: 'What does compulsory arbitration mean for my case?',
        a: 'That a smaller claim is heard by an arbitrator rather than a jury first, more ' +
           'quickly and far more cheaply. A party unhappy with the result can request a trial, ' +
           'with a cost risk attached if the outcome does not improve. It is not a lesser ' +
           'process, but it is a different one, and a firm that mostly works in it is doing ' +
           'different work from one that mostly tries cases. The profiles record what each firm ' +
           'publishes about its own results, which is where that difference usually shows.',
      },
    ],
  },
};
