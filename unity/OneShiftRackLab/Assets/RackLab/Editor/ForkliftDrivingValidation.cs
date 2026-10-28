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
        const float StepSeconds = .005f;

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
            public string method = "Isolated PhysX scene, fixed 0.005 second steps matching the project, actual prefab rigidbodies, wheel colliders and compound colliders.";
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
            if (Mathf.Abs(Time.fixedDeltaTime - StepSeconds) > .000001f)
                throw new InvalidOperationException("Validation requires the production fixed timestep to be 0.005 seconds. Current Time.fixedDeltaTime: " + Time.fixedDeltaTime);
            if (AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath) == null)
                throw new InvalidOperationException("Build the WarehouseForklift prefab before validation.");

            var report = new Report { generatedUtc = DateTime.UtcNow.ToString("O"), unityVersion = Application.unityVersion };
            RunCheck(report, "settles on all four tires", "An unloaded stationary truck settles within 0.2 m of authored floor height with four supported wheels, less than 0.15 m/s motion and less than 3 degrees lean.", Settles);
            RunCheck(report, "forward acceleration", "Full throttle moves the actual rigidbody at least 8 m in 7 seconds, reaches 2 to 5.5 m/s, and stays straight and upright on level concrete.", Accelerates);
            RunCheck(report, "service braking", "Braking from driving speed stops within 4 seconds and 7 m, while preserving a nonzero physical stopping distance.", Brakes);
            RunCheck(report, "lift-off deceleration", "Releasing the accelerator near 4.16 m/s removes propulsion immediately and slows through finite driveline torque, reaching below 0.12 m/s within 3 seconds and 6 m without applying the service or parking brake.", Coasts);
            RunCheck(report, "prompt rear steering response", "Rear steering starts within the first 100 milliseconds, reaches its low-speed angle within 300 milliseconds, reverses promptly and recentres without altering body velocity.", SteeringResponse);
            RunCheck(report, "inching decelerates physically", "The inching pedal slows a moving truck to below 1.2 m/s without instantly replacing its velocity.", Inches);
            RunCheck(report, "reverse", "Reverse produces at least 3 m of backward travel and a final backward speed between 0.8 and 3.8 m/s.", Reverses);
            RunCheck(report, "right rear steering", "A right input at low speed turns the nose right. Front wheels remain unsteered and rear wheels steer left.", (rig, check) => RearSteers(rig, check, 1f));
            RunCheck(report, "left rear steering", "A left input at low speed turns the nose left. Front wheels remain unsteered and rear wheels steer right.", (rig, check) => RearSteers(rig, check, -1f));
            RunCheck(report, "both tire tracks climb", "Both pairs of tires climb a 0.8 m high, 6 m long ramp, raising the body by at least 0.35 m with visible pitch and no rollover.", Climbs);
            RunCheck(report, "one sided ramp rollover", "Reversing one side onto the playable 1.05 m high, 3.8 m long ramp produces a physical roll past 90 degrees without injected roll forces or scripted rotation. The lowered mast correctly blocks a forward approach.", RollsOver);
            RunCheck(report, "airborne gravity and free rotation", "An airborne truck falls under gravity and retains angular momentum, with no upright lock.", FallsFreely);
            RunCheck(report, "solid obstacle collision", "The truck stops against a 3 m high wall and its body never passes through it.", Collides);
            RunCheck(report, "pause clears driving input", "Deactivation zeros wheel motor torque immediately. Reactivation without a fresh input leaves torque at zero.", ClearsPausedInput);
            RunCheck(report, "steady forward tire rolling", "During two seconds of steady forward travel above 1 m/s, each tire stays grounded for at least 95 percent of samples, has less than 15 percent P95 rolling error and less than 10 percent integrated rolling-distance error.", (rig, check) => SteadyRolling(rig, check, 1f));
            RunCheck(report, "steady reverse tire rolling", "During two seconds of steady reverse travel above 1 m/s, each tire stays grounded for at least 95 percent of samples, has less than 15 percent P95 rolling error and less than 10 percent integrated rolling-distance error.", (rig, check) => SteadyRolling(rig, check, -1f));
            RunCheck(report, "sustained right rear tire grip", "A sustained powered right circle near 1.5 m/s turns the nose right, with each rear tire's lateral contact speed below 0.15 m/s RMS and 0.25 m/s P95.", (rig, check) => SustainedTireGrip(rig, check, 1f));
            RunCheck(report, "sustained left rear tire grip", "A sustained powered left circle near 1.5 m/s turns the nose left, with each rear tire's lateral contact speed below 0.15 m/s RMS and 0.25 m/s P95.", (rig, check) => SustainedTireGrip(rig, check, -1f));
            RunCheck(report, "parking brake tire hold", "After driving and stopping, 30 seconds parked produces less than 0.05 m drift, less than 0.02 m/s P95 body speed and less than 0.02 m/s P95 tread speed on each rear tire.", ParkedTireHold);
            RunCheck(report, "uphill slope parking and release", "Facing uphill on an 8 degree slope, the parked truck holds for 10 seconds within 0.05 m, then rolls more than 0.25 m downhill within 3 seconds after release into neutral.", (rig, check) => SlopeHoldAndRelease(rig, check, true));
            RunCheck(report, "downhill slope parking and release", "Facing downhill on an 8 degree slope, the parked truck holds for 10 seconds within 0.05 m, then rolls more than 0.25 m downhill within 3 seconds after release into neutral.", (rig, check) => SlopeHoldAndRelease(rig, check, false));
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

        static void Coasts(Rig rig, Check check)
        {
            rig.Step(2f);
            rig.Input(1f, 0f);
            rig.Step(5f);
            float entry = check.Measure("speed at accelerator release", rig.Controller.SpeedMps, "m/s");
            Vector3 start = rig.Body.position;
            rig.Input(0, 0);
            rig.Step(.06f);
            float first = check.Measure("speed after 60 milliseconds", rig.Controller.SpeedMps, "m/s");
            float elapsed = .06f;
            while (elapsed < 4 && rig.Controller.SpeedMps > .12f)
            {
                rig.Step(StepSeconds);
                elapsed += StepSeconds;
            }
            float distance = check.Measure("neutral stopping distance", Vector3.Distance(start, rig.Body.position), "m");
            check.Measure("neutral stopping time", elapsed, "s");
            check.Measure("remaining drive request", rig.Controller.AppliedDriveTorque, "Nm");
            check.passed = entry > 3.8f && entry < 4.5f && first > entry - .35f && first < entry && elapsed <= 3 &&
                distance > .5f && distance <= 6 && rig.Controller.SpeedMps <= .12f &&
                rig.Controller.AppliedDriveTorque == 0 && !rig.Controller.ServiceBrake && !rig.Controller.ParkingBrake;
        }

        static void SteeringResponse(Rig rig, Check check)
        {
            rig.Step(2f);
            rig.Input(0, 1);
            rig.Step(.1f);
            float early = check.Measure("central steer after 100 milliseconds", Mathf.Abs(rig.Controller.SteerAngle), "degrees");
            rig.Step(.2f);
            float full = check.Measure("central steer after 300 milliseconds", Mathf.Abs(rig.Controller.SteerAngle), "degrees");
            rig.Input(0, -1);
            rig.Step(.25f);
            float reversed = check.Measure("opposite central steer after 250 milliseconds", rig.Controller.SteerAngle, "degrees");
            rig.Input(0, 0);
            rig.Step(.2f);
            float centre = check.Measure("released central steer after 200 milliseconds", Mathf.Abs(rig.Controller.SteerAngle), "degrees");
            check.passed = early >= 18 && full > 40 && full < 55 && reversed > 10 && centre < .01f;
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

        static void SteadyRolling(Rig rig, Check check, float direction)
        {
            rig.Step(2f);
            rig.Input(direction, 0f);
            rig.Step(5f);
            var tires = NewTireSamples();
            float minimumSpeed = float.MaxValue;
            rig.Step(2f, () =>
            {
                minimumSpeed = Mathf.Min(minimumSpeed, direction * rig.Controller.SignedSpeedMps);
                CaptureTires(rig, tires);
            });
            check.Measure("minimum requested-direction speed in sampling window", minimumSpeed, "m/s");
            bool passed = minimumSpeed > 1f;
            for (int i = 0; i < tires.Length; ++i)
            {
                tires[i].Measure(check, TireName(i));
                passed &= tires[i].GroundedFraction >= .95f && tires[i].ExpectedGroundFraction >= .95f && tires[i].MinimumContactSpeed > 1f &&
                    Percentile95(tires[i].rollingErrors) < .15f && tires[i].RollingDistanceError < .10f;
            }
            check.passed = passed;
        }

        static void SustainedTireGrip(Rig rig, Check check, float direction)
        {
            // Restrict engine road speed, without assigning either rigidbody's
            // velocity, so a powered turn can settle before measuring tire slip.
            // A lower governor also changes the controller's steering limiter.
            // Retain the roughly 58 degree production limit at 1.5 m/s, so the
            // 60 percent steering input still produces a meaningful tight turn.
            rig.Controller.highSpeedRearSteerAngle = 58f;
            rig.Controller.maximumForwardSpeed = 1.5f;
            rig.Step(2f);
            rig.Input(1f, 0f);
            rig.Step(3f);
            rig.Input(1f, direction * .6f);
            rig.Step(3f);
            var tires = NewTireSamples();
            Vector3 previousForward = Vector3.ProjectOnPlane(rig.Body.rotation * Vector3.forward, Vector3.up);
            Vector3 previousNose = FrontAxleCenter(rig);
            float heading = 0f, noseTravel = 0f, speedTotal = 0f, minimumSpeed = float.MaxValue;
            int samples = 0;
            rig.Step(4f, () =>
            {
                Vector3 forward = Vector3.ProjectOnPlane(rig.Body.rotation * Vector3.forward, Vector3.up);
                heading += direction * Vector3.SignedAngle(previousForward, forward, Vector3.up);
                previousForward = forward;
                Vector3 nose = FrontAxleCenter(rig);
                noseTravel += Vector3.ProjectOnPlane(nose - previousNose, Vector3.up).magnitude;
                previousNose = nose;
                float speed = rig.Controller.SignedSpeedMps;
                speedTotal += speed;
                minimumSpeed = Mathf.Min(minimumSpeed, speed);
                samples++;
                CaptureTires(rig, tires);
            });
            float averageSpeed = check.Measure("mean forward speed during turn", speedTotal / samples, "m/s");
            check.Measure("minimum forward speed during turn", minimumSpeed, "m/s");
            check.Measure("accumulated nose turn toward requested side", heading, "degrees");
            check.Measure("front axle apparent turn radius", noseTravel / Mathf.Max(.001f, Mathf.Abs(heading) * Mathf.Deg2Rad), "m");
            float frontSteer = check.Measure("maximum front wheel steer", Mathf.Max(Mathf.Abs(rig.Controller.wheels[0].steerAngle), Mathf.Abs(rig.Controller.wheels[1].steerAngle)), "degrees");
            float rearSteer = check.Measure("average rear wheel steer", (rig.Controller.wheels[2].steerAngle + rig.Controller.wheels[3].steerAngle) * .5f, "degrees");
            float insideRearSteer = check.Measure("inside rear wheel steer magnitude", Mathf.Max(Mathf.Abs(rig.Controller.wheels[2].steerAngle), Mathf.Abs(rig.Controller.wheels[3].steerAngle)), "degrees");
            bool passed = heading > 20f && averageSpeed > 1f && averageSpeed < 1.8f && minimumSpeed > .75f &&
                frontSteer < .01f && rearSteer * direction < -2f && insideRearSteer > 25f && !rig.Controller.IsOverturned;
            for (int i = 0; i < tires.Length; ++i)
            {
                tires[i].Measure(check, TireName(i));
                passed &= tires[i].GroundedFraction >= .95f && tires[i].ExpectedGroundFraction >= .95f;
                if (i >= 2) passed &= RootMeanSquare(tires[i].lateralSpeeds) < .15f && Percentile95(tires[i].lateralSpeeds) < .25f;
            }
            check.passed = passed;
        }

        static void ParkedTireHold(Rig rig, Check check)
        {
            rig.Step(2f);
            rig.Input(1f, 0f);
            rig.Step(2f);
            float drivenSpeed = check.Measure("speed before parking approach", rig.Controller.SpeedMps, "m/s");
            rig.Input(0f, 0f, true);
            rig.Step(5f);
            float stoppedSpeed = check.Measure("speed after service brake stop", rig.Controller.SpeedMps, "m/s");
            rig.Controller.SetDriverInput(0f, 0f, false, true, false);
            rig.Step(1f);
            Vector3 start = rig.Body.position;
            var speeds = new List<float>();
            var tires = NewTireSamples();
            float maximumDrift = 0f;
            rig.Step(30f, () =>
            {
                maximumDrift = Mathf.Max(maximumDrift, Vector3.ProjectOnPlane(rig.Body.position - start, Vector3.up).magnitude);
                speeds.Add(rig.Controller.SpeedMps);
                CaptureTires(rig, tires);
            });
            check.Measure("parked sampling duration", 30f, "s");
            check.Measure("maximum parked horizontal drift", maximumDrift, "m");
            float speed95 = check.Measure("parked body speed P95", Percentile95(speeds), "m/s");
            bool passed = drivenSpeed > 1f && stoppedSpeed < .12f && maximumDrift < .05f && speed95 < .02f;
            for (int i = 0; i < tires.Length; ++i)
            {
                tires[i].Measure(check, TireName(i));
                passed &= tires[i].GroundedFraction >= .95f && tires[i].ExpectedGroundFraction >= .95f;
                if (i >= 2) passed &= Percentile95(tires[i].treadSpeeds) < .02f;
            }
            check.passed = passed;
        }

        static void SlopeHoldAndRelease(Rig rig, Check check, bool faceUphill)
        {
            // Spawn on a broad inclined surface above the ordinary floor. This
            // measures tire hold, without asking lowered forks to climb an edge.
            Quaternion slopeRotation = Quaternion.Euler(-8f, 0f, 0f);
            Vector3 normal = slopeRotation * Vector3.up;
            Vector3 topCenter = new Vector3(0f, 6f, 0f);
            var platform = rig.Box("8 degree slope support", topCenter - normal * .5f, new Vector3(30f, 1f, 60f));
            platform.transform.rotation = slopeRotation;
            Quaternion vehicleRotation = slopeRotation * Quaternion.Euler(0f, faceUphill ? 0f : 180f, 0f);
            rig.Controller.ResetVehicle(topCenter + normal * .15f, vehicleRotation);
            rig.Controller.SetDriverInput(0f, 0f, false, true, false);
            Physics.SyncTransforms();
            rig.Step(3f);
            float penetration = MaximumPenetration(rig, platform);
            Vector3 start = rig.Body.position;
            var speeds = new List<float>();
            var parkedTires = NewTireSamples();
            float maximumDrift = 0f;
            rig.Step(10f, () =>
            {
                maximumDrift = Mathf.Max(maximumDrift, Vector3.ProjectOnPlane(rig.Body.position - start, normal).magnitude);
                speeds.Add(rig.Controller.SpeedMps);
                CaptureTires(rig, parkedTires, platform);
            });
            check.Measure("slope angle", 8f, "degrees");
            check.Measure("maximum parked slope drift", maximumDrift, "m");
            float speed95 = check.Measure("parked slope speed P95", Percentile95(speeds), "m/s");
            check.Measure("solid collider penetration into slope after settling", penetration, "m");
            bool passed = maximumDrift < .05f && speed95 < .02f && penetration < .005f;
            for (int i = 0; i < parkedTires.Length; ++i)
            {
                parkedTires[i].Measure(check, "parked " + TireName(i));
                passed &= parkedTires[i].GroundedFraction >= .95f && parkedTires[i].ExpectedGroundFraction >= .95f;
            }

            Vector3 downhill = Vector3.ProjectOnPlane(Vector3.down, normal).normalized;
            Vector3 releaseStart = rig.Body.position;
            var releasedTires = NewTireSamples();
            rig.Input(0f, 0f);
            rig.Step(3f, () => CaptureTires(rig, releasedTires, platform));
            float descent = check.Measure("downhill travel three seconds after neutral release", Vector3.Dot(rig.Body.position - releaseStart, downhill), "m");
            check.Measure("downhill speed after neutral release", Vector3.Dot(rig.Body.linearVelocity, downhill), "m/s");
            check.Measure("front brake torque after neutral release", rig.Controller.wheels[0].brakeTorque, "Nm");
            for (int i = 0; i < releasedTires.Length; ++i)
            {
                releasedTires[i].Measure(check, "released " + TireName(i));
                passed &= releasedTires[i].ExpectedGroundFraction >= .95f;
            }
            check.passed = passed && descent > .25f;
        }

        static float MaximumPenetration(Rig rig, Collider surface)
        {
            float maximum = 0f;
            foreach (var collider in rig.Vehicle.GetComponentsInChildren<Collider>())
            {
                if (collider is WheelCollider || collider.isTrigger || !collider.enabled) continue;
                if (Physics.ComputePenetration(collider, collider.transform.position, collider.transform.rotation,
                    surface, surface.transform.position, surface.transform.rotation, out _, out float distance))
                    maximum = Mathf.Max(maximum, distance);
            }
            return maximum;
        }

        static Vector3 FrontAxleCenter(Rig rig)
        {
            return (rig.Controller.wheels[0].transform.position + rig.Controller.wheels[1].transform.position) * .5f;
        }

        static string TireName(int index) { return new[] { "FL", "FR", "RL", "RR" }[index]; }

        static TireSamples[] NewTireSamples()
        {
            return new[] { new TireSamples(), new TireSamples(), new TireSamples(), new TireSamples() };
        }

        static void CaptureTires(Rig rig, TireSamples[] samples, Collider expectedGround = null)
        {
            if (expectedGround == null) expectedGround = rig.Floor;
            for (int i = 0; i < samples.Length; ++i) samples[i].Capture(rig.Controller.wheels[i], expectedGround);
        }

        static float Percentile95(List<float> samples)
        {
            if (samples.Count == 0) return 0f;
            var sorted = samples.ToArray();
            Array.Sort(sorted);
            return sorted[Mathf.Clamp(Mathf.CeilToInt(sorted.Length * .95f) - 1, 0, sorted.Length - 1)];
        }

        static float RootMeanSquare(List<float> samples)
        {
            if (samples.Count == 0) return 0f;
            double sum = 0;
            foreach (float value in samples) sum += value * value;
            return (float)Math.Sqrt(sum / samples.Count);
        }

        sealed class TireSamples
        {
            public readonly List<float> rollingErrors = new List<float>();
            public readonly List<float> lateralSpeeds = new List<float>();
            public readonly List<float> treadSpeeds = new List<float>();
            readonly List<float> lateralAngles = new List<float>();
            readonly List<float> reportedForwardSlips = new List<float>();
            readonly List<float> reportedSidewaysSlips = new List<float>();
            int samples, groundedSamples, expectedGroundSamples;
            float contactTravel, rollingTravel, minimumContactSpeed = float.MaxValue;
            public float GroundedFraction => samples > 0 ? groundedSamples / (float)samples : 0f;
            public float ExpectedGroundFraction => samples > 0 ? expectedGroundSamples / (float)samples : 0f;
            public float MinimumContactSpeed => groundedSamples > 0 ? minimumContactSpeed : 0f;
            public float RollingDistanceError => Mathf.Abs(rollingTravel - contactTravel) / Mathf.Max(contactTravel, .001f);

            public void Capture(WheelCollider wheel, Collider expectedGround)
            {
                samples++;
                if (wheel == null) return;
                float rollingSpeed = wheel.rpm * 2f * Mathf.PI * wheel.radius / 60f;
                treadSpeeds.Add(Mathf.Abs(rollingSpeed));
                if (!wheel.GetGroundHit(out WheelHit hit)) return;
                groundedSamples++;
                if (expectedGround == null || hit.collider == expectedGround) expectedGroundSamples++;
                // Rear contact velocity comes from the oscillating axle, not
                // the main body. Point velocity includes its angular motion.
                Vector3 relativeVelocity = wheel.attachedRigidbody.GetPointVelocity(hit.point);
                var groundBody = hit.collider != null ? hit.collider.attachedRigidbody : null;
                if (groundBody != null) relativeVelocity -= groundBody.GetPointVelocity(hit.point);
                float longitudinal = Vector3.Dot(relativeVelocity, hit.forwardDir.normalized);
                float lateral = Vector3.Dot(relativeVelocity, hit.sidewaysDir.normalized);
                float longitudinalMagnitude = Mathf.Abs(longitudinal);
                minimumContactSpeed = Mathf.Min(minimumContactSpeed, longitudinalMagnitude);
                contactTravel += longitudinalMagnitude * StepSeconds;
                rollingTravel += Mathf.Abs(rollingSpeed) * StepSeconds;
                rollingErrors.Add(Mathf.Abs(rollingSpeed - longitudinal) / Mathf.Max(longitudinalMagnitude, .5f));
                lateralSpeeds.Add(Mathf.Abs(lateral));
                lateralAngles.Add(Mathf.Atan2(Mathf.Abs(lateral), Mathf.Max(longitudinalMagnitude, .5f)) * Mathf.Rad2Deg);
                // Report native slip, but judge grip from independent motion.
                // Sticky tire constraints can suppress the native slip signal.
                reportedForwardSlips.Add(Mathf.Abs(hit.forwardSlip));
                reportedSidewaysSlips.Add(Mathf.Abs(hit.sidewaysSlip));
            }

            public void Measure(Check check, string prefix)
            {
                check.Measure(prefix + " grounded sample fraction", GroundedFraction, "fraction");
                check.Measure(prefix + " expected surface sample fraction", ExpectedGroundFraction, "fraction");
                check.Measure(prefix + " minimum longitudinal contact speed", MinimumContactSpeed, "m/s");
                check.Measure(prefix + " rolling error P95", Percentile95(rollingErrors), "fraction");
                check.Measure(prefix + " integrated rolling distance error", RollingDistanceError, "fraction");
                check.Measure(prefix + " contact travel", contactTravel, "m");
                check.Measure(prefix + " wheel circumference travel", rollingTravel, "m");
                check.Measure(prefix + " lateral contact speed RMS", RootMeanSquare(lateralSpeeds), "m/s");
                check.Measure(prefix + " lateral contact speed P95", Percentile95(lateralSpeeds), "m/s");
                check.Measure(prefix + " lateral contact angle P95", Percentile95(lateralAngles), "degrees");
                check.Measure(prefix + " tread speed P95", Percentile95(treadSpeeds), "m/s");
                check.Measure(prefix + " reported forward slip P95", Percentile95(reportedForwardSlips), "native slip");
                check.Measure(prefix + " reported sideways slip P95", Percentile95(reportedSidewaysSlips), "native slip");
            }
        }

        sealed class Rig : IDisposable
        {
            readonly Scene scene;
            readonly Scene previousActive;
            readonly PhysicsScene physics;
            readonly List<Mesh> meshes = new List<Mesh>();
            public readonly BoxCollider Floor;
            public readonly GameObject Vehicle;
            public readonly ForkliftDriveController Controller;
            public readonly ForkliftLiftController LiftController;
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
                    Floor = Box("validation concrete floor", new Vector3(0f, -.5f, 30f), new Vector3(200f, 1f, 200f));
                    Vehicle = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath), scene);
                    Vehicle.name = "Disposable validation forklift";
                    Vehicle.transform.SetPositionAndRotation(new Vector3(0f, .15f, 0f), Quaternion.identity);
                    Controller = Vehicle.GetComponent<ForkliftDriveController>();
                    if (Controller == null) throw new InvalidOperationException("ForkliftDriveController missing from prefab root.");
                    Controller.Initialize();
                    Controller.SetOccupied(true);
                    Controller.SetBrowserActive(true);
                    Controller.ClearDriverInput();
                    LiftController = Vehicle.GetComponent<ForkliftLiftController>();
                    if (LiftController != null)
                    {
                        LiftController.Initialize();
                        LiftController.SetBrowserActive(true);
                        LiftController.ClearInput();
                    }
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
                    if (LiftController != null) LiftController.TickPhysics(StepSeconds);
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
