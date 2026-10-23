using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace OneShift.RackLab
{
    // Source pallets remain editable in Blender. This builds the derived game assets.
    public static class PalletRowBuilder
    {
        const string Root = "Assets/RackLab/";
        public const float BayPitch = 2.53f;
        public const float RowZ = 3.5f;
        static readonly string[] Slugs = { "01_Fresh_Pine", "02_Working_Wear", "03_Split_Battered", "04_Repaired" };
        static readonly string[] Names = { "Fresh pine", "Working wear", "Split and battered", "Repaired" };
        static Font font;

        public static void Build(Material[] finishes, Font labelFont)
        {
            font = labelFont;
            var pallets = CreatePallets();
            var cargo = CreateCargo();
            var row = new GameObject("Connected pallet rack - three bays");
            row.transform.position = new Vector3(0, 0, RowZ);
            var wear = row.AddComponent<RackWearVariant>();
            wear.finishes = finishes; wear.condition = 1;
            for (int i = 0; i < 4; i++)
            {
                var frame = Model("Shared upright frame " + (i + 1), "connected-rack-modules.fbx", "Frame", new[] { finishes[1] }, true);
                BoxCollider(frame, "Braced upright frame", new Vector3(0, PalletRackBay.FrameHeight / 2, 0), new Vector3(.09f, PalletRackBay.FrameHeight, 1.07f));
                BoxCollider(frame, "Upright guard", new Vector3(0, .18f, -.55f), new Vector3(.315f, .36f, .30f));
                if (i == 0) PrefabUtility.SaveAsPrefabAsset(frame, Root + "Prefabs/PalletRackUpright.prefab");
                frame.transform.SetParent(row.transform, false);
                frame.transform.localPosition = new Vector3((i - 1.5f) * BayPitch, 0, 0);
            }
            for (int i = 0; i < 3; i++)
            {
                var bayObject = Model("Pallet bay A0" + (i + 1), "connected-rack-modules.fbx", "Bay", new[] { finishes[1] }, true);
                for (int level = 1; level <= 2; level++)
                {
                    float y = level * PalletRackBay.BeamPitch;
                    foreach (float z in new[] { -.495f, .495f })
                        BoxCollider(bayObject, "Load beam", new Vector3(0, y - .065f, z), new Vector3(2.44f, .13f, .07f));
                    BoxCollider(bayObject, "Wire deck", new Vector3(0, y + .005f, 0), new Vector3(2.414f, .012f, 1.078f));
                }
                var bay = bayObject.AddComponent<PalletRackBay>();
                bay.palletPositions = new Transform[6];
                bay.exampleLoads = new GameObject[0];
                for (int level = 0; level < 3; level++) for (int side = 0; side < 2; side++)
                {
                    var slot = new GameObject("Pallet position " + level + (side == 0 ? "L" : "R"));
                    slot.transform.SetParent(bay.transform, false);
                    slot.transform.localPosition = new Vector3((side == 0 ? -1 : 1) * PalletRackBay.PalletCenterOffset,
                        level == 0 ? .002f : level * PalletRackBay.BeamPitch + PalletRackBay.DeckAboveBeam + .001f, 0);
                    bay.palletPositions[level * 2 + side] = slot.transform;
                }
                if (i == 0) PrefabUtility.SaveAsPrefabAsset(bayObject, Root + "Prefabs/PalletRackBay.prefab");
                bayObject.transform.SetParent(row.transform, false);
                bayObject.transform.localPosition = new Vector3((i - 1) * BayPitch, 0, 0);
                // Leave A01's lower level open to inspect the full depth and fork pockets.
                int[] occupied = i == 0 ? new[] { 0, 3, 4 } : i == 1 ? new[] { 0, 1, 2, 3, 5 } : new[] { 0, 1, 2, 3, 4, 5 };
                bay.exampleLoads = new GameObject[occupied.Length];
                for (int j = 0; j < occupied.Length; j++)
                {
                    int variant = (i + j) % 4;
                    // Show the damaged pallet empty on the floor rather than under a tall load.
                    if (variant == 2) variant = 3;
                    var load = new GameObject("Pallet A0" + (i + 1) + "-" + occupied[j]);
                    load.transform.SetParent(bay.palletPositions[occupied[j]], false);
                    var pallet = (GameObject)PrefabUtility.InstantiatePrefab(pallets[variant]);
                    pallet.transform.SetParent(load.transform, false);
                    if (!(i == 0 && j < 2))
                    {
                        var cartons = (GameObject)PrefabUtility.InstantiatePrefab(cargo);
                        cartons.transform.SetParent(load.transform, false);
                    }
                    bay.exampleLoads[j] = load;
                }
                Label("A0" + (i + 1), bay.transform.position + new Vector3(-1.16f, 1.68f, -.55f), .055f, Quaternion.identity, bay.transform);
            }
            PrefabUtility.SaveAsPrefabAsset(row, Root + "Prefabs/ConnectedPalletRackRow.prefab");

            // Preserve the original three shelf studies as a separate accessible row.
            var original = new GameObject("Original green racks");
            for (int i = 0; i < 3; i++)
            {
                var rack = Model("Original rack - " + new[] { "Clean", "Used", "Worn" }[i], "warehouse-rack-lods.fbx", "Rack", new[] { finishes[i] }, true);
                foreach (float x in new[] { -1.265f, 1.265f })
                {
                    BoxCollider(rack, "End frame", new Vector3(x, 1.83f, 0), new Vector3(.1f, 3.66f, 1.08f));
                    BoxCollider(rack, "Guard", new Vector3(x, .18f, -.55f), new Vector3(.315f, .36f, .30f));
                }
                foreach (float y in new[] { 1.12f, 2.24f, 3.36f })
                    BoxCollider(rack, "Shelf", new Vector3(0, y - .055f, 0), new Vector3(2.44f, .14f, 1.08f));
                var finish = rack.AddComponent<RackWearVariant>(); finish.finishes = finishes; finish.condition = i;
                PrefabUtility.SaveAsPrefabAsset(rack, Root + "Prefabs/Rack" + new[] { "Clean", "Used", "Worn" }[i] + ".prefab");
                rack.transform.SetParent(original.transform, false);
                rack.transform.SetPositionAndRotation(new Vector3(8.8f, 0, (i - 1) * 3.2f + 3.2f), Quaternion.Euler(0, 90, 0));
            }
            Label("ORIGINAL RACKS", new Vector3(8.15f, 3.95f, 3.2f), .12f, Quaternion.Euler(0, 90, 0), original.transform);

            var samples = new GameObject("Four pallet finishes - full size");
            for (int i = 0; i < 4; i++)
            {
                var pallet = (GameObject)PrefabUtility.InstantiatePrefab(pallets[i]);
                pallet.transform.SetParent(samples.transform, false);
                pallet.transform.position = new Vector3(-7.7f + (i % 2) * 1.65f, .002f, -1.5f + (i / 2) * 2.05f);
                Label(Names[i].ToUpperInvariant(), pallet.transform.position + new Vector3(0, .008f, -.83f), .065f, Quaternion.Euler(90, 0, 0), samples.transform);
            }
            Label("40 x 48 IN / FULL SIZE PALLETS", new Vector3(-6.88f, .009f, -3f), .08f, Quaternion.Euler(90, 0, 0), samples.transform);
            Label("FLOOR + TWO BEAM LEVELS", new Vector3(0, 5.53f, RowZ), .12f, Quaternion.identity, row.transform);
        }

        static GameObject[] CreatePallets()
        {
            var result = new GameObject[4];
            for (int v = 0; v < 4; v++)
            {
                string path = Root + "Textures/Pallets/" + Slugs[v];
                foreach (string suffix in new[] { "BaseColor", "Normal", "MetallicSmoothness" })
                {
                    var importer = (TextureImporter)AssetImporter.GetAtPath(path + "_" + suffix + ".png");
                    importer.textureType = suffix == "Normal" ? TextureImporterType.NormalMap : TextureImporterType.Default;
                    importer.sRGBTexture = suffix == "BaseColor";
                    importer.alphaSource = TextureImporterAlphaSource.FromInput;
                    importer.alphaIsTransparency = false;
                    importer.mipmapEnabled = true; importer.anisoLevel = 8;
                    importer.wrapMode = TextureWrapMode.Clamp; importer.maxTextureSize = 2048;
                    importer.textureCompression = TextureImporterCompression.CompressedHQ;
                    importer.SaveAndReimport();
                }
                var wood = new Material(Shader.Find("Universal Render Pipeline/Lit")) { name = Slugs[v], enableInstancing = true };
                wood.SetTexture("_BaseMap", AssetDatabase.LoadAssetAtPath<Texture2D>(path + "_BaseColor.png"));
                wood.SetTexture("_BumpMap", AssetDatabase.LoadAssetAtPath<Texture2D>(path + "_Normal.png"));
                wood.SetTexture("_MetallicGlossMap", AssetDatabase.LoadAssetAtPath<Texture2D>(path + "_MetallicSmoothness.png"));
                wood.EnableKeyword("_NORMALMAP"); wood.EnableKeyword("_METALLICSPECGLOSSMAP");
                wood.SetFloat("_BumpScale", .7f); wood.SetFloat("_Smoothness", 1f);
                wood = Save(wood, Root + "Materials/" + Slugs[v] + ".mat");
                var steel = new Material(Shader.Find("Universal Render Pipeline/Lit")) { name = Slugs[v] + "_Nails", enableInstancing = true };
                steel.SetColor("_BaseColor", v == 0 ? new Color(.25f, .27f, .25f) : new Color(.16f, .12f, .08f));
                steel.SetFloat("_Metallic", .75f); steel.SetFloat("_Smoothness", v == 0 ? .4f : .18f);
                steel = Save(steel, Root + "Materials/" + Slugs[v] + "_Nails.mat");
                var pallet = Model(Names[v] + " pallet 40 x 48", "owner-pallets-lods.fbx", Slugs[v], new[] { wood, steel });
                AddPalletColliders(pallet);
                foreach (float x in new[] { -.25f, .25f })
                {
                    var entry = new GameObject(x < 0 ? "Left fork entry" : "Right fork entry");
                    entry.transform.SetParent(pallet.transform, false); entry.transform.localPosition = new Vector3(x, .062f, -.61f);
                }
                result[v] = PrefabUtility.SaveAsPrefabAsset(pallet, Root + "Prefabs/Pallet_" + Slugs[v] + ".prefab");
                UnityEngine.Object.DestroyImmediate(pallet);
            }
            return result;
        }

        static void AddPalletColliders(GameObject pallet)
        {
            // 5/8 inch deckboards around 3.5 inch stringers, with 1.5 inch side notches.
            foreach (float x in new[] { -.4905375f, 0, .4905375f })
            {
                BoxCollider(pallet, "Stringer upper", new Vector3(x, .079375f, 0), new Vector3(.034925f, .0508f, 1.2192f));
                foreach (var span in new[] { new Vector2(-.6096f, -.4445f), new Vector2(-.2159f, .2159f), new Vector2(.4445f, .6096f) })
                    BoxCollider(pallet, "Stringer foot", new Vector3(x, .034925f, (span.x + span.y) / 2), new Vector3(.034925f, .0381f, span.y - span.x));
                // Conservative shoulders cover the rounded notch corners.
                foreach (float z in new[] { -.435f, -.2254f, .2254f, .435f })
                    BoxCollider(pallet, "Notch shoulder", new Vector3(x, .04445f, z), new Vector3(.034925f, .01905f, .01905f));
            }
            float[] bottomZ = { -.53975f, -.1143f, 0, .1143f, .53975f };
            for (int i = 0; i < 5; i++) BoxCollider(pallet, "Bottom board", new Vector3(0, .0079375f, bottomZ[i]), new Vector3(1.016f, .015875f, i == 0 || i == 4 ? .1397f : .0889f));
            float cursor = -.6096f, gap = (1.2192f - 2 * .1397f - 5 * .0889f) / 6;
            for (int i = 0; i < 7; i++)
            {
                float width = i == 0 || i == 6 ? .1397f : .0889f;
                BoxCollider(pallet, "Top board", new Vector3(0, .1127125f, cursor + width / 2), new Vector3(1.016f, .015875f, width));
                cursor += width + gap;
            }
        }

        static GameObject CreateCargo()
        {
            var material = new Material(Shader.Find("OneShift/Rack Steel")) { name = "PalletLoad", enableInstancing = true };
            material.SetTexture("_WearNoise", AssetDatabase.LoadAssetAtPath<Texture2D>(Root + "Textures/rack-wear-noise.png"));
            material.SetTexture("_RackLabel", AssetDatabase.LoadAssetAtPath<Texture2D>(Root + "Textures/pallet-load-label.png"));
            material.SetFloat("_SurfaceKind", 1);
            material = Save(material, Root + "Materials/PalletLoad.mat");
            var cargo = Model("Strapped carton load", "carton-load-lods.fbx", "Cargo", new[] { material });
            BoxCollider(cargo, "Cartons", new Vector3(0, (.12065f + 1.52665f) / 2, 0), new Vector3(.972f, 1.406f, 1.172f));
            var prefab = PrefabUtility.SaveAsPrefabAsset(cargo, Root + "Prefabs/CartonLoad.prefab");
            UnityEngine.Object.DestroyImmediate(cargo);
            return prefab;
        }

        static GameObject Model(string name, string filename, string prefix, Material[] materials, bool rack = false)
        {
            var result = new GameObject(name);
            var asset = AssetDatabase.LoadAssetAtPath<GameObject>(Root + "Models/" + filename);
            var model = (GameObject)PrefabUtility.InstantiatePrefab(asset);
            // Unpack before removing other modules from the shared FBX.
            PrefabUtility.UnpackPrefabInstance(model, PrefabUnpackMode.Completely, InteractionMode.AutomatedAction);
            model.transform.SetParent(result.transform, false); model.transform.localRotation = Quaternion.Euler(0, 180, 0);
            foreach (var imported in model.GetComponentsInChildren<LODGroup>(true)) UnityEngine.Object.DestroyImmediate(imported);
            foreach (var renderer in model.GetComponentsInChildren<MeshRenderer>(true))
                if (!renderer.name.StartsWith(prefix + "_LOD")) UnityEngine.Object.DestroyImmediate(renderer.gameObject);
            var lods = new LOD[3];
            for (int i = 0; i < 3; i++)
            {
                var renderer = model.GetComponentsInChildren<MeshRenderer>(true).Single(r => r.name == prefix + "_LOD" + i);
                int count = renderer.GetComponent<MeshFilter>().sharedMesh.subMeshCount;
                renderer.sharedMaterials = materials.Take(count).ToArray();
                renderer.shadowCastingMode = rack ? ShadowCastingMode.TwoSided : ShadowCastingMode.On;
                renderer.gameObject.SetActive(true);
                if (rack) renderer.name = "Rack_LOD" + i;
                lods[i] = new LOD((rack ? new[] { .24f, .10f, .012f } : new[] { .11f, .045f, .008f })[i], new Renderer[] { renderer });
            }
            var group = result.AddComponent<LODGroup>(); group.SetLODs(lods); group.RecalculateBounds();
            return result;
        }

        static void BoxCollider(GameObject parent, string name, Vector3 centre, Vector3 size)
        {
            var child = new GameObject(name); child.transform.SetParent(parent.transform, false);
            var collider = child.AddComponent<BoxCollider>(); collider.center = centre; collider.size = size;
        }
        static Material Save(Material material, string path)
        {
            var old = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (old != null) { EditorUtility.CopySerialized(material, old); UnityEngine.Object.DestroyImmediate(material); return old; }
            AssetDatabase.CreateAsset(material, path); return material;
        }
        static void Label(string text, Vector3 position, float size, Quaternion rotation, Transform parent)
        {
            var obj = new GameObject(text); obj.transform.SetPositionAndRotation(position, rotation); obj.transform.SetParent(parent, true);
            var label = obj.AddComponent<TextMesh>(); label.text = text; label.fontSize = 80; label.characterSize = size / 8;
            label.anchor = TextAnchor.MiddleCenter; label.alignment = TextAlignment.Center; label.color = new Color(.94f, .91f, .81f);
            label.font = font; obj.GetComponent<MeshRenderer>().sharedMaterial = font.material;
        }
    }
}
