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
    // The FBX remains an editable mechanical source. This makes the derived driving prefab.
    public static class ForkliftBuilder
    {
        const string Root = "Assets/RackLab/";
        const string ModelPath = Root + "Models/warehouse-forklift.fbx";
        const string MeshRoot = Root + "Models/ForkliftRuntime/";
        const string MaterialRoot = Root + "Materials/Forklift/";
        const string InstallationName = "Forklift driving trial";
        public const string PrefabPath = Root + "Prefabs/WarehouseForklift.prefab";
        public static readonly Vector3 ParkingPosition = new Vector3(0, .025f, -5.6f);
        static PhysicsMaterial bodyContact, rampContact;

        [MenuItem("One Shift/Install forklift driving")]
        public static string InstallDriver()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play before installing the forklift.");
            var scene = SceneManager.GetActiveScene();
            if (scene.path != Root + "Scenes/RackFloor.unity") throw new InvalidOperationException("Open RackFloor.unity first.");
            var walking = Object.FindFirstObjectByType<RackWalkController>();
            if (walking == null) throw new InvalidOperationException("The warehouse walking player is missing.");
            Directory.CreateDirectory("Temp/ForkliftBackup");
            EditorSceneManager.SaveScene(scene, "Temp/ForkliftBackup/RackFloor-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".unity", true);
            var prefab = BuildPrefab();
            var previous = scene.GetRootGameObjects().Where(o => o.name == InstallationName).ToArray();
            var installation = new GameObject(InstallationName);
            Undo.RegisterCreatedObjectUndo(installation, "Install forklift driving");
            var vehicle = (GameObject)PrefabUtility.InstantiatePrefab(prefab, scene);
            vehicle.transform.SetParent(installation.transform, false);
            vehicle.transform.position = ParkingPosition;
            BuildPracticeArea(installation.transform);
            var interaction = walking.GetComponent<ForkliftPlayerInteraction>();
            if (interaction == null) interaction = Undo.AddComponent<ForkliftPlayerInteraction>(walking.gameObject);
            interaction.walking = walking;
            interaction.vehicle = vehicle.GetComponent<ForkliftDriveController>();
            interaction.exitAnchor = Find(vehicle.transform, "DriverExit");
            EditorUtility.SetDirty(interaction);
            foreach (var old in previous) Undo.DestroyObjectImmediate(old);
            // Present the parked machine from the player's current entrance position.
            var towards = ParkingPosition - walking.transform.position;
            towards.y = 0;
            if (towards.sqrMagnitude > .01f)
            {
                Undo.RecordObject(walking.transform, "Face the forklift parking bay");
                walking.transform.rotation = Quaternion.LookRotation(towards);
            }
            Physics.SyncTransforms();
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
            AssetDatabase.SaveAssets();
            string result = "Installed yellow forklift, rear steering, oscillating rear axle, compound body/mast/fork collision and single-wheel tipping ramp. Existing warehouse content retained.";
            Debug.Log(result);
            return result;
        }

        public static GameObject CreateForValidation()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
            if (prefab == null) throw new InvalidOperationException("Run ForkliftBuilder.InstallDriver() before driving validation.");
            var instance = Object.Instantiate(prefab);
            instance.name = "Forklift validation vehicle";
            instance.GetComponent<ForkliftDriveController>().Initialize();
            return instance;
        }

        public static GameObject BuildPrefab()
        {
            foreach (var folder in new[] { MeshRoot, MaterialRoot, Root + "Prefabs", Root + "Reports" }) Directory.CreateDirectory(folder);
            AssetDatabase.Refresh();
            var importer = AssetImporter.GetAtPath(ModelPath) as ModelImporter;
            if (importer == null) throw new InvalidOperationException("Generate the yellow forklift FBX first.");
            importer.isReadable = true; // Editor combines geometry while preserving authoring transforms.
            importer.importAnimation = importer.importCameras = importer.importLights = false;
            importer.addCollider = false;
            importer.globalScale = 1;
            importer.SaveAndReimport();
            bodyContact = Contact("Painted steel contact", .45f, .35f);
            rampContact = Contact("Concrete and ramp contact", .7f, .6f);
            var source = AssetDatabase.LoadAssetAtPath<GameObject>(ModelPath);
            var vehicle = new GameObject("Warehouse forklift 04");
            try
            {
                // Exported axes were measured against the wheel centres and ForkTips anchor.
                // FBX +Y is up, but its forks point -Z; a single 180 degree turn gives +Z drive.
                // Keep the importer's own X rotation and centimetre scale inside this wrapper.
                var orientation = Child("Forward axis correction", vehicle.transform);
                orientation.transform.localRotation = Quaternion.Euler(0, 180, 0);
                var visual = Object.Instantiate(source, orientation.transform);
                visual.name = "Yellow forklift mechanical source";
                var forkTips = Find(visual.transform, "ForkTips");
                Require(forkTips.position.z > 2.4f && Mathf.Abs(forkTips.position.x) < .001f, "Forklift forward-axis conversion failed.");
                var frontLeft = Find(visual.transform, "FrontWheel_L_Pivot");
                Require(Vector3.Distance(frontLeft.position, new Vector3(-.52f, .355f, .75f)) < .003f, "Imported forklift scale or wheelbase changed.");
                ReplaceMaterials(visual);
                BatchRenderers(visual.transform);

                var body = vehicle.AddComponent<Rigidbody>();
                ConfigureBody(body, 3500);
                var drive = vehicle.AddComponent<ForkliftDriveController>();
                drive.body = body;
                drive.wheelVisuals = new[] { frontLeft, Find(visual.transform, "FrontWheel_R_Pivot"), Find(visual.transform, "RearWheel_L_Pivot"), Find(visual.transform, "RearWheel_R_Pivot") };
                drive.rearSteerVisuals = new[] { Find(visual.transform, "RearSteer_L_Pivot"), Find(visual.transform, "RearSteer_R_Pivot") };
                drive.rearAxleVisual = Find(visual.transform, "RearAxle_Oscillation");
                drive.steeringWheelVisual = Find(visual.transform, "SteeringWheel_Pivot");
                drive.steeringWheelLocalAxis = Vector3.forward;
                AddBodyColliders(vehicle.transform, visual.transform);
                var axle = Child("Rear axle physics", vehicle.transform, new Vector3(0, .275f, -.96f));
                var axleBody = axle.AddComponent<Rigidbody>();
                ConfigureBody(axleBody, 120);
                axleBody.centerOfMass = Vector3.zero;
                drive.rearAxleBody = axleBody;
                Box(axle.transform, "Rear axle housing collision", Vector3.zero, new Vector3(.70f, .105f, .105f));
                var hinge = axle.AddComponent<HingeJoint>();
                hinge.connectedBody = body;
                hinge.autoConfigureConnectedAnchor = false;
                hinge.anchor = Vector3.zero;
                hinge.connectedAnchor = axle.transform.localPosition;
                hinge.axis = Vector3.forward;
                hinge.useLimits = true;
                hinge.limits = new JointLimits { min = -3, max = 3, bounciness = 0, contactDistance = .3f };
                hinge.enableCollision = false;
                hinge.enablePreprocessing = true;
                drive.wheels = new[]
                {
                    Wheel(vehicle.transform, "Front left contact", new Vector3(-.52f, .355f, .75f), .35f, 80, 800000, 40000),
                    Wheel(vehicle.transform, "Front right contact", new Vector3(.52f, .355f, .75f), .35f, 80, 800000, 40000),
                    Wheel(axle.transform, "Rear left contact", new Vector3(-.49f, 0, 0), .27f, 45, 600000, 6000),
                    Wheel(axle.transform, "Rear right contact", new Vector3(.49f, 0, 0), .27f, 45, 600000, 6000)
                };
                // Natural gravity and contact forces can roll or pitch this body all the way over.
                // The COM includes the rear counterweight; there is no anti-roll force or frozen axis.
                body.centerOfMass = new Vector3(0, .72f, -.18f);
                body.ResetInertiaTensor();
                axleBody.ResetInertiaTensor();
                // Automatic inertia sees only the narrow collision housing. Include the
                // two 45 kg wheels at +/- .49 m and the remaining 30 kg axle structure.
                axleBody.inertiaTensorRotation = Quaternion.identity;
                axleBody.inertiaTensor = new Vector3(3.35f, 24.5f, 24.5f);
                Child("DriverExit", vehicle.transform, new Vector3(-1.15f, .035f, -.2f));
                Child("ChaseCameraTarget", vehicle.transform, new Vector3(0, 1.05f, -.2f));
                drive.Initialize();
                var prefab = PrefabUtility.SaveAsPrefabAsset(vehicle, PrefabPath);
                AssetDatabase.SaveAssets();
                return prefab;
            }
            finally { Object.DestroyImmediate(vehicle); }
        }

        static void ConfigureBody(Rigidbody body, float mass)
        {
            body.mass = mass;
            body.constraints = RigidbodyConstraints.None;
            body.useGravity = true;
            body.interpolation = RigidbodyInterpolation.Interpolate;
            body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            body.linearDamping = .015f;
            body.angularDamping = .04f;
            body.maxAngularVelocity = 10;
            body.maxDepenetrationVelocity = 3;
        }

        static WheelCollider Wheel(Transform parent, string name, Vector3 position, float radius, float mass, float spring, float damper)
        {
            // Half-travel raises the ray origin, so its nominal contact matches the source tyre.
            var node = Child(name, parent, position + Vector3.up * .0275f);
            var wheel = node.AddComponent<WheelCollider>();
            wheel.radius = radius;
            wheel.mass = mass;
            wheel.wheelDampingRate = .65f;
            wheel.suspensionDistance = .055f;
            wheel.forceAppPointDistance = .02f;
            wheel.suspensionSpring = new JointSpring { spring = spring, damper = damper, targetPosition = .5f };
            // Runtime sets the jointed truck's supported tire masses after native
            // creation; these values are not serialized by WheelCollider.
            bool front = mass > 50;
            wheel.forwardFriction = new WheelFrictionCurve { extremumSlip = front ? .18f : .35f, extremumValue = 1, asymptoteSlip = front ? .45f : .8f, asymptoteValue = .65f, stiffness = 1.2f };
            wheel.sidewaysFriction = new WheelFrictionCurve { extremumSlip = .12f, extremumValue = 1, asymptoteSlip = .35f, asymptoteValue = .7f, stiffness = 1.1f };
            wheel.ConfigureVehicleSubsteps(4, 12, 12);
            return wheel;
        }

        // Update contact tuning without regenerating the mesh or practice area.
        public static string RefreshContactPhysics()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play before updating tire contact.");
            var root = PrefabUtility.LoadPrefabContents(PrefabPath);
            try
            {
                var drive = root.GetComponent<ForkliftDriveController>();
                ConfigureBody(drive.body, 3500);
                ConfigureBody(drive.rearAxleBody, 120);
                for (int i = 0; i < 4; i++)
                {
                    var wheel = drive.wheels[i];
                    wheel.forceAppPointDistance = .02f;
                    var spring = wheel.suspensionSpring;
                    spring.damper = i < 2 ? 40000 : 6000;
                    wheel.suspensionSpring = spring;
                    wheel.forwardFriction = new WheelFrictionCurve { extremumSlip = i < 2 ? .18f : .35f,
                        extremumValue = 1, asymptoteSlip = i < 2 ? .45f : .8f, asymptoteValue = .65f, stiffness = 1.2f };
                }
                PrefabUtility.SaveAsPrefabAsset(root, PrefabPath);
                var timeSettings = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TimeManager.asset")[0]);
                // Unity 6 stores this setting as rational ticks, not a float.
                var timestep = timeSettings.FindProperty("Fixed Timestep");
                long numerator = timestep.FindPropertyRelative("m_Rate.m_Numerator").longValue;
                long denominator = timestep.FindPropertyRelative("m_Rate.m_Denominator").longValue;
                timestep.FindPropertyRelative("m_Count").longValue = (long)Math.Round(.005 * numerator / denominator);
                timeSettings.ApplyModifiedPropertiesWithoutUndo();
                AssetDatabase.SaveAssets();
                return "Updated supported tire contact, rear damping and 200 Hz jointed physics.";
            }
            finally { PrefabUtility.UnloadPrefabContents(root); }
        }

        static void AddBodyColliders(Transform body, Transform visual)
        {
            var group = Child("Chassis compound collision", body).transform;
            Box(group, "Front chassis belly", new Vector3(0, .32f, .25f), new Vector3(.88f, .25f, 1.50f));
            Box(group, "Rear chassis spine", new Vector3(0, .32f, -.995f), new Vector3(.40f, .25f, .95f));
            Box(group, "Front footwell and sills", new Vector3(0, .43f, .43f), new Vector3(1.04f, .15f, 1.12f));
            Box(group, "Engine housing", new Vector3(0, .77f, -.34f), new Vector3(1.02f, .43f, .95f));
            // Split boxes leave the rear tyre steering envelope open below the shoulders.
            Box(group, "Counterweight crown", new Vector3(0, .82f, -1.09f), new Vector3(1.13f, .38f, .76f));
            Box(group, "Counterweight rear heel", new Vector3(0, .43f, -1.40f), new Vector3(1.08f, .26f, .22f));
            Box(group, "Rear bumper", new Vector3(0, .33f, -1.48f), new Vector3(1.08f, .15f, .12f));
            Box(group, "Dashboard", new Vector3(0, .91f, .70f), new Vector3(.82f, .43f, .25f));
            Box(group, "LPG bottle", new Vector3(0, 1.24f, -1.11f), new Vector3(.82f, .34f, .34f));
            Box(group, "Seat back", new Vector3(0, 1.43f, -.47f), new Vector3(.53f, .43f, .14f));
            foreach (float x in new[] { -.49f, .49f })
            {
                Beam(group, "Guard rear post", new Vector3(x, .86f, -.65f), new Vector3(x, 2.12f, -.70f), .065f, .065f);
                Beam(group, "Guard front post", new Vector3(x, .72f, .80f), new Vector3(x, 2.12f, .65f), .065f, .065f);
                Box(group, "Guard roof side", new Vector3(x, 2.15f, -.025f), new Vector3(.07f, .09f, 1.48f));
            }
            foreach (float z in new[] { -.73f, .69f }) Box(group, "Guard cross rail", new Vector3(0, 2.15f, z), new Vector3(1.07f, .09f, .07f));
            for (int i = -2; i <= 2; i++) Box(group, "Guard roof slat", new Vector3(i * .18f, 2.14f, -.02f), new Vector3(.04f, .04f, 1.38f));

            var mast = AtAnchor("Outer mast compound collision", body, Find(visual, "MastTilt_Pivot"));
            foreach (float x in new[] { -.40f, .40f }) Box(mast, "Outer mast rail", new Vector3(x, .74f, .04f), new Vector3(.16f, 2.01f, .30f));
            foreach (float y in new[] { -.15f, 1.72f }) Box(mast, "Outer mast cross tie", new Vector3(0, y, -.075f), new Vector3(.92f, .10f, .075f));
            var inner = AtAnchor("Inner mast compound collision", body, Find(visual, "InnerMast_Lift"));
            foreach (float x in new[] { -.29f, .29f }) Box(inner, "Inner mast rail", new Vector3(x, .79f, .04f), new Vector3(.105f, 1.94f, .17f));
            Box(inner, "Inner mast header", new Vector3(0, 1.79f, .04f), new Vector3(.70f, .09f, .19f));
            var carriage = AtAnchor("Carriage compound collision", body, Find(visual, "ForkCarriage_Lift"));
            foreach (float y in new[] { .05f, .49f }) Box(carriage, "Carriage cross member", new Vector3(0, y, 0), new Vector3(1.05f, .10f, .10f));
            foreach (float x in new[] { -.46f, .46f }) Box(carriage, "Carriage end plate", new Vector3(x, .27f, 0), new Vector3(.08f, .52f, .10f));
            foreach (float y in new[] { .53f, 1.20f }) Box(carriage, "Load backrest rail", new Vector3(0, y, .015f), new Vector3(1.12f, .055f, .055f));
            for (int i = -3; i <= 3; i++) Box(carriage, "Load backrest slat", new Vector3(i * .1765f, .865f, .015f), new Vector3(.029f, .67f, .04f));
            foreach (string name in new[] { "Fork_Left", "Fork_Right" })
            {
                var fork = AtAnchor(name + " collision", body, Find(visual, name));
                Box(fork, "Forged fork upright", new Vector3(0, .185f, .044f), new Vector3(.10f, .79f, .052f));
                var blade = new Mesh { name = name + " tapered blade collision" };
                blade.vertices = new[]
                {
                    new Vector3(-.05f,-.263f,.07f), new Vector3(.05f,-.263f,.07f), new Vector3(.05f,-.232f,1.13f), new Vector3(-.05f,-.232f,1.13f),
                    new Vector3(-.05f,-.22f,.07f), new Vector3(.05f,-.22f,.07f), new Vector3(.05f,-.22f,1.13f), new Vector3(-.05f,-.22f,1.13f)
                };
                blade.triangles = BoxTriangles();
                blade.RecalculateNormals(); blade.RecalculateBounds();
                blade = Save(blade, MeshRoot + name + "_BladeCollision.asset");
                var collider = Child("Solid tapered fork blade", fork).AddComponent<MeshCollider>();
                collider.sharedMesh = blade; collider.convex = true; collider.sharedMaterial = bodyContact; collider.contactOffset = .001f;
            }
        }

        static Transform AtAnchor(string name, Transform body, Transform anchor)
        {
            // A unit-scale Y-up collider frame under each imported pivot avoids FBX centimetre scaling.
            var node = Child(name, body);
            node.transform.position = anchor.position;
            node.transform.SetParent(anchor, true);
            return node.transform;
        }

        static void ReplaceMaterials(GameObject visual)
        {
            var converted = new Dictionary<Material, Material>();
            foreach (var renderer in visual.GetComponentsInChildren<MeshRenderer>())
            {
                var materials = renderer.sharedMaterials;
                for (int i = 0; i < materials.Length; i++)
                {
                    var source = materials[i];
                    if (source == null) throw new InvalidOperationException("Forklift material missing on " + renderer.name);
                    if (!converted.TryGetValue(source, out var material))
                    {
                        var name = source.name;
                        float metallic = .4f, smoothness = .65f;
                        if (name.Contains("tyre")) { metallic = 0; smoothness = .14f; }
                        else if (name.Contains("vinyl")) { metallic = 0; smoothness = .47f; }
                        else if (name.Contains("industrial yellow")) { metallic = .22f; smoothness = .66f; }
                        else if (name.Contains("forged")) { metallic = .86f; smoothness = .62f; }
                        else if (name.Contains("polished")) { metallic = .95f; smoothness = .84f; }
                        else if (name.Contains("bottle")) { metallic = .8f; smoothness = .70f; }
                        else if (name.Contains("cream labels")) { metallic = 0; smoothness = .52f; }
                        else if (name.Contains("lens")) { metallic = .1f; smoothness = .8f; }
                        else if (name.Contains("worn")) { metallic = .5f; smoothness = .28f; }
                        material = new Material(Shader.Find("Universal Render Pipeline/Lit")) { name = name, enableInstancing = true };
                        material.SetColor("_BaseColor", source.color);
                        material.SetFloat("_Metallic", metallic); material.SetFloat("_Smoothness", smoothness);
                        material = Save(material, MaterialRoot + SafeName(name) + ".mat");
                        converted.Add(source, material);
                    }
                    materials[i] = material;
                }
                renderer.sharedMaterials = materials;
                renderer.shadowCastingMode = ShadowCastingMode.On;
                renderer.receiveShadows = true;
            }
        }

        static void BatchRenderers(Transform visual)
        {
            var groups = new Dictionary<(Transform, Material), List<CombineInstance>>();
            var sources = visual.GetComponentsInChildren<MeshFilter>();
            foreach (var filter in sources)
            {
                var renderer = filter.GetComponent<MeshRenderer>();
                if (renderer == null || filter.sharedMesh == null) continue;
                Transform assembly = filter.transform.parent;
                for (var node = filter.transform.parent; node != null && node != visual; node = node.parent)
                {
                    if (node.name.StartsWith("LeafChain_", StringComparison.Ordinal)) { assembly = node; break; }
                    if (node.name == "Chassis") { assembly = node; break; }
                    if (node.name.Contains("Pivot") || node.name.EndsWith("_Lift", StringComparison.Ordinal) || node.name.StartsWith("Fork_", StringComparison.Ordinal) || node.name.StartsWith("RearAxle_", StringComparison.Ordinal))
                    { assembly = node; break; }
                }
                var matrix = assembly.worldToLocalMatrix * filter.transform.localToWorldMatrix;
                var materials = renderer.sharedMaterials;
                for (int sub = 0; sub < filter.sharedMesh.subMeshCount; sub++)
                {
                    var key = (assembly, materials[Mathf.Min(sub, materials.Length - 1)]);
                    if (!groups.TryGetValue(key, out var batch)) groups.Add(key, batch = new List<CombineInstance>());
                    batch.Add(new CombineInstance { mesh = filter.sharedMesh, subMeshIndex = sub, transform = matrix });
                }
            }
            foreach (var group in groups)
            {
                var mesh = new Mesh { name = group.Key.Item1.name + " " + group.Key.Item2.name, indexFormat = IndexFormat.UInt32 };
                mesh.CombineMeshes(group.Value.ToArray(), true, true, false);
                mesh.RecalculateBounds();
                mesh = Save(mesh, MeshRoot + SafeName(mesh.name) + ".asset");
                var node = Child("Runtime batch " + group.Key.Item2.name, group.Key.Item1);
                node.AddComponent<MeshFilter>().sharedMesh = mesh;
                var renderer = node.AddComponent<MeshRenderer>();
                renderer.sharedMaterial = group.Key.Item2;
                renderer.shadowCastingMode = ShadowCastingMode.On; renderer.receiveShadows = true;
            }
            foreach (var filter in sources)
            {
                var renderer = filter.GetComponent<MeshRenderer>();
                if (renderer != null) Object.DestroyImmediate(renderer);
                Object.DestroyImmediate(filter);
            }
            // Leaf-link and other authoring anchors remain available, while 350 chain meshes become two draw groups.
        }

        static void BuildPracticeArea(Transform parent)
        {
            var yellow = AssetDatabase.LoadAssetAtPath<Material>(MaterialRoot + "Forklift___industrial_yellow_enamel.mat");
            var black = AssetDatabase.LoadAssetAtPath<Material>(MaterialRoot + "Forklift___black_enamel.mat");
            var steel = AssetDatabase.LoadAssetAtPath<Material>(MaterialRoot + "Forklift___forged_steel.mat");
            Require(yellow != null && black != null && steel != null, "Forklift practice materials are missing.");
            var parking = Child("Forklift parking bay", parent).transform;
            foreach (float x in new[] { -1.0f, 1.0f }) PaintedBox("Parking line", parking, new Vector3(x, .011f, -5.6f), new Vector3(.045f, .006f, 4.5f), yellow);
            PaintedBox("Parking rear line", parking, new Vector3(0, .011f, -7.85f), new Vector3(2.05f, .006f, .045f), yellow);
            Text("04 / LPG", parking, new Vector3(0, .019f, -8.13f), .16f, Quaternion.Euler(90, 0, 0), TextAnchor.MiddleCenter);
            var course = Child("Single wheel ramp practice area", parent).transform;
            foreach (float x in new[] { 3.5f, 7.1f }) PaintedBox("Practice boundary", course, new Vector3(x, .011f, -3.7f), new Vector3(.04f, .006f, 8.0f), yellow);
            // Reverse from the clear north apron. The lowered mast correctly catches a
            // forward approach; rear tyres reach this ramp before the counterweight does.
            var rampNode = Child("Single side tipping ramp", course, new Vector3(5.52f, 0, -2f));
            rampNode.transform.localRotation = Quaternion.Euler(0, 180, 0);
            var ramp = CreateRampMesh(.32f, 3.8f, 1.05f);
            ramp = Save(ramp, MeshRoot + "SingleWheelRamp.asset");
            rampNode.AddComponent<MeshFilter>().sharedMesh = ramp;
            rampNode.AddComponent<MeshRenderer>().sharedMaterial = steel;
            var contact = rampNode.AddComponent<MeshCollider>();
            contact.sharedMesh = ramp; contact.convex = true; contact.sharedMaterial = rampContact;
            contact.contactOffset = .005f;
            float slope = Mathf.Atan2(1.05f, 3.8f) * Mathf.Rad2Deg;
            foreach (float x in new[] { -.14f, .14f })
            {
                var stripe = PaintedBox("Ramp edge", rampNode.transform, new Vector3(x, .529f, 1.9f), new Vector3(.022f, .006f, Mathf.Sqrt(3.8f * 3.8f + 1.05f * 1.05f)), yellow);
                stripe.transform.localRotation = Quaternion.Euler(-slope, 0, 0);
            }
            for (int i = 0; i < 5; i++) PaintedBox("Single tyre approach mark", course, new Vector3(5.52f, .012f, -1.5f + i * .30f), new Vector3(.15f, .005f, .13f), yellow);
            Text("ONE TYRE TRACK", course, new Vector3(5.52f, .02f, .05f), .105f, Quaternion.Euler(90, 180, 0), TextAnchor.MiddleCenter);
            var sign = Child("Ramp instruction sign", course, new Vector3(6.5f, 0, -.9f)).transform;
            sign.localRotation = Quaternion.Euler(0, 180, 0);
            SolidBox("Sign post", sign, new Vector3(0, .64f, 0), new Vector3(.055f, 1.28f, .055f), black);
            SolidBox("Sign board", sign, new Vector3(0, 1.28f, 0), new Vector3(1.18f, .60f, .045f), black);
            Text("ONE SIDE RAMP", sign, new Vector3(0, 1.43f, -.026f), .055f, Quaternion.identity, TextAnchor.MiddleCenter);
            Text("Face away from the ramp\nReverse one side onto it\nClimb slowly\nUneven ground can overturn", sign, new Vector3(0, 1.20f, -.026f), .033f, Quaternion.identity, TextAnchor.MiddleCenter);
        }

        public static Mesh CreateRampMesh(float width, float length, float height)
        {
            var mesh = new Mesh { name = "Single wheel ramp" };
            float x = width * .5f;
            mesh.vertices = new[] { new Vector3(-x, 0, 0), new Vector3(x, 0, 0), new Vector3(-x, 0, length), new Vector3(x, 0, length), new Vector3(-x, height, length), new Vector3(x, height, length) };
            mesh.triangles = new[] { 0, 2, 4, 1, 5, 3, 0, 5, 1, 0, 4, 5, 2, 5, 4, 2, 3, 5, 0, 3, 2, 0, 1, 3 };
            mesh.RecalculateNormals(); mesh.RecalculateBounds();
            return mesh;
        }

        static PhysicsMaterial Contact(string name, float staticFriction, float dynamicFriction)
        {
            var material = new PhysicsMaterial(name) { staticFriction = staticFriction, dynamicFriction = dynamicFriction, bounciness = 0, frictionCombine = PhysicsMaterialCombine.Average, bounceCombine = PhysicsMaterialCombine.Minimum };
            return Save(material, MaterialRoot + SafeName(name) + ".physicMaterial");
        }

        static BoxCollider Box(Transform parent, string name, Vector3 centre, Vector3 size)
        {
            var node = Child(name, parent, centre);
            var collider = node.AddComponent<BoxCollider>();
            collider.size = size; collider.sharedMaterial = bodyContact; collider.contactOffset = .003f;
            return collider;
        }

        static void Beam(Transform parent, string name, Vector3 start, Vector3 end, float width, float depth)
        {
            var collider = Box(parent, name, (start + end) * .5f, new Vector3(width, depth, (end - start).magnitude));
            collider.transform.localRotation = Quaternion.LookRotation((end - start).normalized);
        }

        static GameObject PaintedBox(string name, Transform parent, Vector3 position, Vector3 size, Material material)
        {
            var node = GameObject.CreatePrimitive(PrimitiveType.Cube); node.name = name;
            node.transform.SetParent(parent, false); node.transform.localPosition = position; node.transform.localScale = size;
            Object.DestroyImmediate(node.GetComponent<Collider>());
            node.GetComponent<Renderer>().sharedMaterial = material;
            return node;
        }

        static void SolidBox(string name, Transform parent, Vector3 position, Vector3 size, Material material)
        {
            var node = PaintedBox(name, parent, position, size, material);
            node.AddComponent<BoxCollider>().sharedMaterial = bodyContact;
        }

        static void Text(string value, Transform parent, Vector3 position, float size, Quaternion rotation, TextAnchor anchor)
        {
            var node = Child(value.Replace("\n", " "), parent, position);
            node.transform.localRotation = rotation;
            var text = node.AddComponent<TextMesh>();
            text.text = value; text.font = Resources.Load<Font>("RackLabFont"); text.fontSize = 80; text.characterSize = size / 8;
            text.anchor = anchor; text.alignment = TextAlignment.Center; text.color = new Color(.92f, .88f, .72f);
            if (text.font != null) node.GetComponent<MeshRenderer>().sharedMaterial = text.font.material;
        }

        static GameObject Child(string name, Transform parent, Vector3 position = default)
        {
            var node = new GameObject(name); node.transform.SetParent(parent, false); node.transform.localPosition = position; return node;
        }

        static Transform Find(Transform root, string name)
        {
            var result = root.GetComponentsInChildren<Transform>(true).FirstOrDefault(t => t.name == name);
            if (result == null) throw new InvalidOperationException("Forklift part missing: " + name);
            return result;
        }

        static int[] BoxTriangles() => new[] { 0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 5, 1, 0, 4, 5, 1, 6, 2, 1, 5, 6, 2, 7, 3, 2, 6, 7, 3, 4, 0, 3, 7, 4 };
        static string SafeName(string value) => string.Concat(value.Select(c => char.IsLetterOrDigit(c) || c == '_' || c == '-' ? c : '_'));
        static void Require(bool value, string message) { if (!value) throw new InvalidOperationException(message); }

        static T Save<T>(T value, string path) where T : Object
        {
            var previous = AssetDatabase.LoadAssetAtPath<T>(path);
            if (previous == null) { AssetDatabase.CreateAsset(value, path); return value; }
            EditorUtility.CopySerialized(value, previous); Object.DestroyImmediate(value); EditorUtility.SetDirty(previous); return previous;
        }
    }
}
