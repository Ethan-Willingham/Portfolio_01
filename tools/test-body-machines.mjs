import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Exercise the actual rendered scene and native GPU solver. The harness owns
// only its Chrome for Testing process and always closes it in finally.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const {
  chromium,
  launchOptions,
} = require("./under-street/browser-support.cjs");
const args = process.argv.slice(2),
  mobile = args.includes("--mobile");
const ids = args.filter((s) => !s.startsWith("--"));
const selected = ids.length
  ? ids
  : [
      "fountain-rider",
      "canal-locks",
      "squid-jet",
      "jellyfish",
      "slime-sipper",
      "water-balloon-fight",
      "slime-mail",
      "pitcher-pump",
      "super-soaker",
      "spray-bottle",
    ];
const output = "/tmp/body-machines-review";
fs.mkdirSync(output, { recursive: true });
const server = createServer((req, res) => {
  try {
    const file = path.resolve(
      root,
      "." + new URL(req.url, "http://localhost").pathname,
    );
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    let data = fs.readFileSync(file);
    if (file.endsWith("/js/water-smoke-slime.js")) {
      const src = data.toString(),
        i = src.lastIndexOf("})();");
      data = Buffer.from(
        src.slice(0, i) +
          "window.__bodyTest=source=>eval(source);\n" +
          src.slice(i),
      );
    }
    res
      .writeHead(200, {
        "Content-Type":
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".woff2": "font/woff2",
          }[path.extname(file)] || "application/octet-stream",
      })
      .end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
const errors = [],
  results = {};
try {
  browser = await chromium.launch({
    ...launchOptions,
    args: [
      "--enable-unsafe-webgpu",
      "--use-angle=metal",
      "--disable-gpu-sandbox",
    ],
  });
  const page = await browser.newPage({
    viewport: mobile
      ? { width: 844, height: 390 }
      : { width: 1440, height: 900 },
    hasTouch: mobile,
    isMobile: mobile,
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const sim = (source) =>
    page.evaluate((source) => window.__bodyTest(source), source);
  async function load(id, options = {}) {
    await page.goto(
      `http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=${id}&paused=1`,
    );
    await page.waitForFunction(
      () => window.__toy && __toy.machineState()?.ready,
      {},
      { timeout: 90000 },
    );
    if (Object.keys(options).length) {
      await page.evaluate(({ id, options }) => __toy.machine(id, options), {
        id,
        options,
      });
      await page.waitForFunction(() => __toy.machineState()?.ready);
    }
    // Run full application frames on a deterministic clock, including jello,
    // native readback, check valves and runtime. The draw has no physics shortcut.
    await sim(
      "stopLoop();startLoop=function(){};demoActivity.requestFrame=function(){return 0;};lastT=1000;window.__bodyTime=1000;",
    );
    await page.evaluate(() => {
      __toy.pause(false);
      __toy.tool("poke");
    });
  }
  async function advance(seconds) {
    await sim(
      `(async()=>{for(var i=0;i<${Math.ceil(seconds * 60)};i++){window.__bodyTime+=1000/60;frame(window.__bodyTime);if(liquidWGPU)await liquidWGPU.queue.onSubmittedWorkDone();await new Promise(r=>setTimeout(r,0));}render();})()`,
    );
  }
  const primary = () => page.evaluate(() => __toy.machinePrimary());
  async function clickControl(id) {
    const control = await page.evaluate(
      (id) => __toy.machineControls().find((c) => c.id === id),
      id,
    );
    assert(control, "The control must be exposed to the UI");
    const button = page
      .locator("#toy-scene-actions")
      .getByRole("button", { name: control.label, exact: true });
    await button.waitFor({ state: "visible" });
    if (mobile) await button.tap();
    else await button.click();
  }
  async function state() {
    return page.evaluate(() => {
      const L = __toy.liquid(),
        d = __toy.machineState().definition,
        a = L.liquid.arrays,
        n = L.liquid.getCount(),
        regions = {},
        surfaces = {};
      let finite = true,
        jet = 0,
        exit = 0;
      for (const v of d.vessels) {
        regions[v.id] = 0;
        surfaces[v.id] = Infinity;
      }
      for (let i = 0; i < n; i++) {
        if (a.type[i] !== 0) continue;
        const x = a.x[i],
          y = a.y[i];
        finite &&= Number.isFinite(x + y + a.vx[i] + a.vy[i]);
        for (const v of d.vessels) {
          const r = v.rect;
          if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) {
            regions[v.id]++;
            surfaces[v.id] = Math.min(surfaces[v.id], y);
          }
        }
        if (x > 530 && y < 280) jet++;
        if (x > 624 && y < 320) exit++;
      }
      return {
        parts: __toy.builder().getParts(),
        clock: L.simulationClock,
        n,
        finite,
        regions,
        surfaces,
        jet,
        exit,
        run: __toy.runtime()?.stats?.(),
        balloon: __toy.balloons()?.stats(),
        divers: __toy.divers()?.stats(),
        boundary: __toy.stats().boundary,
        bodies: __toy
          .bodies()
          .map((b) => ({
            x: b.cx,
            y: b.cy,
            finite:
              Array.from(b.px).every(Number.isFinite) &&
              Array.from(b.py).every(Number.isFinite),
          })),
        error: __toy.instruments().error,
      };
    });
  }
  async function check(id) {
    await load(id);
    const initial = await state();
    let samples = [];
    if (args.includes("--probe")) {
      for (let i = 0; i < 4; i++) {
        if (
          !args.includes("--nopush") &&
          (i === 0 ||
            [
              "pitcher-pump",
              "spray-bottle",
              "slime-sipper",
              "slime-mail",
            ].includes(id))
        )
          await primary();
        await advance(3);
        samples.push(await state());
        console.log(id, i, JSON.stringify(samples.at(-1)));
      }
    } else if (id === "shishi-odoshi") {
      await advance(14);
      const wet = await state();
      assert(
        wet.run.cycles >= 2,
        "Native water must repeatedly fill, tip, drain and reset the trough",
      );
      await load(id, { tapEnabled: false, dry: true });
      await advance(8);
      const dry = await state();
      assert.equal(dry.run.cycles, 0);
      assert.equal(
        dry.run.angle,
        -0.25,
        "An empty trough stays at the counterweight stop",
      );
      samples = [wet, dry];
    } else if (id === "lift-lock" || id === "ballast-railway") {
      await advance(7);
      const wet = await state();
      assert(
        wet.run.position > 100,
        "Added native ballast must drive the common coordinate",
      );
      assert(
        wet.run.counts[0] > 0 && wet.run.counts[1] > 0,
        "Both moving cups must carry water",
      );
      await clickControl("drain-cars");
      await advance(5);
      const drained = await state();
      assert(drained.run.drains);
      assert(
        drained.run.counts.reduce((a, b) => a + b, 0) <
          wet.run.counts.reduce((a, b) => a + b, 0) * 0.6,
        "Opening real floor drains must unload the water",
      );
      await load(id, { tapEnabled: false, dry: true });
      await advance(5);
      const dry = await state();
      assert.equal(
        dry.run.position,
        0,
        "Empty linked carriers must not run a scripted route",
      );
      samples = [wet, drained, dry];
    } else if (id === "fountain-rider") {
      await advance(8);
      const wet = await state();
      assert(
        wet.bodies[0].y < initial.bodies[0].y - 25,
        "The native upward jet must lift the slime",
      );
      await primary();
      await advance(6);
      const off = await state();
      assert(
        off.bodies[0].y > 340,
        "Removing the stream must let the slime fall",
      );
      samples = [wet, off];
    } else if (id === "canal-locks") {
      await advance(4);
      const before = await state();
      await primary();
      await advance(8);
      const filled = await state();
      assert(
        filled.regions.lock > before.regions.lock + 1500,
        "Opening the upper gate must fill the lock",
      );
      assert(
        filled.bodies[0].y < before.bodies[0].y - 8,
        "The boat must rise with water",
      );
      await primary();
      await primary();
      await advance(8);
      const emptied = await state();
      assert(
        emptied.regions.lock < filled.regions.lock - 1000,
        "The lower gate must drain the lock",
      );
      assert(
        emptied.bodies[0].y > filled.bodies[0].y + 8,
        "The boat must descend with the water",
      );
      assert.equal(emptied.n, initial.n);
      samples = [before, filled, emptied];
    } else if (id === "squid-jet" || id === "jellyfish") {
      await advance(7);
      const passive = await state();
      await load(id);
      await clickControl("muscle");
      await advance(7);
      const active = await state();
      assert(active.run.cycles >= 5);
      assert(
        active.run.slitCrossings > 200,
        "A contraction must exchange native water through the actual mouth",
      );
      assert(
        Math.hypot(
          active.bodies[0].x - passive.bodies[0].x,
          active.bodies[0].y - passive.bodies[0].y,
        ) > 15,
        "Muscle work must change the free body motion relative to its passive control: "+JSON.stringify({passive:passive.bodies[0],active:active.bodies[0]}),
      );
      assert.equal(active.n, initial.n);
      await primary();
      const cycle = active.run.cycles;
      await advance(2);
      const stopped = await state();
      assert.equal(stopped.run.cycles, cycle);
      samples = [passive, active, stopped];
    } else if (id === "slime-sipper") {
      await clickControl("muscle");
      await advance(4);
      const expanded = await state();
      await primary();
      await advance(4);
      const squeezed = await state();
      await primary();
      await advance(4);
      const refilled = await state();
      assert(
        expanded.balloon.carriedInside > initial.balloon.carriedInside + 200,
        "Expansion must draw actual water into the skin",
      );
      assert(
        squeezed.balloon.carriedInside < expanded.balloon.carriedInside - 40,
        "Squeezing must return native water through its mouth",
      );
      assert(
        refilled.balloon.carriedInside > squeezed.balloon.carriedInside + 40,
        "A second expansion must refill",
      );
      assert.equal(refilled.n, initial.n);
      samples = [expanded, squeezed, refilled];
    } else if (id === "water-balloon-fight") {
      await page.evaluate(() => __toy.fling(0, 600, 200));
      await advance(3);
      const hit = await state();
      assert(
        hit.run.impactBurst && hit.balloon.popped,
        "Throwing into a target must burst the membrane from impact",
      );
      assert.equal(hit.bodies.length, 2, "Rupture must remove the burst skin");
      assert.equal(
        hit.n,
        initial.n,
        "Bursting releases the original water without deleting it",
      );
      samples = [hit];
    } else if (id === "slime-mail") {
      await advance(4);
      const passive = await state();
      for (let i = 0; i < 8; i++) {
        await primary();
        await advance(2);
        samples.push(await state());
      }
      assert(
        Math.abs(passive.bodies[0].x - initial.bodies[0].x) < 10,
        "A parcel at rest must not follow an assigned delivery path",
      );
      assert(
        samples.at(-1).bodies[0].x > 608,
        "Repeated native air pulses must deliver the parcel through the outlet",
      );
    } else if (id === "pitcher-pump" || id === "spray-bottle") {
      await advance(3);
      const idle = await state();
      const key = id === "pitcher-pump" ? "receiver" : "catcher";
      assert.equal(
        idle.regions[key],
        0,
        "The elevated outlet must not deliver without pumping",
      );
      for (let i = 0; i < 5; i++) {
        await primary();
        await advance(3.5);
        samples.push(await state());
      }
      assert(
        samples.at(-1).regions[key] > 400,
        "Repeated piston strokes must deliver native water to the collector: "+JSON.stringify(samples.map(s=>s.regions[key])),
      );
      assert.equal(
        samples.at(-1).n,
        initial.n,
        "Finite source, pipes and receiver conserve the particle inventory",
      );
      assert(
        samples[1].regions[id === "pitcher-pump" ? "source" : "supply"] <
          idle.regions[id === "pitcher-pump" ? "source" : "supply"] - 300,
        "A return stroke must draw supply water through the inlet",
      );
    } else if (id === "super-soaker") {
      await advance(4);
      const closed = await state();
      assert.equal(closed.exit, 0, "The closed trigger must retain the charge");
      await primary();
      let peakExit = 0;
      for (let i = 0; i < 8; i++) {
        await advance(0.5);
        const shot = await state();
        peakExit = Math.max(peakExit, shot.exit);
        samples.push(shot);
      }
      const open = await state();
      assert(
        peakExit > 100,
        "Stored pressure must drive native water beyond the nozzle",
      );
      assert.equal(open.n, initial.n);
      samples.unshift(closed);
      await clickControl("air-piston");
      assert.equal((await state()).divers.squeezed, false);
      await clickControl("air-piston");
      assert.equal((await state()).divers.squeezed, true);
    }
    for (const sample of samples) {
      assert(
        sample.finite && sample.bodies.every((b) => b.finite),
        "All native parcels and gel nodes must remain finite",
      );
      assert(!sample.error, `${id}: ${sample.error}`);
    }
    // Pausing must freeze the native clock between events.
    await page.locator("#toy-pause").click();
    const frozen = await state();
    await page.waitForTimeout(150);
    assert.equal((await state()).clock, frozen.clock);
    await page.screenshot({
      path: path.join(output, `${id}${mobile ? "-mobile" : ""}.png`),
    });
    results[id] = { initial, samples };
    console.log("PASS", id);
    fs.writeFileSync(
      path.join(output, "result" + (mobile ? "-mobile" : "") + ".json"),
      JSON.stringify(results, null, 2),
    );
  }
  for (const id of selected) await check(id);
  assert.deepEqual(errors, [], "No browser errors");
  console.log("PASS native body machine behavior", selected.length);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
