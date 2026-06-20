/* ============================================================
   The Social Contract, side by side: the breakdowns.
   Per-question, plain-language read of what each thinker says,
   the concrete island handle, and where the three split. Written
   in the site voice (see VOICE.md). No em dashes. Light inline
   HTML (<em>, <b>) is allowed; it is injected as innerHTML by
   js/social-contract.js.

   shape: id: { island, gist, reads:{hobbes, locke, rousseau}, split }
   ============================================================ */
window.SC_NOTES = {

  nature: {
    island: "Forget the rules for a second and just look around the beach. Forty strangers, no police, no judge, no law. Before anyone proposes a single rule, you have to settle one thing: left alone like this, do these people cooperate, or do they go for each other's throats?",
    gist: "This is the question the other four hang on. All three men start in a <em>state of nature</em>, the imagined situation before any government exists, and each one describes a completely different beach.",
    reads: {
      hobbes: "Throats. Hobbes thinks the beach is a slow car crash. With nobody in charge, everyone has a right to everything, your food and your neck included, and people are roughly equal, meaning even the weakest can kill the strongest in their sleep. The result is the most famous phrase in the book: life turns <em>solitary, poor, nasty, brutish, and short</em>. The people here aren't wicked. They're afraid, and the fear is rational: if I don't get you first, you might get me.",
      locke: "Calmer. Locke's people are free and equal but not lawless: there is a <em>law of nature</em>, which is just reason, and it tells everyone to leave each other's life, health, liberty, and possessions alone. The trouble isn't war, it's the missing referee. When you and I clash, each of us is judge in our own case, and that goes bad fast. An inconvenience, not an apocalypse.",
      rousseau: "Wrong beach, says Rousseau. Natural humans were free and basically fine; society is what wrecked them. His book opens on the line everyone half-remembers: <em>man is born free, and everywhere he is in chains</em>. The chains aren't nature's doing. We forged them the day one man fenced off a patch of ground, called it his, and found the rest of us gullible enough to agree."
    },
    split: "The whole argument forks right here, and the fork is a factual claim wearing a mood. Hobbes sees danger and wants order at any price. Locke sees friction and wants a judge. Rousseau sees a paradise we ruined and wants it back. One honest footnote: Rousseau's gentle <em>natural man</em> mostly lives in a different book, his <em>Discourse on Inequality</em> (1755). <em>The Social Contract</em> is less about how nice we once were and more about how to be free again now that the chains are on."
  },

  deal: {
    island: "Someone stands up with a plan: everyone agrees to live under one set of rules, starting now. Sounds fine, until you read the fine print. What are you actually giving up when you sign? The right to settle your own scores? Your stuff? All of it?",
    gist: "A contract is a trade. You give something up to get something back, usually safety and a bit of order. The three men ask for wildly different deposits.",
    reads: {
      hobbes: "Almost everything. Hobbes wants you to hand your right of self-government to one ruler, in full, and to treat whatever that ruler does as if you'd done it yourself. Read the formula closely and the deal isn't with the king at all: it's a promise each person makes to <em>everyone else</em>, that <em>I authorise and give up my right of governing myself to this man... on this condition, that thou give up thy right to him</em>. You all agree, together, to obey one power at once.",
      locke: "Shockingly little. You keep your life, your liberty, and your property, because those were yours before any government and guarding them is the government's only job. The one thing you give up is the right to be your own judge and enforcer: you stop being cop, court, and executioner for your own disputes, and hand just that to the community. Even then, the power you create <em>can never be supposed to extend farther than the common good</em>.",
      rousseau: "Everything, with a twist. Rousseau asks for total surrender, <em>each of us puts his person and all his power in common</em>, which sounds worse than Hobbes until you see who you're surrendering to. Not a king. Everyone, yourself included. You give it all to the whole community and receive it all back as an equal member of it. He calls this the <em>total alienation</em> of each person, and claims it leaves you exactly as free as before."
    },
    split: "Same word, <em>contract</em>, three very different sizes of check. Hobbes asks for nearly all your rights and sends them to one man. Locke asks for a single right, the right to judge your own case, and keeps the government on a short leash. Rousseau asks for all of it but mails it to everyone, so on paper you hand the power to yourself. Whether that last move is genius or a card trick is the argument of the next three hundred years."
  },

  sovereign: {
    island: "Fine, the island needs someone, or something, in charge. A chief? A council? A show of hands every evening? And underneath that: when the thing in charge tells you what to do, why is it allowed to? What makes it legitimate instead of just the biggest person on the beach?",
    gist: "Handing power over is one question. What you hand it <em>to</em>, and why anyone should treat that as legitimate rather than merely strong, is the harder one.",
    reads: {
      hobbes: "One sovereign, as near to absolute as he can build it. Hobbes calls the result a <em>mortal god</em>: a single person or assembly holding all the power, undivided, so there's never a rival strong enough to drag everyone back into war. It's legitimate because you consented at the start and because it keeps the peace. Divide that power, king against parliament, and to Hobbes you've just rebuilt the crack a civil war runs along. He was writing during England's, and meant it literally.",
      locke: "A limited government that rules by consent. Nobody can be <em>subjected to the political power of another, without his own consent</em>, so authority flows up from the governed, not down from God or a strongman. The people appoint a legislature as their agent, the majority decides, and, the key word, the government is a <em>trustee</em> holding power for a purpose, not an owner who gets to keep it. That word <em>trust</em> is quietly load-bearing. It's the hinge the right to revolt swings on later.",
      rousseau: "The people, only the people, and they can't mail it in. For Rousseau sovereignty is the <em>general will</em>, and it can't be handed to a king or even to elected representatives: <em>sovereignty cannot be represented</em>. His jab at England still lands: the English think they're free, but they're only free on election day, and the instant the votes are counted, <em>slavery overtakes it, and it is nothing</em>. Legitimate power is the people ruling themselves in person, or it isn't legitimate."
    },
    split: "This is the cleanest three-way split in the whole comparison. Hobbes piles all power into one undivided sovereign. Locke splits it, caps it, and leases it to elected agents on trust. Rousseau won't lease it at all and says the people must hold it in their own hands. Line up almost any government alive today and it's sitting at one of those three desks."
  },

  revolt: {
    island: "Two years in. The chief is hoarding the food, jailing anyone who complains, and the evening vote quietly stopped happening. Now the question people have died over for all of history: are you allowed to remove them? Or did you sign that right away on the first day?",
    gist: "Every contract needs an exit clause, or it's just a trap with extra steps. This is the question with the highest body count, and the three answers run from <em>almost never</em> to <em>it's practically your duty</em>.",
    reads: {
      hobbes: "Almost never. You authorised the sovereign's actions, so protesting them is really protesting yourself, and there's no contract for the sovereign to breach, because he was never a party to it. There is exactly one exit, and it barely counts as revolt: <em>the obligation of subjects to the sovereign is understood to last as long, and no longer, than the power lasteth by which he is able to protect them</em>. Once he can't protect you, the deal is already dead and you're back on the beach. Short of that, obey.",
      locke: "When they break the trust, you may fire them. Government holds power on trust for the people's good; abuse it, and <em>they forfeit the power... and it devolves to the people, who have a right to resume their original liberty</em>. Who decides the line was crossed? <em>The people shall be judge.</em> Set that beside the Declaration of Independence (<em>it is the Right of the People to alter or to abolish it</em>) and you're reading Locke with the serial numbers barely filed off.",
      rousseau: "The moment the rulers betray the general will. The people never gave their sovereignty away, because they couldn't, it isn't transferable, so the instant a government usurps it, <em>the social compact is broken, and all private citizens recover by right their natural liberty</em>. No basic law is safe from the people assembled, <em>not excluding the social compact itself</em>. It's the most permanently revolutionary of the three, and the most anxious about who, exactly, gets to speak for <em>the people</em>."
    },
    split: "Watch one fact, a bad ruler, split into three verdicts. Hobbes: endure nearly anything, because the alternative is the beach and the beach is worse. Locke: a government that breaks its trust has fired itself, and you may hire another. Rousseau: an illegitimate government was never truly sovereign, so resisting it isn't even rebellion. Locke's verdict got written into the American founding. Rousseau's got quoted by the French Revolution, by its idealists and its executioners alike. And Hobbes's is the one every government quietly reaches for the moment it feels threatened: trust us, the alternative is chaos."
  },

  catch: {
    island: "There's no free island. Each of these three plans solves the problem on the beach by quietly creating a new one. Before you sign anything, read the bill.",
    gist: "A fair comparison has to say the quiet part. Each system, taken seriously, has a failure mode that its own logic makes hard to climb back out of. Here's the price of each.",
    reads: {
      hobbes: "You can never get out. Because the sovereign never signed, <em>there can happen no breach of covenant on the part of the sovereign</em>, so however tyrannical he turns, you have no standing to say he broke the deal. Hobbes looked straight at absolute power and decided it still beat civil war. Plenty of readers since, having watched what absolute power actually does, are not so sure he priced the trade right.",
      locke: "The fine print is about property, and it's darker than it reads on a desert island. Locke roots ownership in labour: <em>whatsoever he removes out of the state that nature hath provided... he hath mixed his labour with... and thereby makes it his property</em>. Tidy enough when it's you and a coconut. But the same argument was turned outward to declare that land farmed the European way was owned, and land lived on by Native Americans was <em>waste</em>, free for the taking. Locke himself held shares in the slave trade and helped draft a slave colony's constitution. The same theory that frees you from a king was used to take a continent from the people already living on it.",
      rousseau: "Three words: <em>forced to be free</em>. Disobey the general will, Rousseau says, and you can be <em>compelled</em> to obey, which <em>means nothing less than that he will be forced to be free</em>. He meant something almost gentle: a person run by their own selfishness isn't really free, and the community can set them straight. But you can hear the trapdoor opening underneath. Whoever gets to define the general will gets to call their own coercion your freedom. Robespierre invoked Rousseau by name during the Terror, and critics from Benjamin Constant to Isaiah Berlin have traced a straight line from <em>forced to be free</em> to the modern totalitarian state."
    },
    split: "None of these is a bug you can patch out. Each price falls straight out of the thing that makes the system work. Hobbes buys peace with a power you're not allowed to check. Locke protects your property with a theory that quietly decided whose property counted. Rousseau makes you free through a <em>will</em> that somebody always has to interpret for you. The honest read isn't that one of the three is the villain. It's that there may be no clean deal, only a choice of which risk you can stand to live with."
  }

};
