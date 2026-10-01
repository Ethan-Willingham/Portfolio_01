// Export the original, visible Aseprite artwork without changing its pixels.
// node tools/export-hunting-art.mjs [path-to-aseprite]
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const executable = process.argv[2] || join(homedir(), 'Library/Application Support/Steam/steamapps/common/Aseprite/Aseprite.app/Contents/MacOS/aseprite');
const source = join(root, 'assets/hunting/source');
for (const file of readdirSync(source).filter(name => name.endsWith('.aseprite')).sort()) {
  const output = join(root, 'assets/hunting', file.replace(/\.aseprite$/, '.png'));
  execFileSync(executable, ['--batch', join(source, file), '--trim', '--save-as', output], { stdio: 'inherit' });
  console.log(file + ' -> ' + output);
}
