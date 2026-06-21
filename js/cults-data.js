/* ============================================================
   cults-data.js
   The five case studies for the explorer in cults-the-cage.html.
   Each group is mapped on the same axes, so you can watch the
   same machine run to five different endings:
     one     what it was, in one plain sentence
     promise the path it offered (it always began as one)
     leader  the charismatic leader at the center
     caged   how the cage closed (the mechanism, applied)
     cost    the engineered cost of leaving or crossing it
     end     how it ended
   Plus short fields (founded / began / endshort) for the table.
   fam encodes the ending: operating / prosecuted / death.
   Data only. The explorer (js/cults.js) renders it. Sources are
   cited in the post's reference list. No em dashes.
   ============================================================ */
window.CULTS = {
  fams: {
    operating:  { label: 'Still operating', color: '#dfc288' },
    prosecuted: { label: 'Leaders imprisoned', color: '#cf9f78' },
    death:      { label: 'Ended in mass death', color: '#d9978c' }
  },

  /* display order: the two modern, money-driven cases first, then
     the commune, then the two that ended in death. */
  order: ['scientology', 'nxivm', 'rajneesh', 'jonestown', 'heavensgate'],

  cases: {

    scientology: {
      name: 'Scientology',
      fam: 'operating',
      also: 'Dianetics, founded 1954',
      founded: '1954',
      began: 'a self-help therapy',
      endshort: 'still operating',
      one: 'A do-it-yourself therapy that promised to clear your mind of hidden trauma, wrapped in a secret science-fiction cosmology and a bill that can run past a quarter of a million dollars.',
      promise: 'In 1950 the pulp science-fiction writer <b>L. Ron Hubbard</b> published <i>Dianetics</i>, a self-help method that promised to erase the buried memories ("engrams") behind your fears and failures. The book sold by the million. The offer was simple and huge: take control of your own mind, and start up "the Bridge to Total Freedom."',
      leader: 'Hubbard, and after his death in 1986, <b>David Miscavige</b>. The doctrine is fixed and total, and only the church can sell you the next step up the Bridge, in order, for a fee. There is no version of being right that does not run through them.',
      caged: 'In "auditing" sessions you confess your most private memories to a church staffer holding an "E-meter," and the church keeps the record. Higher up, the secret level <b>OT III</b> reveals that a galactic ruler named Xenu solved overpopulation 75 million years ago by dropping frozen aliens into Earth’s volcanoes. Reaching it costs tens of thousands of dollars. Full-time staff, the "Sea Org," sign a billion-year contract.',
      cost: 'Disconnection. Anyone who criticizes the church can be declared a "Suppressive Person," and members in good standing are required to cut them off completely. People have lost their parents, their children, and their husbands and wives in a single phone call, for the offense of asking questions.',
      end: 'Still here, and tax-exempt as a religion in the United States since 1993. Almost everything known about the inside comes from defectors and from Lawrence Wright’s reporting in <i>Going Clear</i>. The church denies the accounts of abuse and sues often.'
    },

    nxivm: {
      name: 'NXIVM',
      fam: 'prosecuted',
      also: 'Executive Success Programs, 1998',
      founded: '1998',
      began: 'a self-help company',
      endshort: '120-year sentence',
      one: 'A corporate self-improvement company that ran respectable personal-growth seminars for twenty years, and hid a master-and-slave sorority that branded women with the founder’s initials.',
      promise: '<b>Keith Raniere</b> sold "Executive Success Programs," five-day workshops in confidence, ethics, and getting past your own limits. Tens of thousands of people took them. Doctors, actors, and heirs paid for the advanced courses, and plenty of them said the early ones honestly helped.',
      leader: 'Raniere, who went by "Vanguard," was sold to members as one of the smartest and most ethical men alive. They marked their progress with colored sashes, like a martial art, and every ladder in the company ended at him.',
      caged: 'A secret group inside the company, <b>DOS</b>, recruited women as lifelong "slaves" to a "master." To get in, each woman handed over "collateral": nude photographs, or a videotaped confession to a crime or a family secret, true or invented. Then she was branded near the hip with Raniere’s initials, with a cauterizing pen and no anesthetic, and told it would build character.',
      cost: 'The collateral was the lock, and it was collected before anyone knew what they were joining. To leave, or to talk, was to have your worst secret and your naked photos made public. It was blackmail, gathered up front and renamed trust.',
      end: 'One woman’s branding scar, described to the <i>New York Times</i> in 2017, cracked it open. In 2019 Raniere was convicted of racketeering and sex trafficking, and in 2020 he was sentenced to 120 years. The actress Allison Mack, who recruited women into DOS, got three and a half years.'
    },

    rajneesh: {
      name: 'Rajneesh, or Osho',
      fam: 'prosecuted',
      also: 'the Rajneesh movement',
      founded: '1981',
      began: 'a meditation commune',
      endshort: 'mass poisoning, 1985',
      one: 'An Indian guru’s free-love meditation movement that built a city in the Oregon high desert, then carried out the largest bioterror attack in American history to try to win a county election.',
      promise: '<b>Bhagwan Shree Rajneesh</b> mixed Eastern meditation, Western therapy, and sexual freedom into something thousands of educated Westerners found electric. His followers, the "sannyasins," wore red, took new names, and in 1981 built a whole city, Rajneeshpuram, on a ranch in Oregon.',
      leader: 'Rajneesh preached, then spent years in public silence while devotion ran the place. He collected Rolls-Royces, nearly a hundred of them, and his red-clad followers lined the dirt roads each day just to watch him drive past.',
      caged: 'As the commune went to war with its rural neighbors, his secretary <b>Ma Anand Sheela</b> ran it on surveillance, loyalty tests, and fear. To swing a local election, the group bused in thousands of homeless people to register them as voters, and then poisoned the salad bars of ten restaurants in the nearby town with salmonella.',
      cost: 'Crossing the inner circle was dangerous. Sheela’s people wiretapped the commune, drew up plots to murder a federal prosecutor, and poisoned Rajneesh’s own doctor. Dissent inside Rajneeshpuram could make you a target.',
      end: '751 people fell ill in the salad-bar attack and 45 were hospitalized. By luck, no one died, and it is still the largest bioterror attack on US soil. The plot unraveled, Sheela and others went to prison, and Rajneesh was deported in 1985. He died in India in 1990, and his books sell today under his later name, Osho.'
    },

    jonestown: {
      name: 'Jonestown',
      fam: 'death',
      also: 'the Peoples Temple, 1955',
      founded: '1955',
      began: 'an integrated church',
      endshort: '918 dead, 1978',
      one: 'A genuinely radical, racially integrated church that did real good for the poor for two decades, and then killed 918 of its own members in a jungle in a single afternoon.',
      promise: '<b>Jim Jones</b> built the Peoples Temple in 1950s Indiana as one of the only churches that fully integrated black and white members, when that was dangerous to do. It moved to California and ran free dining halls, drug clinics, and care for the old. Progressive politicians courted it. For a lot of members it was the most just community they had ever belonged to.',
      leader: 'Jones drifted from faith healer to socialist prophet to paranoid addict. He faked healings, asked to be loved more than members loved their own families, and ran late-night drills he called "White Nights," rehearsals for a mass suicide he dressed up as "revolutionary suicide."',
      caged: 'He moved the most devoted members to an isolated clearing in the jungle of Guyana, Jonestown, a day’s hard travel from anyone who might check on them. Passports were collected. Mail and contact were controlled. Armed guards ringed the camp. There was, very deliberately, nowhere to walk to.',
      cost: 'When Congressman <b>Leo Ryan</b> flew in to investigate in 1978 and a handful of members tried to leave with him, Jones had them shot at the airstrip. Ryan and four others were killed. Leaving was the trigger he had been waiting for.',
      end: 'That same day Jones ordered the end. Cyanide was stirred into grape Flavor Aid. 918 people died, among them 304 children, who were poisoned first and chose nothing. "They drank the Kool-Aid" gets the drink wrong, and it gets the children very wrong.'
    },

    heavensgate: {
      name: "Heaven's Gate",
      fam: 'death',
      also: 'active 1970s to 1997',
      founded: '1974',
      began: 'a UFO faith',
      endshort: '39 dead, 1997',
      one: 'A gentle, celibate UFO faith that taught the body was just a container, until 39 of its members shed theirs together to catch a ride on a spaceship none of them could see.',
      promise: '<b>Marshall Applewhite</b> and <b>Bonnie Nettles</b> taught that the human body is a "vehicle," a temporary container, and that a person could graduate to the "Next Level," a real and physical heaven out in space. Members lived quietly together and paid the bills with a tidy web-design business.',
      leader: 'Applewhite ("Do") and Nettles ("Ti"). The life was strict and ascetic: no sex (several men, Applewhite included, were castrated), no drugs, no separate self. Members wore the same clothes and haircuts and paired off to watch each other’s minds for stray doubts.',
      caged: 'Belief did the work that walls and guards did elsewhere. Over twenty years members gave up their names, their money, their families, and their sexuality, and learned to treat their own doubts as a test planted by a lower force. The price of staying was your entire self. The reward was the universe.',
      cost: 'There was almost no force, and no fence. That is the quiet horror of it: a person can be talked all the way into a cage they hold the only key to, and then stand guard over it themselves.',
      end: 'In March 1997, sure that a spacecraft was trailing the Hale-Bopp comet, 39 members aged 26 to 72 drank phenobarbital and vodka and lay down in matching tracksuits and black Nikes. The website they built to spread the word is still online today, kept up by two members who happened to be away that night.'
    }

  }
};
