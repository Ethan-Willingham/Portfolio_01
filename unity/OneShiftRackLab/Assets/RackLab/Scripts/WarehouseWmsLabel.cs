using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace OneShift.RackLab
{
    // A physical label owns its printed Code 128 payload. Scanning targets this
    // small face, never the parent carton or an inventory row behind a wall.
    [DisallowMultipleComponent]
    public sealed class WarehouseWmsLabel : MonoBehaviour
    {
        public string Code, Kind, Id, Caption;
        public BoxCollider ScanFace;
        public TextMesh DescriptionText;
        public TextMesh CodeText;
        public Vector2 PaperSize;
        public Rect DescriptionArea, CodeArea, BarcodeArea;
        public bool ShelfTicket;
        public Vector3 Normal => transform.forward;
        public Vector3 ScanPoint => ScanFace != null ? ScanFace.transform.TransformPoint(ScanFace.center) : transform.position;
        public Renderer[] Visuals;

        public static WarehouseWmsLabel Create(Transform parent, Vector3 position, Quaternion rotation,
            Vector2 size, string code, string kind, string id, string caption, string detail,
            Material paper, Material ink)
        {
            if (!WarehouseCode128.TryEncode(code, out var symbols))
                throw new ArgumentException("WMS labels require printable ASCII Code 128-B payloads.", nameof(code));
            var node = new GameObject("Label / " + code);
            node.transform.SetParent(parent, false); node.transform.localPosition = position; node.transform.localRotation = rotation;
            var label = node.AddComponent<WarehouseWmsLabel>();
            label.Code = code; label.Kind = kind; label.Id = id; label.Caption = caption; label.PaperSize = size;
            label.ShelfTicket = kind == "bin" && size.y <= .13f;
            label.DescriptionArea = label.ShelfTicket
                ? new Rect(-size.x*.465f,-size.y*.27f,size.x*.365f,size.y*.62f)
                : new Rect(-size.x*.45f,size.y*.035f,size.x*.90f,size.y*.405f);
            label.CodeArea = label.ShelfTicket
                ? new Rect(-size.x*.04f,-size.y*.425f,size.x*.50f,size.y*.13f)
                : new Rect(-size.x*.45f,-size.y*.455f,size.x*.90f,size.y*.12f);
            label.BarcodeArea = label.ShelfTicket
                ? new Rect(-size.x*.06f,-size.y*.21f,size.x*.53f,size.y*.60f)
                : new Rect(-size.x*.47f,-size.y*.29f,size.x*.94f,size.y*.28f);
            var mesh = new Mesh { name = "Code 128 / " + code };
            var vertices = new List<Vector3>(); var white = new List<int>(); var black = new List<int>();
            var normals = new List<Vector3>(); var uv = new List<Vector2>();
            void Quad(float x, float y, float w, float h, float z, List<int> triangles)
            {
                int first = vertices.Count;
                vertices.Add(new Vector3(x, y, z)); vertices.Add(new Vector3(x + w, y, z));
                vertices.Add(new Vector3(x + w, y + h, z)); vertices.Add(new Vector3(x, y + h, z));
                for (int i = 0; i < 4; i++) { normals.Add(Vector3.forward); uv.Add(Vector2.zero); }
                triangles.Add(first); triangles.Add(first + 1); triangles.Add(first + 2);
                triangles.Add(first); triangles.Add(first + 2); triangles.Add(first + 3);
            }
            Quad(-size.x * .5f, -size.y * .5f, size.x, size.y, 0, white);
            int modules = WarehouseCode128.ModuleCount(symbols) + 20;
            float module = label.BarcodeArea.width / modules;
            float cursor = label.BarcodeArea.xMin + module * 10;
            float barcodeY = label.BarcodeArea.yMin, barcodeHeight = label.BarcodeArea.height;
            foreach (int symbol in symbols)
            {
                string widths = WarehouseCode128.Pattern(symbol);
                for (int i = 0; i < widths.Length; i++)
                {
                    float width = (widths[i] - '0') * module;
                    if ((i & 1) == 0) Quad(cursor, barcodeY, width, barcodeHeight, .0006f, black);
                    cursor += width;
                }
            }
            mesh.SetVertices(vertices); mesh.SetNormals(normals); mesh.SetUVs(0, uv);
            mesh.subMeshCount = 2; mesh.SetTriangles(white, 0); mesh.SetTriangles(black, 1); mesh.RecalculateBounds();
            node.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = node.AddComponent<MeshRenderer>(); renderer.sharedMaterials = new[] { paper, ink };
            renderer.shadowCastingMode = ShadowCastingMode.Off; renderer.receiveShadows = true;
            var text = new GameObject("Printed description").AddComponent<TextMesh>();
            text.transform.SetParent(node.transform, false); text.transform.localPosition = new Vector3(0, size.y * .29f, .0012f);
            text.transform.localRotation = Quaternion.Euler(0, 180, 0);
            WarehouseCareer.UseWarehouseFont(text); text.anchor = TextAnchor.UpperCenter; text.alignment = TextAlignment.Center;
            text.fontSize = 72;
            text.fontStyle = FontStyle.Bold;
            // Unlit text colours are linear: printed ink must remain darker
            // than the shaded paper rather than appearing luminous on it.
            text.color = new Color(.004f, .004f, .004f);
            label.DescriptionText=text;label.SetPrintedDetail(caption,detail);
            var human = new GameObject("Human-readable code").AddComponent<TextMesh>();
            human.transform.SetParent(node.transform, false); human.transform.localPosition = new Vector3(0, -size.y * .34f, .0012f);
            human.transform.localRotation = Quaternion.Euler(0, 180, 0);
            WarehouseCareer.UseWarehouseFont(human); human.anchor = TextAnchor.UpperCenter; human.alignment = TextAlignment.Center;
            human.fontSize = 56;
            human.color = text.color;
            human.text = kind=="item"?WarehouseWmsVocabulary.ItemCode(id):id;
            label.CodeText=human;
            FitPrint(human,label.CodeArea);
            label.ScanFace = node.AddComponent<BoxCollider>(); label.ScanFace.isTrigger = true;
            label.ScanFace.center = new Vector3(label.BarcodeArea.center.x, barcodeY + barcodeHeight * .5f, .003f);
            label.ScanFace.size = new Vector3(label.BarcodeArea.width, barcodeHeight, .004f);
            label.Visuals = new Renderer[] { renderer, text.GetComponent<Renderer>(), human.GetComponent<Renderer>() };
            return label;
        }

        static string Fit(string text, int count) => text.Length <= count ? text : text.Substring(0, count - 1) + ".";
        public void SetPrintedDetail(string caption,string detail)
        {
            Caption=caption;
            if(DescriptionText==null)return;
            string[] lines=(detail??"").Split('\n');
            string value=Fit((caption??"").ToUpperInvariant(),30);
            // One bold address is the shelf ticket's reading target. Level and
            // side are already encoded in it, without another miniature line.
            for(int i=0;i<Mathf.Min(ShelfTicket?0:2,lines.Length);i++)value+="\n"+Fit(lines[i],30);
            DescriptionText.text=value;
            FitPrint(DescriptionText,DescriptionArea);
        }
        static void FitPrint(TextMesh text,Rect area)
        {FitText(text,area.size,new Vector3(area.center.x,area.center.y,.0012f));}
        // characterSize is multiplied by the font's real glyph metrics. Fit
        // those generated bounds, including line spacing, into an explicit
        // print area instead of estimating size from a character count.
        public static void FitText(TextMesh text,Vector2 maximumSize,Vector3 centre)
        {
            text.characterSize=1;text.transform.localScale=Vector3.one;
            if(text.font!=null)text.font.RequestCharactersInTexture(text.text,text.fontSize,text.fontStyle);
            Bounds bounds=text.GetComponent<Renderer>().localBounds;
            if(bounds.size.x<=.00001f||bounds.size.y<=.00001f)
            {
                string[] lines=text.text.Split('\n');int longest=1;foreach(string line in lines)longest=Mathf.Max(longest,line.Length);
                // Conservative first-frame fallback for an unavailable atlas.
                bounds=new Bounds(Vector3.zero,new Vector3(longest*text.fontSize*.075f,lines.Length*text.fontSize*.15f,.001f));
            }
            float scale=Mathf.Min(maximumSize.x/bounds.size.x,maximumSize.y/bounds.size.y);
            text.transform.localScale=Vector3.one*scale;
            text.transform.localPosition=centre-text.transform.localRotation*(bounds.center*scale);
        }
        void OnDestroy()
        {
            var filter = GetComponent<MeshFilter>();
            if (filter != null && filter.sharedMesh != null) WarehouseCourierVisuals.Remove(filter.sharedMesh);
        }
    }

    // ISO/IEC 15417 Code 128 symbol module widths. These are the standard
    // alphabet values, also documented by ZXing's Code128Reader. Encoding is
    // original here: start-B, weighted modulo-103 checksum, stop, quiet zones.
    public static class WarehouseCode128
    {
        static readonly string[] widths = {
            "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
            "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
            "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
            "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
            "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
            "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
            "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
            "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
            "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
            "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
            "114131","311141","411131","211412","211214","211232","2331112"
        };
        public static string Pattern(int symbol) => widths[symbol];
        public static bool TryEncode(string value, out int[] symbols)
        {
            symbols = null;
            if (string.IsNullOrEmpty(value) || value.Length > 48) return false;
            var result = new int[value.Length + 3]; result[0] = 104; int checksum = 104;
            for (int i = 0; i < value.Length; i++)
            {
                if (value[i] < 32 || value[i] > 126) return false;
                int code = value[i] - 32; result[i + 1] = code; checksum += code * (i + 1);
            }
            result[result.Length - 2] = checksum % 103; result[result.Length - 1] = 106;
            symbols = result; return true;
        }
        public static int ModuleCount(int[] symbols)
        { int count = 0; foreach (int symbol in symbols) foreach (char width in widths[symbol]) count += width - '0'; return count; }
        public static bool TryDecode(int[] symbols, out string value)
        {
            value = "";
            if (symbols == null || symbols.Length < 4 || symbols[0] != 104 || symbols[symbols.Length - 1] != 106) return false;
            int checksum = 104; var chars = new char[symbols.Length - 3];
            for (int i = 1; i < symbols.Length - 2; i++)
            { if (symbols[i] < 0 || symbols[i] > 94) return false; chars[i - 1] = (char)(symbols[i] + 32); checksum += symbols[i] * i; }
            if (checksum % 103 != symbols[symbols.Length - 2]) return false;
            value = new string(chars); return true;
        }
    }
}
