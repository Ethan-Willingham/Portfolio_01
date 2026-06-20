  /* ---- Item registry (the economy dataset) ----
     The canonical list of every economy item: raw ores / liquids / slimes,
     the Sluice's refined outputs, Noita reaction products, components, the
     goods towns manufacture, and the gear you craft. Ported from the designed
     economy in item-map-lab.html (research/13-item-economy.md): that interactive
     map is the design VIEW, this is the in-game SOURCE OF TRUTH the Sluice, the
     market / board, crafting, and the codex all read.

     Schema per item: { id, name, fam, tier, value, recipe?, use }
       id      short stable key (e.g. 'fei' = iron ingot). A DESIGN namespace,
               NOT the live ORES keys (which drive mining); see the note below.
       fam     one of ITEM_FAMS: ore liquid slime refined reaction component good gear
       tier    0..7 depth band (ITEM_TIERS) = the progression axis
       value   DESIGN-RELATIVE balance value (research draft). The real money a
               unit fetches is resolved by the CONSUMER: a raw ore uses the live
               ORES value; everything else derives from its recipe + the value
               curve. Treat `value` here as the balance hint, not a sell price.
       recipe  inputs [[inputId, qty], ...]; absent for raw (mined / pumped / extracted)
       use     one-line design intent / flavor

     RECONCILIATION NOTE: the ore-family ids here are DESIGN ids (cu, fe, au ...)
     and several have no live ore yet (tin, nickel, titanium ... = the planned
     new ores). Mapping design ore ids to live ORES keys is a Sluice-phase job,
     deliberately left out here so this stays a clean, inert data layer.

     Nothing consumes this yet (Phase 0 foundation): it is the spine the Sluice
     plugs into next. Names are econ-prefixed to avoid clashes in this shared file. */
  var ITEM_FAMS = [
    { id: 'ore', label: "Ore (raw)", color: '#cf9b3a' },
    { id: 'liquid', label: "Liquid", color: '#3f8fd0' },
    { id: 'slime', label: "Slime", color: '#8ec63f' },
    { id: 'refined', label: "Refined", color: '#e07a2c' },
    { id: 'reaction', label: "Reaction", color: '#d8456f' },
    { id: 'component', label: "Component", color: '#2bb6a0' },
    { id: 'good', label: "Good (town)", color: '#cbb24b' },
    { id: 'gear', label: "Gear (you)", color: '#9a78dd' },
  ];
  var ITEM_TIERS = ['Surface', 'Shallow', 'Upper', 'Mid', 'Deep', 'Lower', 'Hazard', 'Abyss'];
  var ITEM_TIER_DEPTH = ['0-30m', '30-80m', '80-160m', '160-300m', '300-460m', '460-680m', '680-920m', '920m+'];

  var ITEM_DEFS = [
    // ORE (RAW)
    { id: 'coal', name: "Coal", fam: 'ore', tier: 0, value: 5, use: "Fuel. Burns in the Sluice and the forge." },
    { id: 'cu', name: "Copper", fam: 'ore', tier: 0, value: 7, use: "The first progression metal." },
    { id: 'sn', name: "Tin", fam: 'ore', tier: 0, value: 9, use: "Pairs with copper for bronze." },
    { id: 'fe', name: "Iron", fam: 'ore', tier: 1, value: 14, use: "Backbone metal of the whole economy." },
    { id: 'bx', name: "Bauxite", fam: 'ore', tier: 1, value: 18, use: "Smelts to aluminum." },
    { id: 's', name: "Sulfur", fam: 'ore', tier: 1, value: 16, use: "Energetic. Makes acid and powder." },
    { id: 'np', name: "Saltpeter", fam: 'ore', tier: 1, value: 12, use: "Energetic salt for gunpowder." },
    { id: 'ag', name: "Silver", fam: 'ore', tier: 2, value: 32, use: "Precious and conductive." },
    { id: 'pb', name: "Galena", fam: 'ore', tier: 2, value: 38, use: "Lead ore. Shielding and shot." },
    { id: 'py', name: "Pyrite", fam: 'ore', tier: 2, value: 28, use: "Fool's gold. Hides real gold under acid." },
    { id: 'amy', name: "Amethyst", fam: 'ore', tier: 2, value: 50, use: "Common gem. Cuts to lustre." },
    { id: 'tq', name: "Turquoise", fam: 'ore', tier: 2, value: 45, use: "Common gem." },
    { id: 'au', name: "Gold", fam: 'ore', tier: 3, value: 80, use: "Currency metal." },
    { id: 'co', name: "Cobalt", fam: 'ore', tier: 3, value: 95, use: "Alloying metal, heat-tough." },
    { id: 'mag', name: "Magnetite", fam: 'ore', tier: 3, value: 70, use: "Iron oxide, thermite input." },
    { id: 'ni', name: "Nickel", fam: 'ore', tier: 3, value: 85, use: "Alloying metal." },
    { id: 'jd', name: "Jade", fam: 'ore', tier: 3, value: 115, use: "Mid gem." },
    { id: 'pd', name: "Peridot", fam: 'ore', tier: 3, value: 100, use: "Mid gem." },
    { id: 'lz', name: "Lapis", fam: 'ore', tier: 3, value: 105, use: "Mid gem, pigment." },
    { id: 'mal', name: "Malachite", fam: 'ore', tier: 3, value: 88, use: "Copper gem." },
    { id: 'pt', name: "Platinum", fam: 'ore', tier: 4, value: 190, use: "Deep precious metal." },
    { id: 'u', name: "Uranium", fam: 'ore', tier: 4, value: 250, use: "Energetic. Refines to fuel rods." },
    { id: 'w', name: "Tungsten", fam: 'ore', tier: 4, value: 175, use: "Hard high-melt metal." },
    { id: 'mi', name: "Methane Ice", fam: 'ore', tier: 4, value: 165, use: "Volatile. Refines to gas." },
    { id: 'rb', name: "Ruby", fam: 'ore', tier: 4, value: 290, use: "Deep gem." },
    { id: 'em', name: "Emerald", fam: 'ore', tier: 4, value: 275, use: "Deep gem." },
    { id: 'tz', name: "Tanzanite", fam: 'ore', tier: 4, value: 310, use: "Deep gem." },
    { id: 'rh', name: "Rhodochrosite", fam: 'ore', tier: 4, value: 205, use: "Deep gem." },
    { id: 'ti', name: "Titanium", fam: 'ore', tier: 5, value: 430, use: "Very deep structural metal." },
    { id: 'ir', name: "Iridium", fam: 'ore', tier: 5, value: 620, use: "Very deep rare metal." },
    { id: 'cn', name: "Cinnabar", fam: 'ore', tier: 5, value: 390, use: "Refines to quicksilver." },
    { id: 'amb', name: "Amber", fam: 'ore', tier: 5, value: 365, use: "Organic. Resin and inclusions." },
    { id: 'fo', name: "Fossil", fam: 'ore', tier: 5, value: 410, use: "Organic. Refines to oil." },
    { id: 'op', name: "Opal", fam: 'ore', tier: 5, value: 540, use: "Very deep gem." },
    { id: 'gt', name: "Garnet", fam: 'ore', tier: 5, value: 460, use: "Very deep gem." },
    { id: 'ob', name: "Obsidian", fam: 'ore', tier: 6, value: 820, use: "Hazardous glassy rock." },
    { id: 'dia', name: "Diamond", fam: 'ore', tier: 6, value: 1350, use: "Hazard-tier gem." },
    { id: 'os', name: "Osmium", fam: 'ore', tier: 6, value: 940, use: "Densest metal." },
    { id: 'vr', name: "Voidrock", fam: 'ore', tier: 6, value: 1150, use: "Exotic. Reacts with magma to void glass." },
    { id: 'aeth', name: "Aetherite", fam: 'ore', tier: 6, value: 1050, use: "Catalytic exotic ore." },
    { id: 'pn', name: "Painite", fam: 'ore', tier: 7, value: 1950, use: "Abyssal gem, rarest natural." },
    { id: 'unob', name: "Unobtanium", fam: 'ore', tier: 7, value: 2700, use: "Endgame structural exotic." },
    { id: 'qn', name: "Quintessite", fam: 'ore', tier: 7, value: 3300, use: "Catalytic endgame ore." },
    { id: 'sc', name: "Starcore", fam: 'ore', tier: 7, value: 3700, use: "The deepest find." },
    // LIQUID
    { id: 'h2o', name: "Water", fam: 'liquid', tier: 0, value: 2, use: "The default Sluice wash. Standard refine." },
    { id: 'crude', name: "Crude Slick", fam: 'liquid', tier: 1, value: 8, use: "Oil. Fuel and organics." },
    { id: 'acr', name: "Acidic Runoff", fam: 'liquid', tier: 1, value: 12, use: "Wild acid pocket. Strips ore." },
    { id: 'slr', name: "Mineral Slurry", fam: 'liquid', tier: 2, value: 15, use: "Suspended ore. Reaction base." },
    { id: 'brn', name: "Thermal Brine", fam: 'liquid', tier: 2, value: 18, use: "Hot salt. Quenching and leaching." },
    { id: 'glw', name: "Glowwater", fam: 'liquid', tier: 3, value: 30, use: "Luminescent. Charges reactions." },
    { id: 'lava', name: "Magma", fam: 'liquid', tier: 4, value: 60, use: "Molten wash. Smelts and fuses." },
    { id: 'bm', name: "Bloodmoss Extract", fam: 'liquid', tier: 5, value: 90, use: "Organic deep seep." },
    { id: 'vs', name: "Void Seep", fam: 'liquid', tier: 6, value: 120, use: "Exotic liquid from the deep dark." },
    { id: 'nul', name: "Null Liquid", fam: 'liquid', tier: 7, value: 300, use: "Rare. The strangest wash of all." },
    // SLIME
    { id: 'gel', name: "Common Gel", fam: 'slime', tier: 1, value: 10, use: "Inert jello. Binder and base." },
    { id: 'csl', name: "Conductive Slime", fam: 'slime', tier: 2, value: 40, use: "Carries charge." },
    { id: 'xsl', name: "Corrosive Slime", fam: 'slime', tier: 3, value: 55, use: "Eats rock. Hazard and tool." },
    { id: 'vsl', name: "Volatile Slime", fam: 'slime', tier: 4, value: 80, use: "Unstable. Energetic reactions." },
    { id: 'asl', name: "Amplifier Slime", fam: 'slime', tier: 5, value: 150, use: "Buffs ore value in a reaction." },
    { id: 'dsl', name: "Devourer Slime", fam: 'slime', tier: 6, value: 5, use: "Destroys value. Pure hazard, extract fast." },
    { id: 'lsl', name: "Living Slime", fam: 'slime', tier: 7, value: 400, use: "Reactive. The key to living metal." },
    // REFINED
    { id: 'coke', name: "Coke", fam: 'refined', tier: 0, value: 25, recipe: [['coal', 2]], use: "Refined fuel for hot smelting." },
    { id: 'cui', name: "Copper Ingot", fam: 'refined', tier: 0, value: 30, recipe: [['cu', 3]], use: "Wire and circuitry base." },
    { id: 'sni', name: "Tin Ingot", fam: 'refined', tier: 0, value: 38, recipe: [['sn', 3]], use: "Bronze input." },
    { id: 'brz', name: "Bronze", fam: 'refined', tier: 1, value: 75, recipe: [['cui', 2], ['sni', 1]], use: "First alloy. Tools and trim." },
    { id: 'fei', name: "Iron Ingot", fam: 'refined', tier: 1, value: 60, recipe: [['fe', 3]], use: "Feeds nearly everything." },
    { id: 'alu', name: "Aluminum", fam: 'refined', tier: 1, value: 85, recipe: [['bx', 4]], use: "Light metal. Glass and beams." },
    { id: 'acid', name: "Acid", fam: 'refined', tier: 1, value: 70, recipe: [['s', 3]], use: "Reagent and alternate Sluice wash." },
    { id: 'stl', name: "Steel", fam: 'refined', tier: 2, value: 160, recipe: [['fei', 2], ['coke', 1]], use: "The workhorse alloy." },
    { id: 'agb', name: "Silver Bullion", fam: 'refined', tier: 2, value: 140, recipe: [['ag', 4]], use: "Currency and contacts." },
    { id: 'pbi', name: "Lead Ingot", fam: 'refined', tier: 2, value: 150, recipe: [['pb', 4]], use: "Shielding and ammunition." },
    { id: 'clu', name: "Cut Gem (Lustre)", fam: 'refined', tier: 2, value: 180, recipe: [['amy', 2]], use: "Cut common gems. Jewelry input." },
    { id: 'aub', name: "Gold Bullion", fam: 'refined', tier: 3, value: 330, recipe: [['au', 4]], use: "High-value currency metal." },
    { id: 'coa', name: "Cobalt Alloy", fam: 'refined', tier: 3, value: 490, recipe: [['co', 2], ['ni', 2]], use: "Heat-tough alloy for frames." },
    { id: 'ptb', name: "Platinum Bullion", fam: 'refined', tier: 4, value: 770, recipe: [['pt', 4]], use: "Precious and catalytic." },
    { id: 'fr', name: "Fuel Rod", fam: 'refined', tier: 4, value: 1000, recipe: [['u', 4]], use: "Power source." },
    { id: 'vg', name: "Volatile Gas", fam: 'refined', tier: 4, value: 520, recipe: [['mi', 3]], use: "Bottled fuel and explosive." },
    { id: 'cbr', name: "Cut Gem (Brilliant)", fam: 'refined', tier: 4, value: 720, recipe: [['rb', 2]], use: "Cut deep gems." },
    { id: 'tip', name: "Titanium Plate", fam: 'refined', tier: 5, value: 1150, recipe: [['ti', 4]], use: "Hull and frames." },
    { id: 'iri', name: "Iridium Ingot", fam: 'refined', tier: 5, value: 1650, recipe: [['ir', 3]], use: "Exotic-grade metal." },
    { id: 'qs', name: "Quicksilver", fam: 'refined', tier: 5, value: 900, recipe: [['cn', 3]], use: "Liquid metal reagent." },
    { id: 'rsn', name: "Resin", fam: 'refined', tier: 5, value: 800, recipe: [['amb', 3]], use: "Organic extract. Medicine and seal." },
    { id: 'fol', name: "Fossil Oil", fam: 'refined', tier: 5, value: 950, recipe: [['fo', 3]], use: "Rich organic oil." },
    { id: 'osp', name: "Osmium Plate", fam: 'refined', tier: 6, value: 2400, recipe: [['os', 4]], use: "Ultra-dense plating." },
    { id: 'cfl', name: "Cut Gem (Flawless)", fam: 'refined', tier: 6, value: 3400, recipe: [['dia', 2]], use: "The finest cut stones." },
    { id: 'exa', name: "Exotic Alloy", fam: 'refined', tier: 7, value: 6200, recipe: [['unob', 3], ['ir', 1]], use: "Endgame structural material." },
    // REACTION
    { id: 'brs', name: "Brass", fam: 'reaction', tier: 1, value: 95, recipe: [['cui', 2], ['acid', 1]], use: "Acid-etched copper alloy." },
    { id: 'gf', name: "Gold Flake", fam: 'reaction', tier: 2, value: 420, recipe: [['py', 2], ['acid', 1]], use: "Acid frees real gold from pyrite." },
    { id: 'qst', name: "Quenched Steel", fam: 'reaction', tier: 2, value: 360, recipe: [['stl', 1], ['brn', 1]], use: "Brine-hardened steel." },
    { id: 'cj', name: "Crystal Jacket", fam: 'reaction', tier: 2, value: 210, recipe: [['slr', 1], ['brn', 1]], use: "Coats ore to buff its value." },
    { id: 'thm', name: "Thermite", fam: 'reaction', tier: 3, value: 540, recipe: [['alu', 1], ['mag', 1]], use: "Aluminum plus iron oxide. Burns through anything." },
    { id: 'cg', name: "Charged Gel", fam: 'reaction', tier: 3, value: 230, recipe: [['csl', 1], ['glw', 1]], use: "Battery gel." },
    { id: 'elec', name: "Electrum", fam: 'reaction', tier: 3, value: 640, recipe: [['aub', 1], ['agb', 1]], use: "Gold-silver alloy." },
    { id: 'flg', name: "Fulgurite", fam: 'reaction', tier: 3, value: 300, recipe: [['slr', 1], ['cg', 1]], use: "Glass fused by a charge." },
    { id: 'amg', name: "Amalgam", fam: 'reaction', tier: 4, value: 700, recipe: [['qs', 1], ['aub', 1]], use: "Mercury-bound gold." },
    { id: 'cor', name: "Corium", fam: 'reaction', tier: 4, value: 1450, recipe: [['u', 1], ['vsl', 1]], use: "Hazardous hot mass. Handle with care." },
    { id: 'pr', name: "Petrified Resin", fam: 'reaction', tier: 5, value: 480, recipe: [['rsn', 1], ['lava', 1]], use: "Heat-set amber-stone." },
    { id: 'sp', name: "Sporebloom", fam: 'reaction', tier: 5, value: 500, recipe: [['bm', 1], ['gel', 1]], use: "Living organic bloom." },
    { id: 'bc', name: "Blood Crystal", fam: 'reaction', tier: 5, value: 1100, recipe: [['bm', 1], ['rb', 1]], use: "Organic-grown gem." },
    { id: 'lm', name: "Living Metal", fam: 'reaction', tier: 5, value: 920, recipe: [['lsl', 1], ['fei', 2]], use: "Self-healing metal." },
    { id: 'rad', name: "Radiant Ore", fam: 'reaction', tier: 6, value: 860, recipe: [['nul', 1], ['glw', 1]], use: "Glowing collectible reaction." },
    { id: 'vgl', name: "Void Glass", fam: 'reaction', tier: 6, value: 1300, recipe: [['vr', 1], ['lava', 1]], use: "Black glass, light-eating." },
    { id: 'nst', name: "Null Steel", fam: 'reaction', tier: 6, value: 1800, recipe: [['stl', 1], ['nul', 1]], use: "Steel touched by null liquid." },
    { id: 'aec', name: "Aether Crystal", fam: 'reaction', tier: 6, value: 2100, recipe: [['aeth', 1], ['nul', 1]], use: "Resonant catalytic crystal." },
    { id: 'qe', name: "Quintessence", fam: 'reaction', tier: 7, value: 4200, recipe: [['qn', 1], ['vs', 1]], use: "Distilled essence of the deep." },
    { id: 'mid', name: "Midas Draught", fam: 'reaction', tier: 7, value: 5200, recipe: [['gf', 1], ['qe', 1]], use: "Legendary. Turns what it touches to gold." },
    // COMPONENT
    { id: 'gls', name: "Glass", fam: 'component', tier: 2, value: 120, recipe: [['alu', 1], ['brn', 1]], use: "Lenses and instruments." },
    { id: 'gp', name: "Gunpowder", fam: 'component', tier: 2, value: 180, recipe: [['s', 1], ['coke', 1], ['np', 1]], use: "Explosives base." },
    { id: 'mp', name: "Machine Parts", fam: 'component', tier: 3, value: 320, recipe: [['stl', 2], ['cui', 1]], use: "Gears and fittings." },
    { id: 'cir', name: "Circuitry", fam: 'component', tier: 3, value: 520, recipe: [['cui', 1], ['agb', 1], ['gls', 1]], use: "The electronics core." },
    { id: 'lns', name: "Lens", fam: 'component', tier: 4, value: 300, recipe: [['gls', 1], ['clu', 1]], use: "Optics and scanners." },
    { id: 'hp', name: "Hull Plate", fam: 'component', tier: 5, value: 820, recipe: [['stl', 2], ['tip', 1]], use: "Armor stock." },
    { id: 'af', name: "Alloy Frame", fam: 'component', tier: 5, value: 1450, recipe: [['tip', 1], ['coa', 1]], use: "Chassis for machinery and gear." },
    { id: 'pc', name: "Power Cell", fam: 'component', tier: 5, value: 1650, recipe: [['fr', 1], ['cir', 1]], use: "Portable power." },
    { id: 'po', name: "Precision Optics", fam: 'component', tier: 6, value: 1250, recipe: [['cfl', 1], ['lns', 1]], use: "Top-grade lenses." },
    // GOOD (TOWN)
    { id: 'beam', name: "Beams", fam: 'good', tier: 2, value: 420, recipe: [['stl', 1], ['alu', 1]], use: "Construction. Towns always need them." },
    { id: 'ammo', name: "Ammunition", fam: 'good', tier: 3, value: 520, recipe: [['gp', 1], ['pbi', 1]], use: "Frontier and No Man's Zone demand." },
    { id: 'tool', name: "Tools", fam: 'good', tier: 3, value: 620, recipe: [['mp', 1], ['fei', 1]], use: "Universal town demand." },
    { id: 'med', name: "Medicine", fam: 'good', tier: 4, value: 720, recipe: [['fol', 1], ['brn', 1]], use: "Always in demand, spikes in events." },
    { id: 'jwl', name: "Jewelry", fam: 'good', tier: 4, value: 1600, recipe: [['cbr', 1], ['aub', 1]], use: "The Cutting town and the Collector." },
    { id: 'elx', name: "Electronics", fam: 'good', tier: 4, value: 1850, recipe: [['cir', 1], ['aub', 1]], use: "High-tech town demand." },
    { id: 'fc', name: "Fuel Cells", fam: 'good', tier: 5, value: 2500, recipe: [['pc', 1], ['vg', 1]], use: "Power infrastructure." },
    { id: 'art', name: "Artillery", fam: 'good', tier: 6, value: 3000, recipe: [['ammo', 2], ['hp', 1]], use: "War economy demand." },
    { id: 'lux', name: "Luxury Goods", fam: 'good', tier: 6, value: 3200, recipe: [['jwl', 1], ['clu', 2]], use: "Deep-city demand. High margin." },
    { id: 'mach', name: "Machinery", fam: 'good', tier: 6, value: 4100, recipe: [['mp', 1], ['af', 1]], use: "Industrial backbone." },
    { id: 'inst', name: "Instrument", fam: 'good', tier: 6, value: 5200, recipe: [['po', 1], ['cir', 1]], use: "Scientific demand, rare buyers." },
    { id: 'rc', name: "Reactor Core", fam: 'good', tier: 7, value: 8000, recipe: [['pc', 2], ['exa', 1]], use: "Endgame infrastructure." },
    { id: 'gr', name: "Grand Regalia", fam: 'good', tier: 7, value: 9000, recipe: [['lux', 1], ['cfl', 1]], use: "The richest single good. The Deep pays." },
    // GEAR (YOU)
    { id: 'bomb', name: "Bomb", fam: 'gear', tier: 2, value: 300, recipe: [['gp', 1], ['fei', 1]], use: "Clears rock and barriers." },
    { id: 'rk', name: "Repair Kit", fam: 'gear', tier: 3, value: 350, recipe: [['fei', 1], ['acid', 1]], use: "Patch the hull on the move." },
    { id: 'db', name: "Drill Bit", fam: 'gear', tier: 3, value: 500, recipe: [['stl', 1], ['mp', 1]], use: "Drill upgrade. Mine harder ore." },
    { id: 'bb', name: "Heavy Bomb", fam: 'gear', tier: 3, value: 800, recipe: [['gp', 3], ['stl', 1]], use: "Big clears." },
    { id: 'fcan', name: "Fuel Canister", fam: 'gear', tier: 4, value: 400, recipe: [['vg', 1]], use: "Extend your range." },
    { id: 'scn', name: "Scanner", fam: 'gear', tier: 4, value: 1100, recipe: [['cir', 1], ['lns', 1]], use: "Reveal ore and prices." },
    { id: 'hd', name: "Heated Drill", fam: 'gear', tier: 4, value: 1400, recipe: [['db', 1], ['fr', 1]], use: "Break heat-locked deep ore." },
    { id: 'ha', name: "Hull Armor", fam: 'gear', tier: 5, value: 1200, recipe: [['hp', 1]], use: "Survive the No Man's Zone." },
    { id: 'cp', name: "Cargo Pod", fam: 'gear', tier: 5, value: 1600, recipe: [['af', 1], ['alu', 2]], use: "Carry more per run." },
    { id: 'slu', name: "Sluice Upgrade", fam: 'gear', tier: 5, value: 2000, recipe: [['mp', 2], ['gls', 2]], use: "Better wash, yield, reveal." },
    { id: 'bst', name: "Booster", fam: 'gear', tier: 5, value: 2600, recipe: [['pc', 1], ['af', 1]], use: "Faster flight, outrun danger." },
    { id: 'tp', name: "Teleporter Charge", fam: 'gear', tier: 7, value: 3000, recipe: [['nul', 1], ['cir', 1]], use: "Escape with the haul." },
  ];

  // Index by id + family bucket, built once at load (ITEM_DEFS is above).
  var ITEM_REGISTRY = {};
  var ITEMS_BY_FAM = {};
  function econRegistryBuild() {
    var i, it;
    for (i = 0; i < ITEM_DEFS.length; i++) {
      it = ITEM_DEFS[i];
      if (it.fam === 'refined' && !ENABLE_REFINEMENT) continue;   // refinement was never finished: keep refined items out of the active catalog
      ITEM_REGISTRY[it.id] = it;
      if (!ITEMS_BY_FAM[it.fam]) ITEMS_BY_FAM[it.fam] = [];
      ITEMS_BY_FAM[it.fam].push(it);
    }
  }
  econRegistryBuild();

  // Accessors (econ-prefixed). Read-only views over the registry.
  function econItem(id) { return ITEM_REGISTRY[id] || null; }
  function econItemName(id) { var it = ITEM_REGISTRY[id]; return it ? it.name : id; }
  function econItemsInFam(fam) { return ITEMS_BY_FAM[fam] || []; }
  function econTierName(t) { return ITEM_TIERS[t] || ('T' + t); }
  function econFamColor(fam) {
    for (var i = 0; i < ITEM_FAMS.length; i++) if (ITEM_FAMS[i].id === fam) return ITEM_FAMS[i].color;
    return '#cdd6e0';
  }

