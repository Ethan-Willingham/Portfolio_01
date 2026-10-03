/* Camp clock, recoveries, shop and saved progression. No browser dependencies. */
(function (root) {
  'use strict';
  const REGIONS = Object.freeze({
    birch: { name: 'Birch Clearing', animal: 'deer', backdrop: 'clearing', cost: 0, required: 0,
      description: 'An open meadow under birch and spruce. Whitetail bucks cross above the stand.', peak: 'Dawn and late afternoon', wind: .8 },
    cypress: { name: 'Cypress Edge', animal: 'boar', backdrop: 'marsh', cost: 350, required: 2,
      description: 'Reeds, muddy paths and wild boar. Lower targets and stronger wind.', peak: 'Early morning and dusk', wind: 1.15 }
  });
  const SPECIES = Object.freeze({
    deer: { name: 'Whitetail buck', minWeight: 110, maxWeight: 240, baseValue: 90, vitalsX: .67, vitalsY: .45, radius: .1 },
    boar: { name: 'Wild boar', minWeight: 140, maxWeight: 330, baseValue: 125, vitalsX: .67, vitalsY: .45, radius: .1 }
  });
  const DEER_LEVELS = Object.freeze([
    { level: 1, name: 'Young buck', required: 0, width: 56, minWeight: 110, maxWeight: 140, baseValue: 90,
      vitalsX: .67, vitalsY: .45, radius: .1, description: 'A lean tan buck with a small forked rack.' },
    { level: 2, name: 'Woodland buck', required: 2, width: 60, minWeight: 140, maxWeight: 180, baseValue: 120,
      vitalsX: .67, vitalsY: .45, radius: .1, description: 'A russet adult with a balanced branching rack.' },
    { level: 3, name: 'Ridge buck', required: 5, width: 64, minWeight: 180, maxWeight: 220, baseValue: 165,
      vitalsX: .67, vitalsY: .45, radius: .1, description: 'Broad shoulders, a thick neck and long sweeping tines.' },
    { level: 4, name: 'Old monarch', required: 9, width: 70, minWeight: 220, maxWeight: 260, baseValue: 225,
      vitalsX: .67, vitalsY: .45, radius: .1, description: 'A dark old buck with a weathered muzzle and an uneven crown.' },
    { level: 5, name: 'Crowned stag', required: 14, width: 76, minWeight: 260, maxWeight: 300, baseValue: 310,
      vitalsX: .67, vitalsY: .45, radius: .1, description: 'A silver winter coat beneath a huge, naturally forked rack.' }
  ].map(Object.freeze));
  const deerLevel = level => DEER_LEVELS.find(d => d.level === level) || DEER_LEVELS[0];
  const animalArt = animal => animal.species === 'deer' ? 'deer-' + deerLevel(animal.level).level : animal.species;
  const animalName = animal => animal.species === 'deer' ? deerLevel(animal.level).name : SPECIES[animal.species].name;
  const deerRecoveries = state => state.records.filter(r => r.species === 'deer').length;
  const unlockedDeerLevel = state => DEER_LEVELS.filter(d => deerRecoveries(state) >= d.required).at(-1).level;
  const ITEMS = Object.freeze({
    rifle: { name: 'Weighted-round rifle', price: 400, description: 'A steadier round. Wind drift is reduced by 40 percent.', slot: 'rifle' },
    dog: { name: 'Tracking dog', price: 300, description: 'Bracken finds more lost trails and cuts search time from 20 minutes to 12.', slot: 'companion' },
    kit: { name: 'Field-dressing kit', price: 100, description: 'Halves the loss in sale value from waiting to recover an animal.', slot: 'pack' }
  });
  const SAVE_KEY = 'hunting-camp-v1';
  const has = (object, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(object, key);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const number = (n, fallback, lo, hi) => Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
  const hash = seed => { let n = seed >>> 0; n = Math.imul(n ^ n >>> 16, 0x21f0aaad); n = Math.imul(n ^ n >>> 15, 0x735a2d97); return ((n ^ n >>> 15) >>> 0) / 4294967296; };
  function fresh() {
    return { version: 1, minute: 330, credits: 160, owned: [], regions: ['birch'], equipped: 'starter',
      dogAlong: true, selected: 'birch', deerLevel: 1, records: [], tracks: [], nextId: 1, outings: 0, shots: 0 };
  }
  function sanitize(raw) {
    const s = fresh();
    if (!raw || raw.version !== 1) return s;
    s.minute = number(raw.minute, 330, 0, 5256000);
    s.credits = Math.round(number(raw.credits, 160, 0, 10000000));
    s.owned = [...new Set((Array.isArray(raw.owned) ? raw.owned : []).filter(id => has(ITEMS, id)))];
    s.regions = ['birch', ...new Set((Array.isArray(raw.regions) ? raw.regions : []).filter(id => id === 'cypress'))];
    s.equipped = raw.equipped === 'rifle' && s.owned.includes('rifle') ? 'rifle' : 'starter';
    s.dogAlong = raw.dogAlong !== false;
    s.selected = s.regions.includes(raw.selected) ? raw.selected : 'birch';
    s.nextId = Math.round(number(raw.nextId, 1, 1, 10000000));
    s.outings = Math.round(number(raw.outings, 0, 0, 1000000));
    s.shots = Math.round(number(raw.shots, 0, 0, 10000000));
    if (Array.isArray(raw.records)) s.records = raw.records.filter(r => r && has(SPECIES, r.species) && Number.isInteger(r.id) && r.id > 0).map(r => ({
      id: r.id, species: r.species, region: has(REGIONS, r.region) ? r.region : 'birch',
      ...(r.species === 'deer' ? { level: deerLevel(r.level).level } : {}),
      weight: Math.round(number(r.weight, 150, 1, 1000)), score: number(r.score, .5, 0, 1),
      baseValue: Math.round(number(r.baseValue, 100, 1, 1000)), quality: number(r.quality, 1, .2, 1),
      recoveredAt: number(r.recoveredAt, s.minute, 0, s.minute),
      method: r.method === 'tracked' ? 'tracked' : 'clean', status: ['sold', 'mounted'].includes(r.status) ? r.status : 'packed',
      kit: !!r.kit
    }));
    if (Array.isArray(raw.tracks)) s.tracks = raw.tracks.filter(t => t && has(SPECIES, t.species) && Number.isInteger(t.id) && t.id > 0).map(t => ({
      id: t.id, species: t.species, region: has(REGIONS, t.region) ? t.region : 'birch',
      ...(t.species === 'deer' ? { level: deerLevel(t.level).level } : {}),
      weight: Math.round(number(t.weight, 150, 1, 1000)), score: number(t.score, .5, 0, 1),
      baseValue: Math.round(number(t.baseValue, 100, 1, 1000)), seed: number(t.seed, t.id, 0, 4294967295),
      hitAt: number(t.hitAt, s.minute, 0, s.minute), searched: !!t.searched, found: !!t.found
    }));
    s.nextId = Math.max(s.nextId, ...s.records.map(r => r.id + 1), ...s.tracks.map(t => t.id + 1));
    s.deerLevel = Math.min(deerLevel(raw.deerLevel ?? unlockedDeerLevel(s)).level, unlockedDeerLevel(s));
    return s;
  }
  function clock(minute) {
    const t = Math.floor(minute) % 1440;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }
  function period(minute) {
    const hour = (minute % 1440) / 60;
    return hour < 5 || hour >= 20 ? 'Night' : hour < 8 ? 'Dawn' : hour < 16 ? 'Daylight' : 'Dusk';
  }
  function activity(minute) { return ['Dawn', 'Dusk'].includes(period(minute)) ? 1 : period(minute) === 'Night' ? .15 : .5; }
  class Campaign {
    constructor(raw) { this.state = sanitize(raw); }
    get day() { return Math.floor(this.state.minute / 1440) + 1; }
    get time() { return clock(this.state.minute); }
    get packed() { return this.state.records.filter(r => r.status === 'packed'); }
    get pending() { return this.state.tracks.filter(t => !t.searched); }
    get dog() { return this.state.owned.includes('dog') && this.state.dogAlong; }
    get deerRecoveries() { return deerRecoveries(this.state); }
    get maxDeerLevel() { return unlockedDeerLevel(this.state); }
    advance(seconds, speed = 1) { this.state.minute += Math.max(0, seconds) * Math.max(0, speed) / 60; }
    waitUntil(value) {
      if (!/^\d{2}:\d{2}$/.test(value)) return false;
      const [h, m] = value.split(':').map(Number);
      if (h > 23 || m > 59) return false;
      let target = Math.floor(this.state.minute / 1440) * 1440 + h * 60 + m;
      if (target < this.state.minute + 1 / 60) target += 1440;
      this.state.minute = target; return true;
    }
    buy(id) {
      const item = has(ITEMS, id) ? ITEMS[id] : null;
      if (!item || this.state.owned.includes(id) || this.state.credits < item.price) return false;
      this.state.credits -= item.price; this.state.owned.push(id);
      if (id === 'rifle') this.state.equipped = 'rifle';
      return true;
    }
    unlock(id) {
      const region = has(REGIONS, id) ? REGIONS[id] : null;
      if (!region || this.state.regions.includes(id) || this.state.records.length < region.required || this.state.credits < region.cost) return false;
      this.state.credits -= region.cost; this.state.regions.push(id); this.state.selected = id; return true;
    }
    select(id) { if (!this.state.regions.includes(id)) return false; this.state.selected = id; return true; }
    selectDeerLevel(level) {
      if (!DEER_LEVELS.some(d => d.level === level) || level > this.maxDeerLevel) return false;
      this.state.deerLevel = level; this.state.selected = 'birch'; return true;
    }
    equip(id) { if (id !== 'starter' && !(id === 'rifle' && this.state.owned.includes(id))) return false; this.state.equipped = id; return true; }
    begin() {
      if (period(this.state.minute) === 'Night' || period(this.state.minute + 10) === 'Night') return null;
      this.state.outings++;
      return { region: this.state.selected, deerLevel: this.state.deerLevel, windScale: this.state.equipped === 'rifle' ? .6 : 1, dog: this.dog };
    }
    animal(species, seed, level = this.state.deerLevel) {
      species = has(SPECIES, species) ? species : 'deer';
      const def = species === 'deer' ? deerLevel(level) : SPECIES[species], score = hash(seed);
      return { species, ...(species === 'deer' ? { level: def.level } : {}), weight: Math.round(def.minWeight + (def.maxWeight - def.minWeight) * score),
        score, seed: seed >>> 0, baseValue: Math.round(def.baseValue * (.85 + score * .8)) };
    }
    recover(animal, method = 'clean', quality = 1, region = this.state.selected) {
      const previousLevel = this.maxDeerLevel;
      const record = { ...animal, id: this.state.nextId++, method, quality, region,
        recoveredAt: this.state.minute, kit: this.state.owned.includes('kit'), status: 'packed' };
      delete record.seed;
      this.state.records.push(record);
      if (this.maxDeerLevel > previousLevel) this.state.deerLevel = this.maxDeerLevel;
      return record;
    }
    addTrack(animal, region = this.state.selected) {
      const track = { ...animal, id: this.state.nextId++, region, hitAt: this.state.minute, searched: false, found: false };
      this.state.tracks.push(track);
      return track;
    }
    trackChance(track) {
      const age = Math.max(0, this.state.minute - track.hitAt);
      return clamp(.68 - age / 900 + (this.dog ? .27 : 0), .08, .95);
    }
    search(id) {
      const track = this.state.tracks.find(t => t.id === id && !t.searched);
      if (!track) return null;
      const chance = this.trackChance(track), delay = Math.max(0, this.state.minute - track.hitAt);
      const dog = this.dog, kit = this.state.owned.includes('kit');
      track.searched = true;
      this.state.minute += dog ? 12 : 20;
      track.found = hash(track.seed ^ 0xa5a5b4c3) < chance;
      const quality = clamp(.85 - delay / (kit ? 1800 : 900), .25, .85);
      const record = track.found ? this.recover(track, 'tracked', quality, track.region) : null;
      if (record) { delete record.hitAt; delete record.searched; delete record.found; }
      return { found: track.found, record, minutes: dog ? 12 : 20,
        text: track.found ? dog ? 'Bracken found it under the ferns. He would like this noted in his annual review.' : 'Found it beyond the last bend. A little patience paid off.'
          : track.score > .7 ? 'The trail disappeared in the reeds. A big set of tracks, but no recovery this time.' : 'A few drops, two wrong turns, and one very suspicious stump. No recovery this time.' };
    }
    value(record) {
      const age = Math.max(0, this.state.minute - record.recoveredAt);
      const freshness = clamp(1 - age / (record.kit ? 2880 : 1440), .4, 1);
      return Math.round(record.baseValue * record.quality * freshness);
    }
    sell(id) {
      const record = this.state.records.find(r => r.id === id && r.status === 'packed');
      if (!record) return 0;
      const value = this.value(record); record.status = 'sold'; this.state.credits += value; return value;
    }
    sellAll() { return this.packed.reduce((sum, r) => sum + this.sell(r.id), 0); }
    mount(id) {
      const record = this.state.records.find(r => r.id === id && r.status === 'packed');
      if (!record) return false;
      record.status = 'mounted'; return true;
    }
    export() { return JSON.stringify(this.state); }
  }
  const api = { Campaign, REGIONS, SPECIES, DEER_LEVELS, deerLevel, animalArt, animalName, ITEMS, SAVE_KEY, clock, period, activity };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HuntingCampaign = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
