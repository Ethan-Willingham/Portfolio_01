// Exercise lossless city data delivery in native and older browsers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { chromium, launchOptions } = require('./browser-support.cjs');
const root = path.resolve(__dirname, '../..');
const mapRoot = path.join(root, 'archive/under-the-street/assets/map');
const file = 'data/wells-complete.json.gz';
const bytes = fs.readFileSync(path.join(mapRoot, file));
const original = zlib.gunzipSync(bytes);
const expected = JSON.parse(original).features.length;
const hooks = `window.__compressionAudit={state:()=>({loaded:data.wells?.features?.length,error:data.wells?.error}),first:()=>data.wells?.features?.[0]?.id};`;
const mime = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
const server = http.createServer((req, res) => {
  const target = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!target.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {
    let content = fs.readFileSync(target);
    if (target.endsWith('/under-map.js')) {
      const source = content.toString(), end = source.lastIndexOf('})();');
      content = Buffer.from(source.slice(0, end) + hooks + source.slice(end));
    }
    res.writeHead(200, {'Content-Type':mime[path.extname(target)] || 'application/octet-stream'}).end(content);
  } catch { res.writeHead(404).end(); }
});
let browser, url;
const errors = [];
async function open(configure) {
  const context = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://www.googletagmanager.com/**', route => route.abort());
  if (configure) await configure(page);
  await page.goto(url + '/archive/under-the-street/under-the-street.html#map=14/44.95/-93.12&topic=ground&layers=wells');
  return {page, context};
}
async function ready(page) {
  await page.waitForFunction(count => window.__compressionAudit?.state().loaded === count && !__compressionAudit.state().error, expected);
  assert.ok(await page.locator('.um-result').count(), 'Decoded data reaches the place browser');
  assert.match(await page.evaluate(() => __compressionAudit.first()), /^wells-/);
}
(async () => { try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch(launchOptions);
  let decoderRequests = 0;
  const native = await open(page => page.route('**/vendor/fflate-*.js?*', route => {decoderRequests++;return route.continue();}));
  await ready(native.page);
  assert.equal(decoderRequests, 0, 'Native browsers do not download the fallback');
  await native.context.close();

  const fallback = await open(async page => {
    await page.addInitScript(() => {window.DecompressionStream = undefined;});
    await page.route('**/vendor/fflate-*.js?*', route => {decoderRequests++;return route.continue();});
  });
  await ready(fallback.page);
  assert.equal(decoderRequests, 1, 'Fallback decoder loads once when needed');
  await fallback.context.close();

  const decoded = await open(page => page.route('**/data/wells-complete.json.gz?*', route => route.fulfill({status:200,contentType:'application/json',body:original})));
  await ready(decoded.page);
  await decoded.context.close();

  let damagedOnce = false;
  const retry = await open(page => page.route('**/data/wells-complete.json.gz?*', route => {
    if (!damagedOnce) {damagedOnce = true;return route.fulfill({status:200,body:Buffer.from([31,139,8,0])});}
    return route.continue();
  }));
  await retry.page.waitForFunction(() => window.__compressionAudit?.state().error);
  await retry.page.locator('.um-layers').evaluate(node => {node.open = true;});
  assert.match(await retry.page.locator('[data-layer="wells"] small').textContent(), /retry/i);
  await retry.page.locator('[data-layer="wells"]').click();
  await ready(retry.page);
  await retry.context.close();

  let decoderFailedOnce = false, retryRequests = 0;
  const decoderRetry = await open(async page => {
    await page.addInitScript(() => {window.DecompressionStream = undefined;});
    await page.route('**/vendor/fflate-*.js?*', route => {
      retryRequests++;
      if (!decoderFailedOnce) {decoderFailedOnce = true;return route.abort();}
      return route.continue();
    });
  });
  await decoderRetry.page.waitForFunction(() => window.__compressionAudit?.state().error);
  await decoderRetry.page.locator('.um-layers').evaluate(node => {node.open = true;});
  await decoderRetry.page.locator('[data-layer="wells"]').click();
  await ready(decoderRetry.page);
  assert.equal(retryRequests, 2, 'Failed fallback loading can retry');
  await decoderRetry.context.close();
  assert.deepEqual(errors, []);
  console.log('PASS Saint Paul well records through native gzip, lazy fallback, server-decoded responses, corrupt-data retry and decoder retry');
} finally {if (browser) await browser.close();await new Promise(resolve => server.close(resolve));}})().catch(error => {console.error(error);process.exitCode=1;});
