# SHOP_PSYCHOLOGY.md — The Dopamine Bible for Sluice's Shops

> **Theme note (2026-05-28):** Two framings here are provisional, not law. (1) "Frontier Soviet" is the current skin; Sluice is heading toward a paid Steam release and the theme may be revisited, so treat the palette and Cyrillic motifs as the present look to match, not a contract. (2) The "dopamine / reward zone" vocabulary describes how a satisfying shop should *feel*, but this is a personal craft project, so the binding part is this doc's own rejection of dark patterns (sections 10.5 and 13: no fake scarcity, no "BEST VALUE" badges, no loot-box obfuscation), which matters all the more once the game is paid. Optimize the player's experience, not conversion.

The canonical research-backed brief for designing every shop, station, and sub-page in Sluice. Read this **before** writing any prompt for shop art, before designing any new shop sub-page, before tuning prices, before placing items on a shelf.

The shop is one of the **two primary dopamine zones** of the game (the other being mining itself). It is the place where survival converts into upgrade. If the shop fails, the entire core loop fails — the player has no reason to mine harder.

This document is a synthesis of:

- Shop UX across ~30 reference games
- Retail and commercial-space design (Apple stores, antique shops, military quartermasters, casinos, hardware counters, fishmongers)
- Behavioral economics (Kahneman/Tversky, Thaler, Schultz)
- Game-feel theory (Steve Swink, Jonathan Blow, Jan Willem Nijman)
- Environmental refuge theory (Appleton, Kaplan)
- Color and shape psychology
- Pixel art design discipline

It applies the synthesis to Sluice's specific aesthetic and core loop.

---

## 1. Why shops matter — the neuroscience of the reward zone

### 1.1 Dopamine fires on prediction, not on receipt

Wolfram Schultz's foundational primate work (1990s) showed that dopamine neurons fire when a reward is **anticipated**, not when it's received. Once a reward is reliably predicted by a cue, the neural firing shifts entirely from the reward to the cue. The cue *becomes* the reward signal.

**Implication for Sluice:** the act of walking into the shop, seeing it, scanning the items — that's where the dopamine release happens. The buy click is anticlimactic compared to the buildup. The shop must be **maximally inviting on entry**, not just functional during transactions.

### 1.2 Variable-ratio reinforcement (Skinner)

Slot machines, social media notifications, and roguelikes all exploit variable-ratio schedules: a reward of unpredictable size on an unpredictable schedule produces the strongest behavioral attachment of any reinforcement schedule.

**Implication:** the shop's commodity board (lobster prices, future markets) is a built-in variable-ratio engine. Players who check the board "just in case prices spiked" are the most engaged. The board must be visually compelling enough to deserve the check.

### 1.3 The peak-end rule (Kahneman)

Players' memory of an experience is dominated by its **peak intensity** and its **ending**. A great shop visit + a great LEAVE animation is remembered far more vividly than ten mediocre visits.

**Implication:** the shop entry should have a "wow" beat (the camera push, the warm light, the abundance reveal). The LEAVE moment should have a satisfying tactile feedback (lever pull, coin clink, door slam). Don't undersell either bookend.

---

## 2. The five psychological pillars

Every design decision in the shop should serve at least one of these. If it doesn't serve any, cut it.

### 2.1 REFUGE

The player is coming from danger (collapsing tunnels, magma, drowning, fuel-out spirals). The shop must trigger the refuge response: warm, enclosed, safe, lit from within.

This is **prospect-refuge theory** (Jay Appleton, *The Experience of Landscape*, 1975): humans evolved to seek environments where they can see out (prospect) but enemies can't easily see in (refuge). A cave with a fire is the archetypal refuge. The shop is a cave with a fire.

**Concrete cues:**
- Warm light source (fire, lamp, candle) visibly casting glow
- Enclosed space (clear ceiling, walls, floor — bounded composition)
- Visible support structure (beams, posts) signaling "this won't collapse"
- Darker periphery, brighter center (you're in the warm middle)
- Soft edges and patina, no sharp geometry
- Color temperature ~2700K-3000K (warm yellow, not cool blue)

**Anti-cues to avoid:** harsh overhead fluorescent feel, cold blue-gray, exposed sky/danger above, sterile symmetry, clinical white surfaces.

### 2.2 ABUNDANCE

Empty shelves trigger scarcity stress. Full shelves trigger comfort and "the world is generous." This is why grocery stores stock display shelves to the brim even when sales are slow, why bakery windows pile pastries impossibly high.

**Concrete cues:**
- Every shelf surface has multiple items
- Items overlap and lean (no clinical spacing)
- Visual stack depth (you can sense more items behind the front row)
- Variety within categories (not "five identical fuel cans" but "two red cans, two green cans, one blue can, label varies")
- Drawers slightly ajar showing tools inside (depth-suggestion)
- Items spilling out of crates onto the floor

**Anti-cues:** evenly-spaced single items, sterile gaps, "one fuel can centered on a shelf," empty drawer fronts, blank wall area at item-level.

### 2.3 ANTICIPATION (endowment preview)

The endowment effect (Thaler) shows that people value items they **already own** more than items they don't. The trick: by *previewing* what the player will own at the next tier, we induce a partial endowment effect. The player begins to identify with the future tier they haven't bought yet.

**Concrete cues:**
- The next tier of every upgradable item visible alongside the current one
- "COMING SOON" panels that hint at future content (the BOARD station's commodity market, future locations)
- Locked items shown greyed/silhouetted, not hidden
- Price tags visible everywhere — the cost is the gateway, not a barrier
- Tier ladders going floor-to-ceiling so the player sees the whole journey

**Anti-cues:** hiding locked items, removing displays of unaffordable goods, "you must reach Lv 10 to see this" gating.

### 2.4 AUTONOMY

Self-determination theory (Deci & Ryan) identifies autonomy as one of three core human motivators. Players need to feel they're *choosing*, not being told what to buy.

**Concrete cues:**
- Multiple parallel paths visible (workshop OR shelf OR board, no forced order)
- No "recommended" tags pushing players toward specific items
- Free roam between stations
- LEAVE SHOP always one click away — no captive sessions
- Prices visible, no hidden fees, no "loot box" obfuscation

**Anti-cues:** "BEST VALUE" badges, modal popups telling players what to buy, locked menus, force-required purchases to progress.

### 2.5 MASTERY (legibility)

Reading a Bloomberg terminal is satisfying because the dense information yields to a trained eye. The shop should reward attention with information density that becomes legible over time.

**Concrete cues:**
- Commodity prices visible at a glance (the Board station)
- Color-coded affordability (green = can afford, red = can't, dim grey = maxed)
- Tier pip strips showing exact upgrade progress
- Numerical specifics ("$48 IRON ORE", not "ore is cheap today")
- A clerk who reacts to the player (head turn, idle animation) — feedback loop

**Anti-cues:** vague descriptors ("good price!"), random color choices, hidden numbers, no feedback on hover.

---

## 3. Color psychology in commerce

Every color in a shop scene must be earning its presence. Below: each color tier with neuroscience-backed connotations and the role it should play.

### 3.1 The dominant warm palette (60-70% of frame)

**Brown / honey wood (#7a4828 family).** Stability, craftsmanship, history. Activates associations with old-growth forest, tavern, cabin. Reads as TRUSTWORTHY. The shop's structural elements (walls, floor, beams, station frames) live here.

**Russet / burnt sienna (#9c5028 family).** Earth, warmth, harvest. Reads as ABUNDANT. Used for the upper wall, accent details, rug.

**Deep mahogany shadow (#3a1810 family).** Anchor weight. Reads as DEPTH. Used for shadows under shelves, beam crevices, drawer interiors.

### 3.2 The premium accent palette (15-20% of frame)

**Brass / aged gold (#d4a838 family).** Premium, valuable, tradition. The single strongest "this is worth your money" signal in commercial design (gold leaf in jewelry stores, brass trim in steakhouses, gold buttons on credit cards). Used for station frames' inner trim, lamp rims, sign brackets, currency.

**Cream / parchment (#e8d098 family).** Hand-made, personal, trustworthy. Hand-written signs outperform printed signs in trust studies. Used for paper signs, price tags, the title sign, chalkboard headers.

**Slate / chalkboard dark (#1a201a family).** Information, current, updated. The chalkboard's authority comes from being **updateable** — chalk implies "this is today's price, it might change tomorrow." Used for the BOARD station background.

### 3.3 The signal palette (5-10% of frame, used SPARINGLY)

**Saturated red (#a01a14 family).** Urgency, action, attention. The brain treats red as "look here NOW." Reserved for:
- Banner signs (station names — players need to read these first)
- The LEAVE SHOP button (priority action)
- Items the player should consider essential (fuel cans, dynamite)

Overusing red causes panic/stress (think of a UI flooded with red error states). Keep below 10% of frame.

**Lamp yellow / warm bulb (#ffd060 family).** Refuge, safety, fire. Used **only as light source halos**, never as a flat painted surface.

**Cool turquoise / blue (#5a8090 family).** Cool relief from the warm dominant. Without a small cool accent the scene becomes monotonous and the eye fatigues. Used for blueprints, the REPAIR KIT box, distant atmospheric haze, rug pattern.

### 3.3.1 Cyrillic on baked background art (amendment)

UI_STYLE.md §7 forbids Cyrillic everywhere because the in-game stencil font is bitmap English-only. **Exception:** decorative Cyrillic baked into background sprite art (propaganda banners, fuel-can labels, posters in the shop interior) is permitted because it is rendered as part of the sprite, not via the stencil font, and does not need to be readable as gameplay information.

Rule of thumb:
- **Atmosphere text** (Soviet propaganda banners, fuel-can stencils, poster slogans): Cyrillic OK if pre-rendered into the sprite.
- **Gameplay text** (chalkboard prices, COMING SOON, $ amounts, station hover labels, dynamic stencils): English only, rendered via the in-game pixel stencil font.

This produces an authentic bilingual depot: Russian-language atmosphere + English-language interface. Real-world parallel: any multinational industrial site.

### 3.4 Forbidden colors

- **Pure white (#ffffff)**: too clinical. Use cream (#e8d098) instead.
- **Pure black (#000000)**: dead, threatening. Use deep brown (#1a0a05) instead.
- **Neon (saturated cyan/magenta/lime)**: cheap, mobile-game, breaks immersion.
- **Cool grey dominant**: depression, sterility. Bank-lobby aesthetic.
- **Pastel anything**: kids' game register. Doesn't fit our world.
- **Purple**: untrustworthy in Western/Russian retail contexts (associated with mourning, royalty-as-distance, mystery).

### 3.5 Color contrast as hierarchy

The shop should have a clear value hierarchy:

- **Brightest pixels (~90-100% value):** lamp bulbs only
- **High value (~70-85%):** cream signs, gold trim, lit wall under lamps
- **Mid value (~40-65%):** wood walls, items, station bodies
- **Low value (~15-35%):** shadows, beam undersides, drawer interiors
- **Darkest (~5-15%):** outline strokes, deep crevices

The eye is drawn to the brightest values first. Place those at points of intended attention (lamp = light source, cream sign = title/info, brass trim = "premium frame around important content").

---

## 4. Shape language and composition

### 4.1 Gestalt principles applied

**Proximity:** items in the same shelf row read as one group. Items in different rows read as different categories. The shop's three stations are visually separated by gaps + frames so they read as three distinct destinations, not one continuous wall.

**Similarity:** all three station banners use the same red color and shape — they read as "the same kind of thing" (interactive stations). The three pendant lamps use the same shape — they read as "the same kind of thing" (light sources). Don't accidentally make a non-interactive decoration use the same shape as an interactive station.

**Closure:** the brain completes incomplete shapes. A station frame that "wraps around" an interior makes that interior read as a destination, even though the frame is just a few brass strips. Don't over-detail the frame; suggest it.

**Continuity:** the eye follows continuous lines. The wood floor planks running perpendicular to the back wall draw the eye toward the stations. The horizontal ceiling beam ties all three stations together as "one shop."

**Figure/ground:** items on the shelves are **figures** against the **ground** of the dark shelf interior. High contrast at the silhouette edge is critical. Without it, items get lost in clutter.

### 4.2 Compositional anchors

**Rule of thirds:** the three stations sit on the **upper third grid line**, eye-level for a standing player. The floor + LEAVE button + decorative crates sit on the **lower third grid line**. The ceiling + signage sits on the **top third grid line**. This isn't accidental — the eye scans these gridlines unconsciously.

**Central anchor (hero shot):** there's a strong vertical spine down the center of the composition: title sign → central station banner → LEAVE SHOP button on the rug. This spine is what the eye locks onto first, then it scans laterally to the side stations.

**Triangulation:** lamps form a triangle (left lamp, right lamp, center title). This stable shape reads as "settled, anchored." Triangles are the most stable composition shape.

**Asymmetric balance:** the composition is **symmetric in layout** (three equal stations) but **asymmetric in content** (each station has different items). Pure symmetry feels clinical/dead; pure asymmetry feels chaotic. The blend feels alive.

### 4.3 Specific shape connotations

- **Rectangles** → stability, professionalism, structure. Good for signs, frames, banners, station bodies.
- **Slightly rounded corners** → friendliness, hand-made. Good for paper signs, banner edges, the LEAVE button.
- **Sharp triangles / stars** → energy, attention, danger. Good for: stars on banners, the rug medallion, decorative ornaments. Used SPARINGLY as visual exclamation points.
- **Circles** → completion, cycle, organic. Good for: lamp bulbs, gear teeth, coin shapes.
- **Curves and arcs** → organic, alive, soft. Good for: lamp shades, sagging banners, paper edges, curl in the rug.
- **Vertical tall shapes** → importance, monument. Good for: corner posts, lamp cords, central title.
- **Horizontal wide shapes** → foundation, stability. Good for: ceiling beam, floor strip, rug, LEAVE button.

### 4.4 Item silhouette discipline

Every item must be recognizable by its **silhouette alone**, before color or interior detail is processed. Two-step legibility test:

1. Reduce the item to a flat black silhouette. Is it identifiable? (A fuel can must look like a fuel can in pure black. A toolbox must look like a toolbox.)
2. Then add color and detail.

Failures look like: items that are similar silhouettes (a small can vs. a small box) become confusing on the shelf. Solution: vary the silhouettes — round vs square vs tall vs wide.

---

## 5. Lighting — the most important psychological lever

### 5.1 The campfire effect

Visible warm light sources trigger an evolutionary refuge response (millennia of "fire = safe, no fire = dark wilderness with predators"). The shop **must** have visible warm light sources as a structural element, not as polish.

Implementation:
- Each light source (lamp, lantern, candle) has a **visible glow halo** on the wall behind it. The halo fades smoothly from bright at the bulb to dark at the edges.
- Halos are **always warm yellow-orange** (~#ffd060 to #ffaa30 fading to transparent), never cool.
- Multiple light sources at slightly different temperatures create depth: pendant lamps slightly cooler, kerosene lantern hotter, candle flame hottest.

### 5.2 Contrast ratio

The shop scene should have a **wide value range** (5% to 95% on the value axis). This signals:
- "I can see clearly inside" (high values present, eyes can scan)
- "There's depth and shadow to explore" (low values present, eye wants to investigate)

A flat-value scene (everything 40-60%) feels boring/stagnant. A too-contrasty scene (everything 0% or 100%) feels harsh/oppressive.

### 5.3 Where the brightest pixels go

Brightest pixels = focal points. Place them where the player's attention should land:
- Lamp bulbs (light source, structural)
- Brass trim on station frames (premium feel + frames the action)
- Gold accents on the title sign (the shop's name, first-read)
- Coin / currency reflections (when the player has money)

### 5.4 Where the darkest pixels go

- Item silhouette outlines (1-px black for legibility)
- Shadows under shelves (depth + grounding)
- Beam crevices (architectural depth)
- Drawer interiors (depth-suggestion + abundance)
- Behind partially-obscured items (figure/ground)

### 5.5 Light directionality

All light in the shop comes **from above** (lamps hanging from ceiling) plus **one bright accent** from the lantern at floor level. This means:
- Highlights on items appear on their TOP surfaces (1-px brighter pixel along top edge)
- Shadows fall BELOW items (1-px darker pixel below + small shadow on the surface beneath)
- Vertical surfaces (walls, station fronts) are slightly brighter at top, slightly darker at bottom
- Horizontal surfaces (shelves, floor, rug) are uniformly lit by the overhead

Consistency of light direction is a **subconscious authenticity signal**. Inconsistent light direction makes scenes feel uncanny even if the player can't articulate why.

---

## 6. The dopamine architecture in practice

### 6.1 Anticipation > consumption

Dopamine fires on the *predicted* reward, not the received one. Therefore:

- Make the SHOP ENTRY the peak experience (camera push, light reveal, abundance)
- Make the BUY ACTION mechanically satisfying (lever pull, coin clink, item appears) but not the dramatic peak
- Make the EXIT clean and quick — no drawn-out goodbye

### 6.2 The "loot anticipation" loop

Cycle every shop visit:
1. **Entry:** "I survived. I have money. What can I get?"
2. **Browse:** "Look at all this stuff. I want this, this, this."
3. **Tier reveal:** "Holy crap, look how much better the Lv 7 drill is."
4. **Buy:** "Mine, finally."
5. **Anticipation of next:** "Next run I'll be able to afford the next thing."
6. **Exit:** "Back to the mines."

Every step in this loop is a small dopamine hit. Skip any step and the loop weakens.

### 6.3 Variable-ratio reward (the commodity board)

The Board station is a built-in slot machine. Lobster prices fluctuate per visit. Players who:
- Buy lobsters when cheap (anticipating future high price)
- Sell when high
- Watch the chalkboard each visit

...are exhibiting variable-ratio reward behavior. The board MUST be visually compelling enough to *deserve* the check. Plain text won't work; a chalkboard with sparklines, with chalk-mark-style prices, with old notices pinned around it, becomes the most-checked element of the shop.

### 6.4 Diegetic feedback (lever > button)

A click on a button releases minimal dopamine. A pull on a physical lever — with visible movement, sound, mechanical consequence — releases significantly more.

Compare:
- "BUY [✓]" (modal button) — low feedback
- Pull a brass lever → lever swings → coins splash from your pile → drawer slides open → item slides out → drawer closes → lever resets → "+1 BOMB" stamps onto a paper receipt — high feedback

This is why arcade machines have physical buttons with travel and sound. The "juice" is the dopamine.

Implementation rule: **every transaction in the shop is a multi-stage diegetic animation, not a button press.**

---

## 7. Materials and patina (authenticity)

### 7.1 Why patina matters

Pristine surfaces feel fake (showroom, render, advertisement). Worn surfaces feel real (lived-in, trusted, history). The brain reads patina as "this place has survived; therefore this place is reliable."

Every wooden surface should have at least one of:
- A small dent or scuff
- An oil stain or burn mark
- A nail hole or seam
- A coffee/water ring
- A faint scratch

Every metal surface should have at least one of:
- Tarnish at edges
- Rust streak from a fastener
- Worn-bright spot where it's been touched
- Tool-mark scratches

Every paper surface should have at least one of:
- A curling corner
- A water spot
- A pinhole at a corner
- Aging discoloration toward the bottom

### 7.2 The "history layer"

Add 2-3 elements that suggest the shop has a past:
- A framed photo behind the counter
- A small souvenir mineral on a shelf
- A handwritten note nobody bothered to take down
- An old receipt pinned for years
- A mug ring on the workbench
- A shop cat on a shelf (extreme but works)

These elements serve **no functional purpose** but they make the shop feel like a place that existed before the player walked in and will exist after they leave. This is what separates a memorable shop from a generic one.

### 7.3 The "personality" layer

The shop should have a voice. Hand-painted plaques, idiomatic taglines:
- "DIG DEEP. SELL HIGH." (REDSTONE TRADING POST)
- "STRONG MINERS SAFE RETURNS"
- "WORK HARD PROFIT MORE"
- "STRIKE IT RICH OR DIE TRYING"
- "STAKE YOUR CLAIM"

Frontier-Soviet voice: terse, motivational, slightly grim. Not "Welcome to the shop! (smiley)" — that voice is forbidden by the bible.

---

## 8. Choice architecture

### 8.1 Hick's Law

Decision time scales with the **logarithm** of the number of choices. 4 choices = ~2.4 units of decision time. 16 choices = ~4 units. 64 choices = ~6 units. **Choice paralysis hits hard above ~7 visible options at once.**

The shop's solution: hierarchical layering.
- Floor level: 3 stations (sub-7) — easy first decision
- Inside a station: ~7 items (right at the limit) — manageable
- Inside an item's detail card: 1 buy action

Never present more than ~7 items at once in any single visual cluster. If a station outgrows 7, split it (the workshop's gear/special split, the shelf scrolling, etc.).

### 8.2 Anchoring and price perception

Players judge a price as expensive or cheap relative to **what's nearby**. Display the next-tier upgrade beside the current one and the current tier feels affordable by contrast.

The tier ladder visualization (per UI_STYLE.md §16) does this naturally: showing all 7 drill tiers with prices makes any single tier look reasonable, because the eye relativizes against the full range.

### 8.3 Decoy effect

If you offer two items at $50 and $100, sales split. If you add a third item at $90 with worse stats than the $100, sales of the $100 spike (the $90 makes the $100 look like a deal).

For Sluice v1, we don't need to engineer this — but it's worth knowing for future commodity pricing or special-offer mechanics.

### 8.4 Scarcity cues (used carefully)

"Only 3 left in stock" is a real conversion lever. We'll use it lightly:
- Consumables show their stock count, but stock is unlimited from the player's perspective (the shop never sells out)
- Commodity prices show a "TODAY'S PRICE — DAY 47" framing (urgency without artificial scarcity)
- "COMING SOON" tags on locked features (anticipation)

Never use fake scarcity ("LIMITED TIME OFFER!") — it's a trust killer.

### 8.5 Default biases

Players don't change defaults. Don't pre-select an item, don't auto-buy, don't recommend. Every action is the player's deliberate pull. This serves AUTONOMY (§2.4).

---

## 9. Game shop case studies

### 9.1 Resident Evil 4 — The Merchant

**What it does:** A single character standing behind a cloth-on-rope display, items hanging from chains. He greets the player ("What're ya buyin'?"). One screen. Zero menu chrome.

**Why it works:**
- Pure diegetic — the merchant IS the UI
- Item silhouettes hung in space, one tap selects
- Memorable voice line acts as a session-start dopamine cue
- Same merchant in different locations = continuity reward
- Quick exit, never captive

**Take for our shop:** the clerk silhouette is the right idea. Possibly add an idle voice cue (deferred per UI_STYLE.md §17).

### 9.2 Stardew Valley — Pierre's General Store / Joja Mart

**What it does:** Walk into a top-down room with shelves of physical sprites. Talk to NPC, list opens. Daily rotating stock for some items (seeds).

**Why it works:**
- Shop is a *place you walk into* — the camera doesn't push, you literally enter
- NPCs have personality (Pierre ingratiating, Joja corporate-cold)
- Daily rotation creates anticipation ("What's in stock today?")
- Pricing varies — fish vendor pays more for certain fish on certain days

**Take for our shop:** the daily rotation idea maps to the commodity board. The "NPC personality" idea is in the bible (§15.7 clerk).

### 9.3 Hades — Charon

**What it does:** Dark hooded character behind a counter, items float on a tray above him. Single click each. Limited rotating stock per visit.

**Why it works:**
- The mystery (you can't fully see Charon's face) creates curiosity
- Floating items on the tray look "presented" rather than "displayed"
- Charon never speaks — adds mythic gravitas
- Limited stock = "I should buy now" urgency
- Each item has a single icon, single price — Hick's-Law compliant

**Take:** the "items presented on a tray" framing is great. Our SHELF station has this energy. The mystery of the clerk is worth keeping (no dialogue, just presence).

### 9.4 Recettear: An Item Shop's Tale

**What it does:** YOU run the shop. Customers haggle. Set prices, manage shelves, restock. Daily market-price fluctuations.

**Why it works:**
- Total ownership of the shop process
- Variable-ratio rewards (some customers pay more)
- Visible inventory management
- The price-haggling animation is satisfying (cha-ching coin sound, customer reaction)

**Take:** the audio-visual feedback on a transaction is the gold standard. Our lever-pull → coin-splash should aspire to this level of "juice."

### 9.5 Hollow Knight — Sly / Salubra / Iselda

**What it does:** Each vendor is a character in their own room. Items shown as illustrations. Geo cost stenciled.

**Why it works:**
- Each shop has a *vibe* — Sly's general store feels different from Iselda's map shop
- Items are big, beautifully illustrated
- Flavor text on items (description hovers) adds depth
- Music shifts on entry (audio refuge cue)

**Take:** the per-room vibe is what we get with the WORKSHOP / BOARD / SHELF split. Each station has a slightly different palette, lighting, content type — variety within unity.

### 9.6 Spelunky / Noita — physical shopkeepers

**What it does:** Items lie on the ground with floating price tags. Pick up + walk out without paying = shopkeeper attacks.

**Why it works:**
- Maximum diegesis — items are *in the world*
- Shopkeeper enforcement creates real stakes
- Price tags float above items (hover affordance)
- No menus at all

**Take:** floating price tags above items is a great pattern. Our shelf items use this directly.

### 9.7 Borderlands — Vending machines

**What it does:** Big chunky machines with rotating colored flair, animated dispenser, branded mascots, daily deals.

**Why it works:**
- Strong silhouette per machine type (red = ammo, blue = guns, green = health)
- Animated sounds, lights, mascots — extreme juice
- Daily deal creates urgency
- Single-screen UI, fast purchase

**Take:** the chunky physical machine aesthetic is more cartoonish than our Frontier Soviet style, but the **strong silhouette per category** principle applies. Our three stations achieve this through banner color + station body content.

### 9.8 Slay the Spire — the shop room

**What it does:** Single screen with ~10 items (cards, relics, potions, card-removal). Numbers turn red if unaffordable. Limited stock per visit.

**Why it works:**
- Clean information density
- Affordability immediately visible (red = no, green = yes)
- Limited stock creates "buy now or lose it" tension
- Small but rich rewards (each card is a meaningful choice)

**Take:** the affordability color-coding is essential. Already in our spec (green = afford, red = can't).

### 9.9 RE2 Remake — Mr. Raccoon trader (NA exclusive)

**What it does:** Rare special vendor in remote rooms. Trades for unique items. Limited interactions.

**Why it works:**
- Surprise / discovery — finding the trader is its own reward
- Currency is uncommon (special tokens), making each transaction feel weighty
- Lore-rich

**Take:** future towns / hidden traders could replicate this — special vendors with non-cash currencies (deep ore samples, rare specimens, etc.). Out of v11 scope.

### 9.10 Animal Crossing — Tom Nook's Cranny + Stalk Market

**What it does:** Small shop, daily rotating inventory. Sunday-only turnip purchases. Weekday-fluctuating turnip prices.

**Why it works:**
- The Stalk Market is a perfect variable-ratio engine
- Players keep notebooks of daily prices
- The shop itself is visually inviting (warm lighting, cute fixtures)

**Take:** the turnip mechanic is the **direct inspiration for our commodity board**. Same psychology, different aesthetic.

---

## 10. Retail and commercial design parallels

### 10.1 Apple Store (anti-pattern for our purposes)

White, sterile, evenly spaced products on minimalist tables, no patina. Optimized for **product as hero**. Works for selling iPhones; would feel cold and unwelcoming for our miner returning from danger.

**Take:** explicitly avoid this aesthetic. It's the inverse of refuge.

### 10.2 Hardware store / auto parts counter

Items behind a counter on numbered shelves. Customer asks for part by number. Clerk retrieves from a back room. Visible inventory in pegboards, drawers labeled by SKU.

**Take:** the WORKSHOP station's pegboard pattern, drawer cabinet, and "ask the clerk for the part" model maps directly. The clerk fetches from a deep storage we never see.

### 10.3 Pawnshop window display

Items densely stacked in a glass case, handwritten price tags. Slightly chaotic but organized — the eye finds visual richness everywhere it lands.

**Take:** the SHELF station follows this pattern. Density, variety, handwritten tags.

### 10.4 Antique shop interior

Cluttered, lit by lamps, full of stories per object. The visitor wants to spend time, browse, touch, ask questions. Maximum engagement.

**Take:** the patina layer (§7) and personality layer (§7.3) come straight from antique shop psychology.

### 10.5 Casino floor

Warm lighting (no clocks), red and gold accents, free drinks, intermittent reward sounds, no clear exit cues. **We borrow the warm lighting and the variable-reward visuals; we explicitly reject the dark-pattern captive design.**

The shop should feel **inviting like a casino** but **respect the player's time like a hardware store**. Easy entry, easy exit, no manipulation.

### 10.6 Military quartermaster window

Soldier presents requisition slip, clerk hands over kit, manifest cards on each crate. Industrial, no-nonsense, function-first.

**Take:** the Frontier Soviet flavor sign on the LEAVE button + the quartermaster clerk silhouette + the manifest-style price tags borrow from this.

### 10.7 Fishmonger / dock chalkboard

Today's catch chalked on a slate, prices that move with supply, hand-updated. The most authentic real-world parallel for our commodity board.

**Take:** the BOARD station is a literal chalkboard. Prices are chalked. Old notices pinned around. The aesthetic comes from a New England lobster boat dock.

---

## 11. Pixel art specific principles

### 11.1 Silhouette legibility

Pixel art lives or dies on silhouettes. Every item, every station, every distinct shape must read at:
- 100% scale (zoomed sub-page)
- 50% scale (floor view)
- Pure black (silhouette test)

If two items become indistinguishable at any of these tests, they're broken. Vary their shapes, not just their colors.

### 11.2 Outline discipline

Every distinct object is silhouetted with a 1-px black outline (BLD.outline `#1a0a05`). This makes the figure-ground separation crisp.

Exception: very dark objects (where the black outline would be invisible against their own color) get a dark-brown outline instead. Still readable.

### 11.3 Pixel-cluster rules

Clusters of 1×1 single pixels = noisy, hard to read. Always cluster pixels into 2×2 or larger units when possible. The eye reads chunks, not points.

Exception: 1-px highlights (a bright single pixel on top of an item) sells "metal sheen" or "glass glint" effectively. Reserve for these.

### 11.4 Palette discipline

Limit each scene to ~24-32 distinct colors. The reference image probably uses ~28. More than this and the palette feels chaotic; fewer and it feels flat.

Each color in the palette earns a role:
- Structure colors (browns, walls)
- Item colors (varying for variety)
- Light source colors (warm yellows)
- Outline color (single near-black)
- Accent colors (the saturated reds/golds)

### 11.5 Anti-aliasing rule

Outlines and structural pixels: **never anti-aliased**. Soft glows from light sources: gradient is OK if implemented as discrete bands of decreasing opacity (not smooth blur). Text: never anti-aliased.

### 11.6 Resolution targeting

Source art: 4K (3840×2160) or higher.
Native shop display: 1920×1080 (the room area inside the canvas, fitted to `viewW × (viewH - 88)`).
Render: nearest-neighbor scale (`imageSmoothingEnabled = false`) so pixels stay crisp at any device resolution.

This means the artwork is generated bigger than needed and downscaled once at integration. Never the reverse — never upscale low-res to high-res.

---

## 12. Synthesis — the Sluice shop checklist

Every shop, station, and sub-page must pass:

### 12.1 Refuge ✓
- [ ] Visible warm light source(s) with halo
- [ ] Enclosed composition (clear top, sides, bottom)
- [ ] Warm dominant palette
- [ ] Soft edges and patina, no cold geometry

### 12.2 Abundance ✓
- [ ] Every shelf surface has multiple items
- [ ] Items overlap, lean, suggest depth
- [ ] No empty mid-shelf gaps
- [ ] Variety within categories

### 12.3 Anticipation ✓
- [ ] Locked / future content is visible (not hidden)
- [ ] Tier ladders show full upgrade journey
- [ ] Prices visible everywhere
- [ ] "Coming Soon" panels tease future depth

### 12.4 Autonomy ✓
- [ ] Multiple paths visible (no forced order)
- [ ] No "recommended" or "best" tags
- [ ] LEAVE always one click away
- [ ] No captive sessions

### 12.5 Mastery ✓
- [ ] Information density rewards attention
- [ ] Color-coded affordability
- [ ] Specific numbers, not vague labels
- [ ] Clerk reacts to player

### 12.6 Color discipline ✓
- [ ] 60-70% warm browns/russets
- [ ] 15-20% brass/cream (premium)
- [ ] 5-10% saturated red (signal only)
- [ ] No forbidden colors (§3.4)

### 12.7 Lighting ✓
- [ ] Visible light sources with warm halos
- [ ] Wide value range (5-95%)
- [ ] Consistent light direction
- [ ] Brightest pixels at focal points

### 12.8 Composition ✓
- [ ] Rule of thirds gridlines respected
- [ ] Central spine anchor
- [ ] Symmetric layout, asymmetric content
- [ ] Triangulated focal points

### 12.9 Patina ✓
- [ ] Wear marks on surfaces
- [ ] History elements (photos, mementos, old notices)
- [ ] Frontier Soviet voice on flavor text

### 12.10 Pixel discipline ✓
- [ ] Silhouette test passes for every item
- [ ] 1-px outlines on figures
- [ ] No anti-aliasing on outlines/text
- [ ] Source generated 4K+, displayed at 1920×1080

---

## 13. Anti-patterns — explicitly forbidden

The shop must never:

1. Use modal dialog boxes (UI_STYLE.md §10.10)
2. Use floating screen-space text (UI_STYLE.md §2 axis 4)
3. Use cool-grey dominant palette (clinical, kills refuge)
4. Auto-recommend purchases (kills autonomy)
5. Show "BEST VALUE" or "SALE!" badges (cheap, F2P aesthetic)
6. Use captive design (countdown timers, "must buy to leave," etc.)
7. Use pure white surfaces (sterile)
8. Use chatty / casual copy ("Welcome friend! (smiley)")
9. Show empty shelves or empty mid-shelf gaps
10. Use unclear / random color choices for affordability
11. Use generic fantasy tropes (potions, scrolls, magic items) — this is industrial mining
12. Use stock-photo style (it's hand-drawn pixel art only)
13. Use anti-aliased text (the v11 stencil font is bitmap-only)
14. Hide locked content (preview, don't conceal)
15. Use sound that violates Frontier Soviet voice (no chimes, no sparkles — clanks, rivets, lever-pulls only when sound lands)

---

## 14. Prompt template

When generating new shop scenes (sub-pages, future towns, special vendors), inherit from this template:

```
HIGH-RESOLUTION HAND-DRAWN PIXEL ART. Generate at 4K (3840x2160) or
higher — larger source = crisper output. 16:9 aspect ratio.

PSYCHOLOGICAL BRIEF:
This scene is a [REFUGE / ABUNDANCE / ANTICIPATION / MASTERY] zone after
the player [SURVIVED A MINING RUN / LOCATED A SECRET / etc].
The player should feel [SAFETY / REWARD / TEMPTATION / PRIDE].

COMPOSITION:
- Rule of thirds with central vertical spine
- Symmetric layout, asymmetric content
- Triangulated focal points (3 light sources + 3 stations or similar)

PALETTE:
- Dominant: warm honey-brown wood, russet walls, deep mahogany shadows
- Premium accent: brass / aged gold trim, cream parchment
- Signal accent (sparing): saturated red for action items, warm yellow
  for light halos only, cool turquoise for one cool-relief element
- Forbidden: pure white, pure black, neon, cool grey dominant, pastels

LIGHTING:
- Multiple visible warm light sources (lamps, lantern, candle)
- Each light source has a visible warm halo on the surface behind
- Brightest pixels at focal points (lamp bulbs, brass trim, gold sign)
- Wide value range: deep shadows + bright lit areas
- Consistent light from above + accent at floor level

ELEMENTS:
[Specific element list for this scene]

PATINA / DETAIL:
- Wear marks, dents, oil stains on wood
- Tarnish on brass, rust streaks on iron
- Curling paper corners, water rings on tags
- 2-3 history elements (photos, mementos, old notices)
- Cobwebs in corners (very small)

STYLE:
Pixel art ~16-bit-SNES detail level, hand-drawn quality. Heavy 1-px
black outlines on every distinct object. Soft warm radial lamp halos.
Subtle ambient occlusion under shelves and beams. Crisp pixel edges
throughout, no anti-aliasing. Authentic [SOVIET / WESTERN / etc.]
mining-camp aesthetic. NO modern elements. NO generic fantasy. NO
text in [WRONG SCRIPT]. Frontier-industrial.

OUTPUT: 4K (3840x2160) minimum, 16:9, clean PNG, no watermark.
```

---

## 15. Living document

This bible is intended to grow:

- When a new station / sub-page is designed, add a section documenting its specific psychology
- When a new town theme is added, add its palette + cultural references here
- When a player playtest reveals a friction point, document the fix and the principle behind it
- When a reference image is approved as canon, add it to a `references/` folder and link here

The shop is the dopamine engine. Treat it like the most important system in the game, because it is.

---

*Last reviewed: v11.14 | UI_STYLE.md companion | See also: BUILDING_STYLE.md, BACKGROUND_STYLE.md, MINERALS_BIBLE.md*
