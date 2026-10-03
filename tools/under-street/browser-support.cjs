// Resolve test dependencies without using the owner's personal Chrome app.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let playwright;
if (process.env.UNDER_MAP_PLAYWRIGHT) playwright = require(process.env.UNDER_MAP_PLAYWRIGHT);
else {
  try { playwright = require('playwright'); }
  catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
}
const executable = process.env.UNDER_MAP_CHROME || path.join(os.homedir(), '.local/bin/agent-chrome-for-testing');
if (executable.includes('/Applications/Google Chrome.app/')) throw new Error('Use Chrome for Testing, not the personal Chrome application.');
module.exports = {
  chromium: playwright.chromium,
  launchOptions: fs.existsSync(executable) ? { headless:true, executablePath:executable } : { headless:true }
};
