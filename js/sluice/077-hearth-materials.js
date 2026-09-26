  /* ---- Existing mine materials, with explicit fuel and additive roles. ---- */
  // These are bounded game-time coefficients, not recipes or laboratory data.
  // Valuable materials stay in cargo until deliberately placed in the furnace.
  var HEARTH_MATERIAL_ORDER = ['coal', 'methaneice', 'amber', 'sulfur', 'copper', 'malachite'];
  var HEARTH_MATERIALS = {
    coal: { label: 'Coal', role: 'fuel', description: 'Steady embers, long burn', volatile: 0.28, moisture: 0.08, life: 100, release: 1.75, pyro: [540,1050], charHeat: 1, residue: 0.16, density: 1, color: '#292724', highlight: '#777063', flame: [1,0.48,0.10], tint: 0, burn: 2, heat: 3 },
    methaneice: { label: 'Methane ice', role: 'fuel', description: 'Fast blue flare, intense heat', volatile: 0.94, moisture: 0.13, life: 29, release: 3.8, pyro: [390,710], charHeat: 1.05, residue: 0.025, density: 1.25, color: '#94c6dd', highlight: '#ecf6f4', flame: [0.14,0.46,1], tint: 0.95, burn: 5, heat: 5 },
    amber: { label: 'Amber', role: 'fuel', description: 'Rich golden flame, quick hot burn', volatile: 0.72, moisture: 0.02, life: 63, release: 2.7, pyro: [440,840], charHeat: 1.18, residue: 0.045, density: 1.1, color: '#ad5d18', highlight: '#f5cc65', flame: [1,0.62,0.12], tint: 0.45, burn: 4, heat: 4 },
    sulfur: { label: 'Sulfur', role: 'fuel', description: 'Low blue flame, cooler steady heat', volatile: 0.97, moisture: 0.005, life: 74, release: 1.9, pyro: [420,760], charHeat: 0.36, residue: 0.035, density: 0.45, color: '#cbb43b', highlight: '#f5e695', flame: [0.21,0.28,1], tint: 0.96, burn: 3, heat: 1 },
    copper: { label: 'Copper', role: 'additive', description: 'Green flame tint in a hot fire; no fuel', volatile: 0, moisture: 0, life: 100, release: 0, pyro: [540,1050], charHeat: 0, residue: 1, density: 1.4, color: '#ae6237', highlight: '#edaf73', flame: [0.13,1,0.5], tint: 0.88, burn: 0, heat: 0 },
    malachite: { label: 'Malachite', role: 'additive', description: 'Turquoise flame tint in a hot fire; no fuel', volatile: 0, moisture: 0, life: 100, release: 0, pyro: [540,1050], charHeat: 0, residue: 1, density: 1.1, color: '#286b4b', highlight: '#78c8a1', flame: [0.10,0.92,0.77], tint: 0.9, burn: 0, heat: 0 },
    // Preserve the existing developer adapter and saved wood, without inventing
    // an inventory source for trees that currently drop no collectible timber.
    wood: { label: 'Wood', role: 'fuel', description: 'Quick kindling', volatile: 0.76, moisture: 0.08, life: 100, release: 2.4, pyro: [450,850], charHeat: 1, residue: 0.16, density: 1, color: '#795339', highlight: '#b48d61', flame: [1,0.5,0.12], tint: 0, burn: 3, heat: 2 }
  };
  function hearthMaterial(id) { return Object.prototype.hasOwnProperty.call(HEARTH_MATERIALS, id) ? HEARTH_MATERIALS[id] : HEARTH_MATERIALS.coal; }
  function hearthMaterialCount(id) { return HEARTH_MATERIAL_ORDER.indexOf(id) < 0 ? 0 : forgeCount(id); }
  function hearthFuelPreview(id, kind, x, y) {
    var bed = hearthBeds[kind || 'boiler'];
    if (!bed || HEARTH_MATERIAL_ORDER.indexOf(id) < 0) return null;
    return hearthCreateChunk(bed, bed.nextId, x == null ? HEARTH_WIDTH / 2 : x, y == null ? 12 : y, id);
  }
  function hearthDropMaterial(kind, x, y, id, preview) {
    var bed = hearthBeds[kind];
    if (!bed || typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y) || HEARTH_MATERIAL_ORDER.indexOf(id) < 0 || bed.chunks.length >= HEARTH_CAP || hearthMaterialCount(id) < 1) return null;
    // Create and validate first. A failed drop never spends or refunds a unit.
    var b = hearthCreateChunk(bed, bed.nextId, x, y, id);
    if (!forgeTake(id, 1)) return null;
    b.devSupplied = hearthDevSupplies();
    bed.nextId++; bed.chunks.push(b); hearthMeasure(bed);
    return b;
  }
