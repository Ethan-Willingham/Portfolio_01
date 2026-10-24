using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    // This advances only a disposable local physics scene. It never simulates,
    // saves, or changes the warehouse scene, and does not enter Play mode.
    public static class ForkliftDrivingValidation
    {
        const string PrefabPath = "Assets/RackLab/Prefabs/WarehouseForklift.prefab";
        const string ReportPath = "Assets/RackLab/Reports/forklift-driving-validation.json";
        const float StepSeconds = .02f;

        [Serializable]
        public sealed class Measurement
        {
            public string name;
            public float value;
            public string units;
        }

        [Serializable]
        public sealed class Check
        {
            public string name;
            public bool passed;
            public string expectation;
            public string error;
            public List<Measurement> measurements = new List<Measurement>();

            public float Measure(string metric, float value, string units)
            {
                measurements.Add(new Measurement { name = metric, value = value, units = units });
                return value;
            }
        }

        [Serializable]
        public sealed class Report
        {
            public string generatedUtc;
            public string unityVersion;
            public string prefab = PrefabPath;
            public string method = "Isolated PhysX scene, fixed 0.02 second steps matching the project, actual prefab rigidbodies, wheel colliders and compound colliders.";
            public string scope = "Unloaded driving physics. Does not certify load capacity, lifting, pallet interaction, tire behavior on every surface, or a published player.";
            public bool passed;
            public List<Check> checks = new List<Check>();
        }

        [MenuItem("One Shift/Validate forklift driving")]
        public static void MenuValidate()
        {
            Debug.Log(ValidateAndSave());
        }

        public static string Validate() { return JsonUtility.ToJson(Run(), true); }

        public static string ValidateAndSave()
        {
            var report = Run();
            string json = JsonUtility.ToJson(report, true);
            Directory.CreateDirectory(Path.GetDirectoryName(ReportPath));
            File.WriteAllText(ReportPath, json + "\n");
            AssetDatabase.ImportAsset(ReportPath);
            return json;
        }

        public static Report Run()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                throw new InvalidOperationException("Stop Play before running isolated forklift validation.");
            if (AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath) == null)
                throw new InvalidOperationException("Build the WarehouseForklift prefab before validation.");

            var report = new Report { generatedUtc = DateTime.UtcNow.ToString("O"), unityVersion = Application.unityVersion };
            RunCheck(report, "settles on all four tires", "An unloaded stationary truck settles within 0.2 m of authored floor height with four supported wheels, less than 0.15 m/s motion and less than 3 degrees lean.", Settles);
            RunCheck(report, "forward acceleration", "Full throttle moves the actual rigidbody at least 8 m in 7 seconds, reaches 2 to 5.5 m/s, and stays straight and upright on level concrete.", Accelerates);
            RunCheck(report, "service braking", "Braking from driving speed stops within 4 seconds and 7 m, while preserving a nonzero physical stopping distance.", Brakes);
            RunCheck(report, "inching decelerates physically", "The inching pedal slows a moving truck to below 1.2 m/s without instantly replacing its velocity.", Inches);
            RunCheck(report, "reverse", "Reverse produces at least 3 m of backward travel and a final backward speed between 0.8 and 3.8 m/s.", Reverses);
            RunCheck(report, "right rear steering", "A right input at low speed turns the nose right. Front wheels remain unsteered and rear wheels steer left.", (rig, check) => RearSteers(rig, check, 1f));
            RunCheck(report, "left rear steering", "A left input at low speed turns the nose left. Front wheels remain unsteered and rear wheels steer right.", (rig, check) => RearSteers(rig, check, -1f));
            RunCheck(report, "both tire tracks climb", "Both pairs of tires climb a 0.8 m high, 6 m long ramp, raising the body by at least 0.35 m with visible pitch and no rollover.", Climbs);
            RunCheck(report, "one sided ramp rollover", "Reversing one side onto the playable 1.05 m high, 3.8 m long ramp produces a physical roll past 90 degrees without injected roll forces or scripted rotation. The lowered mast correctly blocks a forward approach.", RollsOver);
            RunCheck(report, "airborne gravity and free rotation", "An airborne truck falls under gravity and retains angular momentum, with no upright lock.", FallsFreely);
            RunCheck(report, "solid obstacle collision", "The truck stops against a 3 m high wall and its body never passes through it.", Collides);
            RunCheck(report, "pause clears driving input", "Deactivation zeros wheel motor torque immediately. Reactivation without a fresh input leaves torque at zero.", ClearsPausedInput);
            report.passed = report.checks.All(check => check.passed);
            return report;
        }

        static void RunCheck(Report report, string name, string expectation, Action<Rig, Check> action)
        {
            var check = new Check { name = name, expectation = expectation };
            report.checks.Add(check);
            try
            {
                using (var rig = new Rig()) action(rig, check);
            }
            catch (Exception error) { check.error = error.ToString(); check.passed = false; }
        }

        static void Settles(Rig rig, Check check)
        {
            rig.Step(3f);
            float height = check.Measure("root height", rig.Body.position.y, "m");
            float speed = check.Measure("remaining speed", rig.Body.linearVelocity.magnitude, "m/s");
            float lean = check.Measure("body lean", Vector3.Angle(rig.Body.rotation * Vector3.up, Vector3.up), "degrees");
            int grounded = rig.Controller.wheels.Count(wheel => wheel != null && wheel.isGrounded);
            check.Measure("grounded wheels", grounded, "count");
            check.Measure("total physical mass", rig.Vehicle.GetComponentsInChildren<Rigidbody>().Sum(body => body.mass), "kg");
            check.Measure("main body center of mass height", rig.Body.centerOfMass.y, "m");
            float solidClearance = rig.Vehicle.GetComponentsInChildren<Collider>().Where(collider => !(collider is WheelCollider) && collider.enabled && !collider.isTrigger).Min(collider => collider.bounds.min.y);
            check.Measure("lowest solid collider above floor", solidClearance, "m");
            check.Measure("lowest fork blade above floor", rig.Vehicle.GetComponentsInChildren<MeshCollider>().Where(collider => collider.name == "Solid tapered fork blade").Min(collider => collider.bounds.min.y), "m");
            check.passed = height > -.15f && height < .2f && speed < .15f && lean < 3f && grounded == 4 && solidClearance > .005f;
        }

        static void Accelerates(Rig rig, Check check)
        {
            rig.Step(2f);
            Vector3 start = rig.Body.position;
            float maxSpeed = 0f, maxLean = 0f;
            rig.Input(1f, 0f);
            rig.Step(7f, () =>
            {
                maxSpeed = Mathf.Max(maxSpeed, rig.Body.linearVelocity.magnitude);
                maxLean = Mathf.Max(maxLean, Vector3.Angle(rig.Body.rotation * Vector3.up, Vector3.up));
            });
            float distance = check.Measure("forward travel", rig.Body.position.z - start.z, "m");
            check.Measure("peak speed", maxSpeed, "m/s");
            check.Measure("peak lean", maxLean, "degrees");
            float sideways = check.Measure("sideways drift", Mathf.Abs(rig.Body.position.x - start.x), "m");
            check.passed = distance > 8f && distance < 40f && maxSpeed > 2f && maxSpeed < 5.5f && maxLean < 8f && sideways < .7f;
        }

        static void Brakes(Rig rig, Check check)
        {
            rig.Step(2f);
            rig.Input(1f, 0f);
            rig.Step(5f);
            float entrySpeed = check.Measure("speed before braking", rig.Body.linearVelocity.magnitude, "m/s");
            Vector3 start = rig.Body.position;
            rig.Input(0f, 0f, true);
            float elapsed = 0f;
            while (elapsed < 6f && rig.Body.linearVelocity.magnitude > .12f)
            {
                rig.Step(StepSeconds);
                elapsed += StepSeconds;
            }
            float distance = check.Measure("stopping distance", Vector3.Distance(start, rig.Body.position), "m");
            check.Measure("stopping time", elapsed, "s");
            check.Measure("remaining speed", rig.Body.linearVelocity.magnitude, "m/s");
            check.passed = entrySpeed > 2f && distance > .2f && distance < 7f && elapsed < 4f && rig.Body.linearVelocity.magnitude <= .12f;
        }

        static void Reverses(Rig rig, Check check)
        {
            rig.Step(2f);
            Vector3 start = rig.Body.position;
            rig.Input(-1f, 0f);
            rig.Step(5f);
            float distance = check.Measure("backward travel", start.z - rig.Body.position.z, "m");
            float speed = check.Measure("signed final speed", Vector3.Dot(rig.Body.linearVelocity, rig.Body.rotation * Vector3.forward), "m/s");
            check.passed = distance > 3f && speed < -.8f && speed > -3.8f;
        }

        static void Inches(Rig rig, Check check)
        {
            rig.Step(2f);
            rig.Input(1f, 0f);
            rig.Step(4f);
            float before = check.Measure("speed before inching", rig.Body.linearVelocity.magnitude, "m/s");
            rig.Controller.SetDriverInput(1f, 0f, false, false, true);
            rig.Step(.06f);
            float initial = check.Measure("speed after first 60 milliseconds", rig.Body.linearVelocity.magnitude, "m/s");
            rig.Step(4f);
            float final = check.Measure("speed after four seconds", rig.Body.linearVelocity.magnitude, "m/s");
            check.passed = before > 2f && initial > before - .8f && final < 1.2f && final > .1f;
        }

        static void RearSteers(Rig rig, Check check, float direction)
        {
            rig.Step(2f);
            rig.Input(.28f, 0f);
            rig.Step(1.5f);
            Vector3 start = rig.Body.position;
            Vector3 startNose = (rig.Controller.wheels[0].transform.position + rig.Controller.wheels[1].transform.position) * .5f;
            Vector3 forward = rig.Body.rotation * Vector3.forward;
            rig.Input(.28f, direction);
            rig.Step(2f);
            float heading = check.Measure("nose turn toward requested side", direction * Vector3.SignedAngle(Vector3.ProjectOnPlane(forward, Vector3.up), Vector3.ProjectOnPlane(rig.Body.rotation * Vector3.forward, Vector3.up), Vector3.up), "degrees");
            Vector3 finalNose = (rig.Controller.wheels[0].transform.position + rig.Controller.wheels[1].transform.position) * .5f;
            float lateral = check.Measure("front axle travel toward requested side", direction * (finalNose.x - startNose.x), "m");
            check.Measure("body center lateral travel", direction * (rig.Body.position.x - start.x), "m");
            float front = check.Measure("front wheel steer", Mathf.Max(Mathf.Abs(rig.Controller.wheels[0].steerAngle), Mathf.Abs(rig.Controller.wheels[1].steerAngle)), "degrees");
            float rear = check.Measure("average rear wheel steer", (rig.Controller.wheels[2].steerAngle + rig.Controller.wheels[3].steerAngle) * .5f, "degrees");
            check.passed = heading > 8f && lateral > .15f && front < .01f && rear * direction < -2f && !rig.Controller.IsOverturned;
        }

        static void Climbs(Rig rig, Check check)
        {
            // Separate tire tracks leave the lowered forks' central path clear.
            // A full-width ramp correctly contacts lowered forks before the tires.
            rig.Ramp("left tire ramp", -.52f, .30f, 4f, 10f, .8f);
            rig.Ramp("right tire ramp", .52f, .30f, 4f, 10f, .8f);
            rig.Box("left ramp landing", new Vector3(-.52f, .4f, 13f), new Vector3(.30f, .8f, 6f));
            rig.Box("right ramp landing", new Vector3(.52f, .4f, 13f), new Vector3(.30f, .8f, 6f));
            rig.Step(2f);
            float startHeight = rig.Body.position.y, maxHeight = startHeight, maxPitch = 0f, maxLean = 0f;
            rig.Input(1f, 0f);
            rig.Step(10f, () =>
            {
                maxHeight = Mathf.Max(maxHeight, rig.Body.position.y);
                maxPitch = Mathf.Max(maxPitch, Mathf.Abs(Mathf.Asin(Mathf.Clamp((rig.Body.rotation * Vector3.forward).y, -1f, 1f)) * Mathf.Rad2Deg));
                maxLean = Mathf.Max(maxLean, Vector3.Angle(rig.Body.rotation * Vector3.up, Vector3.up));
            });
            check.Measure("maximum body rise", maxHeight - startHeight, "m");
            check.Measure("maximum pitch", maxPitch, "degrees");
            check.Measure("maximum lean", maxLean, "degrees");
            check.Measure("final forward position", rig.Body.position.z, "m");
            check.passed = maxHeight - startHeight > .35f && maxPitch > 4f && maxLean < 50f;
        }

        static void RollsOver(Rig rig, Check check)
        {
            // Rear tires approach first. With the forks down, the low mast foot
            // physically contacts this steep ramp during a forward approach.
            rig.Controller.ResetVehicle(new Vector3(0f, .15f, 0f), Quaternion.Euler(0f, 180f, 0f));
            rig.PlayableRamp("right tire rollover ramp", new Vector3(.52f, 0f, 4f));
            rig.Step(2f);
            float maxRoll = 0f, maxLateralRoll = 0f, maxHeight = rig.Body.position.y;
            float firstTipAt = -1f;
            float elapsed = 0f;
            rig.Input(-1f, 0f);
            rig.Step(10f, () =>
            {
                elapsed += StepSeconds;
                float roll = Vector3.Angle(rig.Body.rotation * Vector3.up, Vector3.up);
                maxRoll = Mathf.Max(maxRoll, roll);
                maxLateralRoll = Mathf.Max(maxLateralRoll, Mathf.Asin(Mathf.Clamp01(Mathf.Abs((rig.Body.rotation * Vector3.right).y))) * Mathf.Rad2Deg);
                maxHeight = Mathf.Max(maxHeight, rig.Body.position.y);
                if (roll > 90f && firstTipAt < 0f) firstTipAt = elapsed;
            });
            check.Measure("maximum body lean", maxRoll, "degrees");
            check.Measure("maximum lateral roll before overturn", maxLateralRoll, "degrees");
            check.Measure("first overturn after throttle", firstTipAt, "s");
            check.Measure("maximum body height", maxHeight, "m");
            check.Measure("final forward position", rig.Body.position.z, "m");
            check.passed = maxRoll > 90f && maxLateralRoll > 45f && firstTipAt > 0f;
        }

        static void FallsFreely(Rig rig, Check check)
        {
            rig.Controller.ResetVehicle(new Vector3(0f, 8f, 0f), Quaternion.Euler(0f, 0f, 25f));
            rig.Controller.SetOccupied(true);
            rig.Body.angularVelocity = Vector3.forward * 1.5f;
            if (rig.Controller.rearAxleBody != null)
                rig.Controller.rearAxleBody.angularVelocity = rig.Body.angularVelocity;
            Vector3 start = rig.Body.position;
            Quaternion rotation = rig.Body.rotation;
            rig.Step(.6f);
            float fall = check.Measure("fall distance", start.y - rig.Body.position.y, "m");
            float downward = check.Measure("vertical velocity", rig.Body.linearVelocity.y, "m/s");
            float rotated = check.Measure("free rotation", Quaternion.Angle(rotation, rig.Body.rotation), "degrees");
            check.passed = fall > 1.2f && downward < -4.5f && rotated > 10f && rig.Body.position.y > 3f;
        }

        static void Collides(Rig rig, Check check)
        {
            var wall = rig.Box("solid test wall", new Vector3(0f, 1.5f, 8f), new Vector3(20f, 3f, .5f));
            rig.Step(2f);
            float maximumForward = rig.Body.position.z;
            rig.Input(1f, 0f);
            rig.Step(10f, () => maximumForward = Mathf.Max(maximumForward, rig.Body.position.z));
            float penetration = 0f;
            foreach (var collider in rig.Vehicle.GetComponentsInChildren<Collider>())
            {
                if (collider is WheelCollider || collider.isTrigger || !collider.enabled) continue;
                if (Physics.ComputePenetration(collider, collider.transform.position, collider.transform.rotation,
                    wall, wall.transform.position, wall.transform.rotation, out _, out float distance))
                    penetration = Mathf.Max(penetration, distance);
            }
            check.Measure("maximum body forward position", maximumForward, "m");
            check.Measure("final speed against wall", rig.Body.linearVelocity.magnitude, "m/s");
            check.Measure("maximum final wall penetration", penetration, "m");
            check.passed = maximumForward > 2f && maximumForward < 7.9f && rig.Body.linearVelocity.magnitude < .6f && penetration < .10f;
        }

        static void ClearsPausedInput(Rig rig, Check check)
        {
            rig.Step(2f);
            rig.Input(1f, .5f);
            rig.Step(1f);
            float before = rig.Controller.wheels.Sum(wheel => Mathf.Abs(wheel.motorTorque));
            rig.Controller.SetBrowserActive(false);
            float paused = rig.Controller.wheels.Sum(wheel => Mathf.Abs(wheel.motorTorque));
            rig.Step(.1f);
            rig.Controller.SetBrowserActive(true);
            rig.Step(.1f);
            float resumed = rig.Controller.wheels.Sum(wheel => Mathf.Abs(wheel.motorTorque));
            check.Measure("motor torque before deactivation", before, "Nm");
            check.Measure("motor torque immediately inactive", paused, "Nm");
            check.Measure("motor torque after resume without fresh input", resumed, "Nm");
            check.passed = before > 1f && paused < .001f && resumed < .001f;
        }

        sealed class Rig : IDisposable
        {
            readonly Scene scene;
            readonly Scene previousActive;
            readonly PhysicsScene physics;
            readonly List<Mesh> meshes = new List<Mesh>();
            public readonly GameObject Vehicle;
            public readonly ForkliftDriveController Controller;
            public Rigidbody Body { get { return Controller.body; } }

            public Rig()
            {
                previousActive = SceneManager.GetActiveScene();
                scene = EditorSceneManager.NewPreviewScene();
                physics = scene.GetPhysicsScene();
                try
                {
                    if (!physics.IsValid() || physics == Physics.defaultPhysicsScene)
                        throw new InvalidOperationException("Validation requires an isolated physics scene.");
                    Box("validation concrete floor", new Vector3(0f, -.5f, 30f), new Vector3(200f, 1f, 200f));
                    Vehicle = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath), scene);
                    Vehicle.name = "Disposable validation forklift";
                    Vehicle.transform.SetPositionAndRotation(new Vector3(0f, .15f, 0f), Quaternion.identity);
                    Controller = Vehicle.GetComponent<ForkliftDriveController>();
                    if (Controller == null) throw new InvalidOperationException("ForkliftDriveController missing from prefab root.");
                    Controller.Initialize();
                    Controller.SetOccupied(true);
                    Controller.SetBrowserActive(true);
                    Controller.ClearDriverInput();
                    // No render or camera behavior participates in simulation.
                    foreach (var camera in Vehicle.GetComponentsInChildren<Camera>()) camera.enabled = false;
                    Physics.SyncTransforms();
                    SceneManager.SetActiveScene(previousActive);
                }
                catch
                {
                    Dispose();
                    throw;
                }
            }

            public void Input(float throttle, float steer, bool brake = false)
            {
                Controller.SetDriverInput(throttle, steer, brake, false, false);
            }

            public void Step(float seconds, Action sample = null)
            {
                int count = Mathf.CeilToInt(seconds / StepSeconds);
                for (int index = 0; index < count; ++index)
                {
                    Controller.TickPhysics(StepSeconds);
                    physics.Simulate(StepSeconds);
                    sample?.Invoke();
                    if (float.IsNaN(Body.position.sqrMagnitude) || Body.position.sqrMagnitude > 1e8f)
                        throw new InvalidOperationException("Non-finite or runaway rigidbody state.");
                }
            }

            public BoxCollider Box(string name, Vector3 center, Vector3 size)
            {
                var gameObject = CreateObject(name);
                gameObject.transform.position = center;
                var box = gameObject.AddComponent<BoxCollider>();
                box.size = size;
                Physics.SyncTransforms();
                return box;
            }

            public void Ramp(string name, float centerX, float width, float startZ, float endZ, float height)
            {
                float left = centerX - width * .5f, right = centerX + width * .5f;
                var mesh = new Mesh { name = name };
                mesh.vertices = new[]
                {
                    new Vector3(left, -.2f, startZ), new Vector3(right, -.2f, startZ),
                    new Vector3(right, -.2f, endZ), new Vector3(left, -.2f, endZ),
                    new Vector3(left, 0f, startZ), new Vector3(right, 0f, startZ),
                    new Vector3(right, height, endZ), new Vector3(left, height, endZ)
                };
                mesh.triangles = new[]
                {
                    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
                    0, 5, 1, 0, 4, 5, 1, 6, 2, 1, 5, 6,
                    2, 7, 3, 2, 6, 7, 3, 4, 0, 3, 7, 4
                };
                mesh.RecalculateNormals();
                mesh.RecalculateBounds();
                meshes.Add(mesh);
                var ramp = CreateObject(name);
                ramp.AddComponent<MeshCollider>().sharedMesh = mesh;
                Physics.SyncTransforms();
            }

            public void PlayableRamp(string name, Vector3 position)
            {
                var mesh = ForkliftBuilder.CreateRampMesh(.32f, 3.8f, 1.05f);
                meshes.Add(mesh);
                var ramp = CreateObject(name);
                ramp.transform.position = position;
                var collider = ramp.AddComponent<MeshCollider>();
                collider.sharedMesh = mesh;
                collider.convex = true;
                collider.contactOffset = .005f;
                Physics.SyncTransforms();
            }

            GameObject CreateObject(string name)
            {
                var gameObject = EditorUtility.CreateGameObjectWithHideFlags(name, HideFlags.HideAndDontSave);
                SceneManager.MoveGameObjectToScene(gameObject, scene);
                return gameObject;
            }

            public void Dispose()
            {
                if (previousActive.IsValid() && previousActive.isLoaded) SceneManager.SetActiveScene(previousActive);
                if (scene.IsValid() && scene.isLoaded) EditorSceneManager.ClosePreviewScene(scene);
                foreach (var mesh in meshes) Object.DestroyImmediate(mesh);
            }
        }
    }
}
