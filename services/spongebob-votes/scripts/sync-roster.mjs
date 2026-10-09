import { readFile, writeFile } from 'node:fs/promises';
const catalog = JSON.parse(await readFile(new URL('../../../assets/spongebob/characters.json', import.meta.url), 'utf8'));
const ids = catalog.characters.map(character => character.id).sort();
await writeFile(new URL('../roster.json', import.meta.url), JSON.stringify(ids, null, 2) + '\n');
console.log(`Synced ${ids.length} character IDs.`);
