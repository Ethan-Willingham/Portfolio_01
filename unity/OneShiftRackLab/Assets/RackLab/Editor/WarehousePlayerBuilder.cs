using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    // Original, deliberately blunt character shapes. No downloaded model,
    // textures, animation controller, physics bones or extra shadow lights.
    public static class WarehousePlayerBuilder
    {
        const string Root = "Assets/RackLab/";
        const string Assets = Root + "Models/Worker/";
        const string VisualName = "Warehouse worker";

        [MenuItem("One Shift/Install warehouse worker")]
        public static string Install()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play before installing the worker.");
            var scene = SceneManager.GetActiveScene();
            if (scene.path != Root + "Scenes/RackFloor.unity") throw new InvalidOperationException("Open RackFloor.unity first.");
            var walking = Object.FindFirstObjectByType<RackWalkController>();
            if (walking == null) throw new InvalidOperationException("Walking player missing.");
            Directory.CreateDirectory("Temp/WorkerBackup");
            EditorSceneManager.SaveScene(scene, "Temp/WorkerBackup/RackFloor-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".unity", true);
            Directory.CreateDirectory(Assets);
            AssetDatabase.Refresh();
            var old = walking.GetComponentsInChildren<WarehousePlayerVisual>(true);
            foreach (var previous in old) Undo.DestroyObjectImmediate(previous.gameObject);
            var root = new GameObject(VisualName);
            Undo.RegisterCreatedObjectUndo(root, "Install warehouse worker");
            var visual = root.AddComponent<WarehousePlayerVisual>();
            visual.walking = walking;
            visual.driver = walking.GetComponent<ForkliftPlayerInteraction>();
            if (visual.driver != null && visual.driver.vehicle != null)
            {
                var truck = visual.driver.vehicle.transform;
                visual.seat = Find(truck, "OperatorSeat");
                visual.operatorEye = Find(truck, "OperatorEye");
                if (visual.seat != null && visual.operatorEye != null)
                {
                    Undo.RecordObject(visual.operatorEye, "Align cab eye with worker");
                    visual.operatorEye.position = visual.seat.position + truck.up * WarehousePlayerVisual.SeatedEyeAboveSeat + truck.forward * .035f;
                    PrefabUtility.RecordPrefabInstancePropertyModifications(visual.operatorEye);
                }
            }

            BuildGeometry(visual);
            root.transform.SetParent(walking.transform, false);
            EditorUtility.SetDirty(visual);
            AssetDatabase.SaveAssets();
            string report = Validate();
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
            Debug.Log(report);
            return report;
        }

        // Repair only generated mesh data without replacing a running player,
        // its pose, the saved scene, the delivery or the current camera.
        public static string RefreshMeshes()
        {
            var current = Object.FindFirstObjectByType<WarehousePlayerVisual>();
            if (current == null) throw new InvalidOperationException("Worker missing.");
            var temporary = new GameObject("Worker mesh generation");
            temporary.SetActive(false);
            try { BuildGeometry(temporary.AddComponent<WarehousePlayerVisual>()); }
            finally { Object.DestroyImmediate(temporary); }
            foreach (var renderer in current.GetComponentsInChildren<SkinnedMeshRenderer>())
            {
                var mesh = renderer.sharedMesh;
                renderer.sharedMesh = null;
                renderer.sharedMesh = mesh;
            }
            AssetDatabase.SaveAssets();
            return Validate();
        }

        static void BuildGeometry(WarehousePlayerVisual visual)
        {
            var root = visual.gameObject;
            var bones = new List<Transform>();
            visual.pelvis = Bone("Hips", root.transform, new Vector3(0, .92f, -.055f), bones);
            visual.spine = Bone("Shirt", visual.pelvis, new Vector3(0, 1.10f, -.055f), bones);
            visual.head = Bone("Head", visual.spine, new Vector3(0, 1.48f, -.055f), bones);
            visual.leftArm = Bone("Left shoulder", visual.spine, new Vector3(-.255f, 1.38f, -.055f), bones);
            visual.leftForearm = Bone("Left elbow", visual.leftArm, new Vector3(-.285f, 1.075f, -.055f), bones);
            visual.rightArm = Bone("Right shoulder", visual.spine, new Vector3(.255f, 1.38f, -.055f), bones);
            visual.rightForearm = Bone("Right elbow", visual.rightArm, new Vector3(.285f, 1.075f, -.055f), bones);
            visual.leftThigh = Bone("Left hip", visual.pelvis, new Vector3(-.112f, .90f, -.055f), bones);
            visual.leftShin = Bone("Left knee", visual.leftThigh, new Vector3(-.12f, .46f, -.055f), bones);
            visual.leftFoot = Bone("Left boot", visual.leftShin, new Vector3(-.12f, .12f, -.055f), bones);
            visual.rightThigh = Bone("Right hip", visual.pelvis, new Vector3(.112f, .90f, -.055f), bones);
            visual.rightShin = Bone("Right knee", visual.rightThigh, new Vector3(.12f, .46f, -.055f), bones);
            visual.rightFoot = Bone("Right boot", visual.rightShin, new Vector3(.12f, .12f, -.055f), bones);
            var body = new Parts();
            var face = new Parts();
            // Palette: shirt, dark cloth, trousers, worn knees, boots, soles,
            // skin, skin shade, hair, cream, rust cap, cap shade, label, tape.
            face.Profile(0, 2, -.055f, new[] { new Ring(.84f,.175f,.115f), new Ring(.94f,.205f,.125f), new Ring(1.02f,.20f,.12f) }, 8);
            // The eye sits inside the upper-body envelope when looking down.
            // Keep torso and face together so first-person views hide both,
            // while lower body, arms and the full shadow remain visible.
            face.Profile(1, 0, -.055f, new[] { new Ring(.96f,.205f,.13f), new Ring(1.12f,.235f,.155f), new Ring(1.34f,.245f,.12f), new Ring(1.43f,.17f,.09f) }, 8);
            // Open work shirt, dark undershirt, crooked pocket and plain badge.
            face.Box(1, 1, new Vector3(0,1.29f,.072f), new Vector3(.078f,.25f,.014f));
            face.Box(1, 0, new Vector3(-.126f,1.29f,.086f), new Vector3(.094f,.105f,.014f), -5);
            face.Box(1, 12, new Vector3(.125f,1.335f,.075f), new Vector3(.078f,.031f,.015f), 3);
            face.Box(0, 4, new Vector3(0,.967f,-.055f), new Vector3(.405f,.035f,.255f));
            face.Box(0, 9, new Vector3(0,.967f,.081f), new Vector3(.04f,.03f,.012f));

            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1 : 1;
                int arm = side == 0 ? 3 : 5;
                int forearm = arm + 1;
                int thigh = side == 0 ? 7 : 10;
                int shin = thigh + 1, foot = thigh + 2;
                body.Limb(arm, 0, new Vector3(sign*.255f,1.37f,-.055f), new Vector3(sign*.285f,1.145f,-.055f), .092f,.074f,.090f,.073f, 6);
                body.Limb(arm, 6, new Vector3(sign*.285f,1.155f,-.055f), new Vector3(sign*.285f,1.065f,-.055f), .069f,.062f,.069f,.061f, 6);
                body.Limb(forearm, 6, new Vector3(sign*.285f,1.085f,-.055f), new Vector3(sign*.300f,.87f,-.055f), .064f,.045f,.061f,.042f, 6);
                body.Box(forearm, 6, new Vector3(sign*.30f,.839f,-.039f), new Vector3(.086f,.10f,.074f), sign*4);
                body.Box(forearm, 7, new Vector3(sign*.263f,.852f,-.005f), new Vector3(.03f,.062f,.041f), sign*-12);
                body.Limb(thigh, 2, new Vector3(sign*.112f,.925f,-.055f), new Vector3(sign*.12f,.455f,-.055f), .102f,.081f,.12f,.09f, 8);
                body.Box(thigh, 3, new Vector3(sign*.12f,.515f,.033f), new Vector3(.115f,.098f,.012f), sign*3);
                body.Limb(shin, 2, new Vector3(sign*.12f,.47f,-.055f), new Vector3(sign*.12f,.14f,-.055f), .080f,.065f,.088f,.065f, 8);
                body.Box(shin, 3, new Vector3(sign*.12f,.167f,-.055f), new Vector3(.141f,.047f,.145f));
                body.Box(foot, 4, new Vector3(sign*.12f,.083f,.014f), new Vector3(.174f,.14f,.30f));
                body.Box(foot, 5, new Vector3(sign*.12f,.019f,.021f), new Vector3(.182f,.035f,.313f));
                body.Box(foot, 7, new Vector3(sign*.12f,.145f,-.016f), new Vector3(.06f,.012f,.082f));
                for (int lace = 0; lace < 3; lace++)
                    body.Box(foot, 5, new Vector3(sign*.12f,.153f,-.047f+lace*.025f), new Vector3(.075f,.008f,.008f));
            }
            face.Profile(2, 6, -.055f, new[] {new Ring(1.405f,.07f,.064f),new Ring(1.51f,.075f,.07f)}, 6);
            face.Profile(2, 6, -.035f, new[] {new Ring(1.50f,.093f,.085f),new Ring(1.55f,.14f,.12f),new Ring(1.665f,.147f,.124f),new Ring(1.725f,.12f,.102f)}, 8);
            face.Box(2, 7, new Vector3(0,1.545f,.077f), new Vector3(.16f,.053f,.02f));
            face.Box(2, 6, new Vector3(0,1.612f,.106f), new Vector3(.047f,.071f,.067f), -3);
            face.Box(2, 8, new Vector3(.006f,1.555f,.094f), new Vector3(.074f,.008f,.009f), 2);
            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1 : 1;
                face.Box(2, 6, new Vector3(sign*.153f,1.628f,-.035f), new Vector3(.046f,.075f,.055f), sign*-8);
                face.Box(2, 9, new Vector3(sign*.061f,1.646f,.084f), new Vector3(.045f,.019f,.017f), sign*3);
                face.Box(2, 8, new Vector3(sign*.061f,1.643f,.094f), new Vector3(.013f,.014f,.008f));
                face.Box(2, 8, new Vector3(sign*.059f,1.671f,.085f), new Vector3(.061f,.017f,.016f), sign*-8);
                face.Box(2, 8, new Vector3(sign*.125f,1.673f,-.042f), new Vector3(.036f,.05f,.105f));
            }
            face.Profile(2, 10, -.045f, new[] {new Ring(1.70f,.153f,.126f),new Ring(1.756f,.135f,.109f),new Ring(1.78f,.06f,.05f)}, 8);
            face.Box(2, 11, new Vector3(0,1.708f,.106f), new Vector3(.295f,.022f,.14f), -3);
            face.Box(2, 12, new Vector3(-.02f,1.744f,.069f), new Vector3(.067f,.023f,.017f), -3);
            var material = Palette();
            visual.bodyRenderer = Renderer(root.transform, "Work clothes and limbs", body, bones, material, "WorkerBody.asset");
            visual.headRenderer = Renderer(root.transform, "Shirt face and cap", face, bones, material, "WorkerHead.asset");
        }

        public static string Validate()
        {
            var visual = Object.FindFirstObjectByType<WarehousePlayerVisual>();
            if (visual == null || visual.walking == null || visual.bodyRenderer == null || visual.headRenderer == null)
                throw new Exception("Warehouse worker installation is incomplete.");
            var renderers = visual.GetComponentsInChildren<SkinnedMeshRenderer>();
            int triangles = renderers.Sum(r => r.sharedMesh.triangles.Length / 3);
            if (renderers.Length != 2 || triangles < 500 || triangles > 1800) throw new Exception("Worker must retain its geometry within the two-renderer, 1800-triangle budget.");
            if (renderers.Any(r => r.sharedMesh.vertexCount < 100 || r.sharedMesh.boneWeights.Length != r.sharedMesh.vertexCount))
                throw new Exception("Worker vertex or skin-weight buffers are missing.");
            if (renderers.Any(r => r.sharedMaterials.Length != 1 || r.sharedMaterial != renderers[0].sharedMaterial || !r.receiveShadows || r.shadowCastingMode == ShadowCastingMode.Off))
                throw new Exception("Worker must share one material and retain real shadows.");
            if (visual.GetComponentsInChildren<Collider>().Length != 0 || visual.GetComponentsInChildren<Light>().Length != 0 || visual.GetComponentInChildren<Animator>() != null)
                throw new Exception("Worker added physics, lights or an animation controller.");
            if (visual.seat == null || visual.operatorEye == null) throw new Exception("Worker seat or cab eye anchor missing.");
            if (renderers.Any(r => r.bones.Length != 13 || r.sharedMesh.boneWeights.Any(b => b.weight0 != 1 || b.weight1 != 0)))
                throw new Exception("Worker requires thirteen rigid bones and one influence per vertex.");
            string report = "Warehouse worker passed: " + triangles + " triangles; two skinned renderers; one 16 x 1 palette material; thirteen rigid bones; no added lights, colliders or Animator. Walking follows measured motion. Cab and walking views hide the upper torso and head while preserving their full shadows; chase view shows the full worker.";
            Directory.CreateDirectory(Root + "Reports");
            File.WriteAllText(Root + "Reports/warehouse-worker-validation.txt", report + "\n");
            return report;
        }

        static Transform Find(Transform root, string name) => root.GetComponentsInChildren<Transform>(true).FirstOrDefault(t => t.name == name);

        static Transform Bone(string name, Transform parent, Vector3 position, List<Transform> bones)
        {
            var bone = new GameObject(name).transform;
            bone.SetParent(parent, false);
            bone.position = position;
            bones.Add(bone);
            return bone;
        }

        static SkinnedMeshRenderer Renderer(Transform root, string name, Parts parts, List<Transform> bones, Material material, string file)
        {
            var node = new GameObject(name);
            node.transform.SetParent(root, false);
            string path = Assets + file;
            var saved = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (saved == null)
            {
                saved = new Mesh { name = name };
                AssetDatabase.CreateAsset(saved, path);
            }
            // Unity native vertex buffers must be filled directly. CopySerialized
            // after Clear can preserve bounds/bindposes but lose all vertices.
            saved.Clear();
            saved.SetVertices(parts.vertices);
            saved.SetNormals(parts.normals);
            saved.SetUVs(0, parts.uv);
            saved.SetTriangles(parts.triangles, 0);
            saved.boneWeights = parts.weights.ToArray();
            saved.bindposes = bones.Select(b => b.worldToLocalMatrix * root.localToWorldMatrix).ToArray();
            saved.RecalculateBounds();
            saved.UploadMeshData(false);
            EditorUtility.SetDirty(saved);
            var renderer = node.AddComponent<SkinnedMeshRenderer>();
            renderer.sharedMesh = saved;
            renderer.sharedMaterial = material;
            renderer.bones = bones.ToArray();
            // Bounds are in the visual root's metre space, not the moving hip.
            renderer.rootBone = root;
            renderer.quality = SkinQuality.Bone1;
            renderer.shadowCastingMode = ShadowCastingMode.On;
            renderer.receiveShadows = true;
            renderer.updateWhenOffscreen = true;
            renderer.localBounds = new Bounds(new Vector3(0,.87f,0),new Vector3(1.35f,2.1f,1.5f));
            renderer.lightProbeUsage = LightProbeUsage.BlendProbes;
            renderer.reflectionProbeUsage = ReflectionProbeUsage.Simple;
            return renderer;
        }

        static Material Palette()
        {
            string texturePath = Assets + "WorkerPalette.asset";
            var texture = AssetDatabase.LoadAssetAtPath<Texture2D>(texturePath);
            if (texture == null)
            {
                texture = new Texture2D(16, 1, TextureFormat.RGBA32, false, false) { name = "Worker palette", filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp };
                AssetDatabase.CreateAsset(texture, texturePath);
            }
            texture.SetPixels(new[] {
                new Color(.33f,.39f,.35f), new Color(.16f,.19f,.18f), new Color(.23f,.26f,.28f), new Color(.31f,.33f,.34f),
                new Color(.24f,.19f,.15f), new Color(.105f,.115f,.10f), new Color(.67f,.46f,.32f), new Color(.43f,.31f,.23f),
                new Color(.15f,.12f,.095f), new Color(.77f,.74f,.61f), new Color(.49f,.26f,.19f), new Color(.32f,.18f,.14f),
                new Color(.62f,.58f,.43f), new Color(.53f,.51f,.34f), new Color(.40f,.45f,.37f), new Color(.17f,.20f,.19f)
            });
            texture.Apply(false, false);
            EditorUtility.SetDirty(texture);
            string materialPath = Assets + "WorkerClothes.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
            if (material == null)
            {
                material = new Material(Shader.Find("Universal Render Pipeline/Lit")) { name = "Worker cloth and skin" };
                AssetDatabase.CreateAsset(material, materialPath);
            }
            material.SetColor("_BaseColor", Color.white);
            material.SetTexture("_BaseMap", texture);
            material.SetFloat("_Smoothness", .13f);
            material.SetFloat("_Metallic", 0);
            material.enableInstancing = true;
            EditorUtility.SetDirty(material);
            return material;
        }

        readonly struct Ring
        {
            public readonly float y, x, z;
            public Ring(float height, float halfWidth, float halfDepth) { y=height; x=halfWidth; z=halfDepth; }
        }

        sealed class Parts
        {
            public readonly List<Vector3> vertices = new List<Vector3>();
            public readonly List<Vector3> normals = new List<Vector3>();
            public readonly List<Vector2> uv = new List<Vector2>();
            public readonly List<int> triangles = new List<int>();
            public readonly List<BoneWeight> weights = new List<BoneWeight>();

            void Triangle(int bone, int color, Vector3 a, Vector3 b, Vector3 c)
            {
                int start = vertices.Count;
                Vector3 normal = Vector3.Cross(b-a,c-a).normalized;
                foreach (var vertex in new[] {a,b,c})
                {
                    vertices.Add(vertex); normals.Add(normal); uv.Add(new Vector2((color+.5f)/16f,.5f));
                    weights.Add(new BoneWeight { boneIndex0=bone, weight0=1 });
                    triangles.Add(start++);
                }
            }

            void Quad(int bone, int color, Vector3 a, Vector3 b, Vector3 c, Vector3 d)
            { Triangle(bone,color,a,b,c); Triangle(bone,color,a,c,d); }

            public void Box(int bone, int color, Vector3 center, Vector3 size, float roll = 0)
            {
                Vector3 half = size*.5f;
                var r = Quaternion.Euler(0,0,roll);
                Vector3[] p = new Vector3[8];
                for (int i=0;i<8;i++) p[i]=center+r*new Vector3((i&1)==0?-half.x:half.x,(i&2)==0?-half.y:half.y,(i&4)==0?-half.z:half.z);
                Quad(bone,color,p[0],p[2],p[3],p[1]); Quad(bone,color,p[4],p[5],p[7],p[6]);
                Quad(bone,color,p[0],p[4],p[6],p[2]); Quad(bone,color,p[1],p[3],p[7],p[5]);
                Quad(bone,color,p[2],p[6],p[7],p[3]); Quad(bone,color,p[0],p[1],p[5],p[4]);
            }

            public void Profile(int bone, int color, float centerZ, Ring[] rings, int sides)
            {
                var points = new Vector3[rings.Length,sides];
                for (int ring=0;ring<rings.Length;ring++)
                    for (int i=0;i<sides;i++)
                    {
                        float angle=(i+.5f)*Mathf.PI*2/sides;
                        points[ring,i]=new Vector3(Mathf.Sin(angle)*rings[ring].x,rings[ring].y,centerZ+Mathf.Cos(angle)*rings[ring].z);
                    }
                for (int ring=0;ring<rings.Length-1;ring++)
                    for (int i=0;i<sides;i++) { int n=(i+1)%sides; Quad(bone,color,points[ring,i],points[ring,n],points[ring+1,n],points[ring+1,i]); }
                for (int i=0;i<sides;i++)
                {
                    int n=(i+1)%sides, last=rings.Length-1;
                    Triangle(bone,color,new Vector3(0,rings[0].y,centerZ),points[0,n],points[0,i]);
                    Triangle(bone,color,new Vector3(0,rings[last].y,centerZ),points[last,i],points[last,n]);
                }
            }

            public void Limb(int bone, int color, Vector3 top, Vector3 bottom, float topX, float bottomX, float topZ, float bottomZ, int sides)
            {
                var high=new Vector3[sides]; var low=new Vector3[sides];
                for(int i=0;i<sides;i++)
                {
                    float a=(i+.5f)*Mathf.PI*2/sides;
                    high[i]=top+new Vector3(Mathf.Sin(a)*topX,0,Mathf.Cos(a)*topZ);
                    low[i]=bottom+new Vector3(Mathf.Sin(a)*bottomX,0,Mathf.Cos(a)*bottomZ);
                }
                for(int i=0;i<sides;i++)
                {
                    int n=(i+1)%sides;
                    Quad(bone,color,low[i],low[n],high[n],high[i]);
                    Triangle(bone,color,bottom,low[n],low[i]); Triangle(bone,color,top,high[i],high[n]);
                }
            }
        }
    }
}
