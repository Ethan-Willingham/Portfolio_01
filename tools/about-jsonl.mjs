import { createReadStream } from 'node:fs';

// Session transcripts can exceed Node's maximum string size. Keep only the
// current record in memory, including records spanning multiple UTF-8 chunks.
export async function* jsonlLines(file) {
  const input = createReadStream(file, { encoding: 'utf8' });
  const parts = [];
  try {
    for await (const chunk of input) {
      let start = 0;
      let end;
      // Only LF separates JSONL records. Unicode paragraph separators are
      // valid inside JSON strings and must not split a record.
      while ((end = chunk.indexOf('\n', start)) !== -1) {
        const piece = chunk.slice(start, end);
        const line = parts.length ? parts.concat(piece).join('') : piece;
        parts.length = 0;
        yield line.endsWith('\r') ? line.slice(0, -1) : line;
        start = end + 1;
      }
      if (start < chunk.length) parts.push(chunk.slice(start));
    }
    if (parts.length) yield parts.join('');
  } finally {
    input.destroy();
  }
}
