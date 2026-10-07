import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {ROOT, toolLock} from './core.mjs';
import {serve, browserRun} from './browser.mjs';

const require = createRequire(import.meta.url);
const sharp = require(process.env.CHAIN_REACTION_SHARP);
const unlock = await toolLock();
let server;
try {
  server = await serve();
  await browserRun('chromium', async browser => {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 2, reducedMotion: 'reduce'});
    await page.goto(server.url + '/chain-reaction/connected-slice.html?paused=1#stage=4');
    await page.waitForFunction(() => window.ChainReactionPage?.ready);
    await page.evaluate(() => ChainReactionPage.seek(4, 2));
    await page.addStyleTag({content: '.cr-home,.cr-title,.cr-controls,.cr-status,.cr-frontier{display:none!important}'});
    const bytes = await page.locator('#machine').screenshot();
    const target = resolve(ROOT, 'assets/chain-reaction/workbench');
    await sharp(bytes).resize(1200, 750, {fit: 'cover'}).jpeg({quality: 90}).toFile(target + '.jpg');
    await sharp(bytes).resize(1200, 750, {fit: 'cover'}).webp({quality: 82}).toFile(target + '.webp');
  });
} finally {await server?.close(); await unlock();}
