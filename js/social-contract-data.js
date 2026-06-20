/* ============================================================
   The Social Contract, side by side: the corpus.
   Three thinkers, their dates, and the VERBATIM line from each
   one's book that answers each question. The plain-English
   breakdowns live in js/social-contract-notes.js; this file is
   just the evidence, quoted exactly and cited.

   Quotes are reproduced verbatim from primary digital editions
   (see the colophon in social-contract.html for every source).
   Hobbes and Locke are in their own English; Rousseau is in the
   public-domain G. D. H. Cole translation (1913). Quoted
   punctuation is left as the source has it; the lines chosen here
   contain no em dashes, so none had to be altered.

   shape: window.SC = { thinkers, order, questions:[ {id, short,
          q, answers:{ key:{quote, cite} } } ] }
   ============================================================ */
window.SC = {
  thinkers: {
    hobbes:   { name: "Thomas Hobbes",         work: "Leviathan",                       year: 1651 },
    locke:    { name: "John Locke",            work: "Second Treatise of Government",    year: 1689 },
    rousseau: { name: "Jean-Jacques Rousseau", work: "The Social Contract",             year: 1762 }
  },

  order: ["hobbes", "locke", "rousseau"],

  questions: [
    {
      id: "nature",
      short: "The state of nature",
      q: "What are people actually like with no government at all?",
      answers: {
        hobbes: {
          quote: "During the time men live without a common power to keep them all in awe, they are in that condition which is called war; and such a war as is of every man against every man.",
          cite: "Leviathan, Part I, ch. 13"
        },
        locke: {
          quote: "The state of nature has a law of nature to govern it, which obliges every one: and reason, which is that law, teaches all mankind, who will but consult it, that being all equal and independent, no one ought to harm another in his life, health, liberty, or possessions.",
          cite: "Second Treatise, ch. 2, §6"
        },
        rousseau: {
          quote: "Man is born free; and everywhere he is in chains. One thinks himself the master of others, and still remains a greater slave than they.",
          cite: "The Social Contract, Book I, ch. 1 (tr. Cole)"
        }
      }
    },

    {
      id: "deal",
      short: "What you hand over",
      q: "What exactly do you sign away to get a government?",
      answers: {
        hobbes: {
          quote: "I authorise and give up my right of governing myself to this man, or to this assembly of men, on this condition, that thou give up thy right to him, and authorise all his actions in like manner.",
          cite: "Leviathan, Part II, ch. 17"
        },
        locke: {
          quote: "Though men, when they enter into society, give up the equality, liberty, and executive power they had in the state of nature... the power of the society, or legislative constituted by them, can never be supposed to extend farther than the common good.",
          cite: "Second Treatise, ch. 9, §131"
        },
        rousseau: {
          quote: "Each of us puts his person and all his power in common under the supreme direction of the general will, and, in our corporate capacity, we receive each member as an indivisible part of the whole.",
          cite: "The Social Contract, Book I, ch. 6 (tr. Cole)"
        }
      }
    },

    {
      id: "sovereign",
      short: "Who ends up in charge",
      q: "Who gets the power, and what makes it legitimate?",
      answers: {
        hobbes: {
          quote: "This is the generation of that great LEVIATHAN, or rather, to speak more reverently, of that mortal god, to which we owe, under the immortal God, our peace and defence.",
          cite: "Leviathan, Part II, ch. 17"
        },
        locke: {
          quote: "Men being, as has been said, by nature, all free, equal, and independent, no one can be put out of this estate, and subjected to the political power of another, without his own consent.",
          cite: "Second Treatise, ch. 8, §95"
        },
        rousseau: {
          quote: "Sovereignty, for the same reason as makes it inalienable, cannot be represented; it lies essentially in the general will, and will does not admit of representation.",
          cite: "The Social Contract, Book III, ch. 15 (tr. Cole)"
        }
      }
    },

    {
      id: "revolt",
      short: "When you can revolt",
      q: "The people in charge go bad. Can you throw them out?",
      answers: {
        hobbes: {
          quote: "The obligation of subjects to the sovereign is understood to last as long, and no longer, than the power lasteth by which he is able to protect them.",
          cite: "Leviathan, Part II, ch. 21"
        },
        locke: {
          quote: "By this breach of trust they forfeit the power the people had put into their hands... and it devolves to the people, who have a right to resume their original liberty.",
          cite: "Second Treatise, ch. 19, §222"
        },
        rousseau: {
          quote: "The moment the government usurps the Sovereignty, the social compact is broken, and all private citizens recover by right their natural liberty.",
          cite: "The Social Contract, Book III, ch. 10 (tr. Cole)"
        }
      }
    },

    {
      id: "catch",
      short: "The catch",
      q: "What does each deal quietly cost you?",
      answers: {
        hobbes: {
          quote: "There can happen no breach of covenant on the part of the sovereign; and consequently none of his subjects, by any pretence of forfeiture, can be freed from his subjection.",
          cite: "Leviathan, Part II, ch. 18"
        },
        locke: {
          quote: "Whatsoever then he removes out of the state that nature hath provided... he hath mixed his labour with, and joined to it something that is his own, and thereby makes it his property.",
          cite: "Second Treatise, ch. 5, §27"
        },
        rousseau: {
          quote: "Whoever refuses to obey the general will shall be compelled to do so by the whole body. This means nothing less than that he will be forced to be free.",
          cite: "The Social Contract, Book I, ch. 7 (tr. Cole)"
        }
      }
    }
  ]
};
