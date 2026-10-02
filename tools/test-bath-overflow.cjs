// Unrestricted hose flow, the real open rim, and permanent spill removal.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const copy = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const s = {
    window: {}, console: { log() {} }, TILE: 32, COLS: 320, SKY_ROWS: 4,
    world: Array.from({ length: 620 }, () => Array(320).fill(null)),
    liquidWGPU: null, liquidCount: 0, liquidX: [], liquidY: [], liquidVX: [], liquidVY: [], liquidType: [], liquidOrigin: [],
    LIQUID_MAX_PARTICLES: 120000, emissionLimit: Infinity, dev: false, gamePaused: false, hearthView: 'bath',
    liquidCatalog: ['Water', 'Oil', 'Brine', 'Nectar', 'Lumen'].map((name, id) => ({ name, id })),
    siphon: { tank: [0, 0, 0, 0, 0, 0], capacity: 16000 },
    hearthDevSupplies: () => s.dev, liquidToolSync() {}, invalidateTerrainAround() {}, saveNow() {},
    bathThermalSave: () => ({}), hearthRoomSave: () => ({}),
    bathThermalOnPour() {},
    addLiquidParticle(type, x, y, vx = 0, vy = 0) {
      if (s.liquidCount >= s.LIQUID_MAX_PARTICLES) return -1;
      const i = s.liquidCount++;
      for (const [key, value] of Object.entries({ liquidType: type, liquidX: x, liquidY: y, liquidVX: vx, liquidVY: vy, liquidOrigin: 0 })) s[key][i] = value;
      return i;
    },
    removeLiquidParticle(i) {
      const last = --s.liquidCount;
      for (const key of ['liquidType', 'liquidX', 'liquidY', 'liquidVX', 'liquidVY', 'liquidOrigin']) {
        s[key][i] = s[key][last]; s[key].length = last;
      }
    },
    liquidToolEmit(type, count, x, y, vx, vy) {
      const accepted = Math.min(count, s.emissionLimit, s.LIQUID_MAX_PARTICLES - s.liquidCount);
      for (let i = 0; i < accepted; i++) s.addLiquidParticle(type, x, y, vx, vy);
      return accepted;
    },
    liquidSampleRect: () => [s.bathWater, 0, 0, 0, 0]
  };
  vm.createContext(s);
  for (const name of ['072-bath', '073-liquid-deposits', '074-bath-service', '074-bath-silos', '074-bath-tools']) {
    vm.runInContext(fs.readFileSync('js/sluice/' + name + '.js', 'utf8'), s);
  }
  s.bathSiloReset(); s.bathMode = true; s.bathRoomReady = true; s.bathSyncCollision();
  const F = s.BATH_FLOORS[0], c = s.bathTubCurve(F, F.tubs[0]);
  Object.assign(s.bathTool, { mode: 'hose', valve: true, flow: 1, x: (c.x0 + c.x1) / 2,
    tx: (c.x0 + c.x1) / 2, y: c.y0 - 60, ty: c.y0 - 60 });
  return { s, F, c };
}

{
  for (const dev of [false, true]) {
    const { s } = fixture(); s.dev = dev; s.bathWater = 90000;
    if (!dev) s.bathSiloQueue(0, 180000, 20);
    const stock = s.bathLiquidCount(0);
    for (let frame = 0; frame < 180; frame++) s.bathToolTick(0.1);
    assert.equal(s.liquidCount, 57600, 'a bath above the former capacity still accepts the full hose flow');
    assert.equal(s.bathTool.valve, true);
    assert.equal(stock - s.bathLiquidCount(0), dev ? 0 : s.liquidCount, 'only accepted finite stock is consumed');
  }
  console.log('PASS hose keeps flowing beyond both the old fill limit and a brimful bath');
}

{
  for (const fps of [30, 60, 144]) for (const aim of [0.08, 0.28, 0.5, 0.72, 0.92]) {
    const { s, c } = fixture(), t = s.bathTool;
    t.valve = false; t.flow = 0;
    t.tx = c.x0 + (c.x1 - c.x0) * aim; t.ty = c.y0 + c.D - 24;
    for (let frame = 0; frame < fps * 3; frame++) {
      s.bathToolTick(1 / fps);
      const x = t.x + Math.sin(t.tilt) * 25, y = t.y + Math.cos(t.tilt) * 25;
      assert(!s.bathSolidAt(x, y), fps+' Hz tilted hose mouth crosses copper at aim '+aim);
      assert([t.x, t.y, t.vx, t.vy, t.tilt].every(Number.isFinite));
    }
  }
  console.log('PASS tilted hose outlets stay clear of the full curved liner at 30/60/144 Hz');
}

{
  const { s } = fixture(); s.bathWater = 90000; s.bathSiloQueue(2, 1000, 60); s.bathSilos.selected = 2;
  s.emissionLimit = 7; s.bathToolTick(0.1);
  assert.equal(s.liquidCount, 7); assert.equal(s.bathLiquidCount(2), 993);
  s.emissionLimit = 0; s.bathToolTick(0.1);
  assert.equal(s.bathLiquidCount(2), 993, 'a saturated global solver loses no stored stock');
  s.emissionLimit = Infinity; s.bathToolTick(0.1);
  assert.equal(s.liquidCount, 327); assert.equal(s.bathLiquidCount(2), 673, 'flow resumes immediately when space returns');
  assert(s.liquidType.every(type => type === 2));
  s.LIQUID_MAX_PARTICLES = 400; s.bathToolTick(0.1);
  assert.equal(s.liquidCount, 400); assert.equal(s.bathLiquidCount(2), 600);
  s.bathToolTick(0.1); assert.equal(s.bathLiquidCount(2), 600, 'the global particle budget is still enforced');
  s.removeLiquidParticle(0); s.bathToolTick(0.1);
  assert.equal(s.liquidCount, 400); assert.equal(s.bathLiquidCount(2), 599);
  console.log('PASS partial and blocked output preserve finite selected-liquid inventory');
}

{
  const { s, F, c } = fixture(); s.bathWater = 90000; s.bathSiloQueue(0, 90001, 20);
  assert(s.bathAddWater()); assert.equal(s.bathPour, 90001);
  assert.equal(s.bathLiquidCount(0), 0, 'legacy reservation does not use a tub-volume maximum');
  s.bathToolTick(0.1);
  assert.equal(s.bathPour, 0); assert.equal(s.bathLiquidCount(0) + s.liquidCount, 90001);
  for (const x of [c.x0 - 10, c.x1 + 10]) {
    assert.equal(s.bathSolidAt(x, c.y0 - 3), false, 'the actual curved collision shell is open outside the lip');
  }
  const left = F.tubs[0][0] - 1, right = F.tubs[0][1] + 1;
  s.world[F.fr - 1][left] = { type: 'foundation', hp: 999999 };
  s.world[F.fr - 1][right] = { type: 'foundation', hp: 999999 };
  const preserved = { type: 'foundation', hp: 17 }; s.world[F.fr][left] = preserved;
  s.bathCarveRoom();
  assert.equal(s.world[F.fr - 1][left], null); assert.equal(s.world[F.fr - 1][right], null);
  assert.equal(s.world[F.fr][left], preserved, 'rim migration preserves the supporting floor and saved chamber');
  s.bathRoomReady = false; s.bathArmHeat = () => {}; s.bathCarveRoom();
  assert.equal(s.world[F.fr - 1][left], null); assert.equal(s.world[F.fr - 1][right], null);
  console.log('PASS uncapped legacy reservations and existing-room hidden rim-step removal');
}

{
  const { s, F, c } = fixture();
  s.addLiquidParticle(0, c.x0 - 20, F.fr * s.TILE - 2);
  s.mineralLiquidPark(2, c.x1 + 20, F.fr * s.TILE - 2);
  s.addLiquidParticle(0, c.x0 - 1, F.fr * s.TILE - 2);
  s.addLiquidParticle(0, (c.x0 + c.x1) / 2, c.y0 + c.D - 10);
  s.addLiquidParticle(0, c.x0 - 20, c.y0 - 12); // A live airborne splash can still return.
  s.mineralLiquidPark(3, c.x1 + 20, c.y0 - 12);
  s.mineralLiquidPark(0, 100, 200); // Outdoor liquid is untouched.
  s.addLiquidParticle(0, c.x0 - 20, F.fr * s.TILE - 5.05); // Would round onto the floor in the save.
  const savedService = copy(s.bathServiceSave()), savedLiquid = copy(s.mineralLiquidSave());
  assert.equal(savedService.lost, 4, 'saving between drain ticks consumes active and parked spills, including right beside the rim');
  assert.equal(s.liquidCount, 2);
  assert.equal(Object.values(savedLiquid.parked).reduce((sum, data) => sum + data.length / 3, 0), 4);
  s.bathDrainFloor(); assert.equal(s.bathLostWater, 4, 'drain cannot count the same water twice');
  assert.equal(s.bathLiquidCount(0), 0); assert.equal(s.bathLiquidCount(2), 0, 'lost liquid is never returned to storage');
  console.log('PASS airborne splash survives while active and parked spills disappear permanently before saving');
}
