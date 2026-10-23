using System;
using System.IO;
using System.IO.Compression;
using System.Text;

namespace OneShift.RackLab
{
    public static class WarehouseWebFramework
    {
        const string Hook = "Module[\"SetRefreshMonitorActive\"]";

        // Unity 6000.3 measures display refresh rate in a separate animation
        // loop. Give the page a control for that loop as well as the player.
        // Keep this strict so an Editor upgrade cannot silently skip the fix.
        public static bool PrepareFile(string path)
        {
            byte[] original = File.ReadAllBytes(path);
            string framework;
            using (var input = new MemoryStream(original))
            using (var gzip = new GZipStream(input, CompressionMode.Decompress))
            using (var reader = new StreamReader(gzip, Encoding.UTF8)) framework = reader.ReadToEnd();
            if (framework.Contains(Hook)) return false;
            string updated = PrepareSource(framework);
            int headerLength = GzipHeaderLength(original);
            byte[] compressed;
            using (var output = new MemoryStream())
            {
                using (var gzip = new GZipStream(output, CompressionLevel.Optimal, true))
                {
                    byte[] source = Encoding.UTF8.GetBytes(updated);
                    gzip.Write(source, 0, source.Length);
                }
                compressed = output.ToArray();
            }
            // Unity's fallback loader identifies its gzip comment. Preserve
            // that complete original header while replacing payload and CRC.
            int replacementHeaderLength = GzipHeaderLength(compressed);
            using (var output = new MemoryStream())
            {
                output.Write(original, 0, headerLength);
                output.Write(compressed, replacementHeaderLength, compressed.Length - replacementHeaderLength);
                File.WriteAllBytes(path, output.ToArray());
            }
            return true;
        }

        public static string PrepareSource(string framework)
        {
            if (framework.Contains(Hook)) return framework;
            const string start = "let screenAnimationFrameRate=60;(function(){";
            int first = framework.IndexOf(start, StringComparison.Ordinal);
            int last = first < 0 ? -1 : framework.IndexOf("})();", first, StringComparison.Ordinal);
            if (first < 0 || last < 0) throw new InvalidDataException("Unity refresh monitor changed. Review browser loop integration before publishing.");
            last += 5;
            string monitor = framework.Substring(first, last - first);
            monitor = ReplaceOnce(monitor, "const startTime=performance.now();",
                "const startTime=performance.now();let monitorFrame=0,monitorActive=true;" + Hook + "=function(active){" +
                "active=!!active;if(active===monitorActive)return;monitorActive=active;" +
                "if(monitorFrame){cancelAnimationFrame(monitorFrame);monitorFrame=0;}" +
                "if(active){deltaTimes.fill(defaultDelta);deltaTimeSums.fill(1e3);const now=performance.now();" +
                "monitorFrame=requestAnimationFrame(()=>rafUpdateLoop(0,now,performance.now()));}};");
            monitor = ReplaceOnce(monitor, "requestAnimationFrame(()=>rafUpdateLoop(0,startTime,performance.now()));",
                "monitorFrame=requestAnimationFrame(()=>rafUpdateLoop(0,startTime,performance.now()));");
            monitor = ReplaceOnce(monitor, "function rafUpdateLoop(index,prevTime,currTime){",
                "function rafUpdateLoop(index,prevTime,currTime){monitorFrame=0;if(!monitorActive)return;");
            monitor = ReplaceOnce(monitor, "requestAnimationFrame(()=>rafUpdateLoop((index+1)%60,currTime,performance.now()))",
                "if(monitorActive)monitorFrame=requestAnimationFrame(()=>rafUpdateLoop((index+1)%60,currTime,performance.now()))");
            return framework.Substring(0, first) + monitor + framework.Substring(last);
        }

        static string ReplaceOnce(string source, string oldText, string newText)
        {
            int first = source.IndexOf(oldText, StringComparison.Ordinal);
            if (first < 0 || source.IndexOf(oldText, first + oldText.Length, StringComparison.Ordinal) >= 0)
                throw new InvalidDataException("Unexpected Unity refresh monitor code. Review browser loop integration before publishing.");
            return source.Substring(0, first) + newText + source.Substring(first + oldText.Length);
        }

        static int GzipHeaderLength(byte[] data)
        {
            if (data.Length < 18 || data[0] != 31 || data[1] != 139 || data[2] != 8)
                throw new InvalidDataException("Expected gzip Unity framework.");
            int cursor = 10;
            if ((data[3] & 4) != 0)
            {
                if (cursor + 2 > data.Length) throw new InvalidDataException("Incomplete gzip header.");
                int extra = data[cursor] | data[cursor + 1] << 8;
                cursor += 2 + extra;
            }
            foreach (int flag in new[] { 8, 16 })
            {
                if ((data[3] & flag) == 0) continue;
                while (cursor < data.Length && data[cursor] != 0) cursor++;
                cursor++;
            }
            if ((data[3] & 2) != 0) cursor += 2;
            if (cursor > data.Length - 8) throw new InvalidDataException("Incomplete gzip header.");
            return cursor;
        }
    }
}
