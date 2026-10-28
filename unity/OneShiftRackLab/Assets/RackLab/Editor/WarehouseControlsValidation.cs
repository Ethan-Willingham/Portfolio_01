using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace OneShift.RackLab
{
    // Deterministic control checks complement the real PhysX and browser runs.
    // They do not simulate native key events, pointer lock or ground collision.
    public static class WarehouseControlsValidation
    {
        [Serializable]
        public sealed class Report
        {
            public string generatedUtc;
            public string method = "Production hydraulic lever and walking response at 30, 60, 120 and 144 Hz, plus cursor ownership on inactive-driver resume. Native browser pointer lock and physical ground contact require separate verification.";
            public bool passed;
            public List<ForkliftDrivingValidation.Check> checks = new List<ForkliftDrivingValidation.Check>();
        }

        [MenuItem("One Shift/Validate warehouse control response")]
        public static string ValidateAndSave()
        {
            var report = Run();
            string json = JsonUtility.ToJson(report, true);
            const string path = "Assets/RackLab/Reports/warehouse-controls-validation.json";
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path, json + "\n");
            AssetDatabase.ImportAsset(path);
            return json;
        }

        public static Report Run()
        {
            var report = new Report { generatedUtc = DateTime.UtcNow.ToString("O") };
            foreach (int cadence in new[] { 30, 60, 120, 144 })
            {
                int rate = cadence;
                Check(report, "persistent hydraulic lever at " + rate + " Hz", "The same pointer distance selects the same positive and negative speed. A still mouse retains the lever position; centre stops.", check =>
                {
                    var lever = new ForkliftMouseLift();
                    float dt = 1f / rate;
                    for (int i = 0; i < rate; i++) lever.Tick(true, 10f * dt, dt);
                    float positivePosition = check.Measure("positive position", lever.Position, "normalized");
                    float positiveInput = lever.Input;
                    for (int i = 0; i < rate; i++) lever.Tick(true, 0, dt);
                    float retained = check.Measure("valve after stationary mouse", lever.Input, "fraction");
                    for (int i = 0; i < rate; i++) lever.Tick(true, -20f * dt, dt);
                    float negativePosition = check.Measure("negative position", lever.Position, "normalized");
                    float negativeInput = check.Measure("negative valve", lever.Input, "fraction");
                    lever.Tick(true, -lever.Position * ForkliftMouseLift.AxisUnitsToFullTravel, dt);
                    check.passed = Mathf.Abs(positivePosition - .5f) < .0001f && Mathf.Abs(negativePosition + .5f) < .0001f &&
                        positiveInput > .15f && Mathf.Abs(positiveInput - retained) < .0001f && Mathf.Abs(positiveInput + negativeInput) < .0001f && lever.Input == 0;
                });
                Check(report, "walking start and stop at " + rate + " Hz", "Walking reaches 2.8 m/s promptly, then stops within 0.2 seconds and 0.25 m without reversing. Running retains a finite stopping distance.", check =>
                {
                    float dt = 1f / rate;
                    Vector3 velocity = Vector3.zero;
                    float reachesSpeedAt = 0;
                    for (int i = 0; i < rate; i++)
                    {
                        velocity = Walk(velocity, Vector3.forward * 2.8f, true, dt);
                        if (reachesSpeedAt == 0 && velocity.z >= 2.799f) reachesSpeedAt = (i + 1) * dt;
                    }
                    float distance = 0, stopAt = 0;
                    for (int i = 0; i < rate; i++)
                    {
                        velocity = Walk(velocity, Vector3.zero, true, dt);
                        distance += velocity.magnitude * dt;
                        if (stopAt == 0 && velocity == Vector3.zero) stopAt = (i + 1) * dt;
                    }
                    velocity = Vector3.forward * 5.4f;
                    float runDistance = 0;
                    for (int i = 0; i < rate; i++) { velocity = Walk(velocity, Vector3.zero, true, dt); runDistance += velocity.magnitude * dt; }
                    check.Measure("time to walk speed", reachesSpeedAt, "s");
                    check.Measure("walking stopping time", stopAt, "s");
                    check.Measure("walking stopping distance", distance, "m");
                    check.Measure("running stopping distance", runDistance, "m");
                    check.passed = reachesSpeedAt > .1f && reachesSpeedAt <= .2f && stopAt <= .2f &&
                        distance > .08f && distance < .25f && runDistance > .4f && runDistance < .7f && velocity == Vector3.zero;
                });
            }
            Check(report, "hydraulic release and malformed-frame clearing", "Release, long frames and nonfinite pointer input zero both lever and valve. Interrupted holds cannot resume movement until released.", check =>
            {
                bool pass = true;
                foreach (float badDelta in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity })
                {
                    var lever = new ForkliftMouseLift();
                    lever.Tick(true, 20, 1f / 60);
                    pass &= lever.Tick(true, badDelta, 1f / 60) == 0 && lever.Position == 0;
                    pass &= lever.Tick(true, 20, 1f / 60) == 0;
                    lever.Tick(false, 20, 1f / 60);
                    pass &= lever.Tick(true, 0, 1f / 60) == 0 && lever.Held;
                }
                var released = new ForkliftMouseLift();
                released.Tick(true, 20, 1f / 60);
                pass &= released.Tick(false, -20, 1f / 60) == 0 && !released.Held && released.Position == 0;
                released.Tick(true, -20, 1f / 60);
                pass &= released.Tick(true, 0, .5f) == 0 && released.Position == 0;
                pass &= released.Tick(true, 0, 1f / 60) == 0;
                check.passed = pass;
            });
            Check(report, "lever centre dead zone and full travel", "Small centre movements close the valve. Both travel ends reach full hydraulic flow without exceeding it.", check =>
            {
                float center = check.Measure("centre valve", ForkliftMouseLift.Valve(.05f), "fraction");
                float raise = check.Measure("upper limit valve", ForkliftMouseLift.Valve(4), "fraction");
                float lower = check.Measure("lower limit valve", ForkliftMouseLift.Valve(-4), "fraction");
                check.passed = center == 0 && raise == 1 && lower == -1 && ForkliftMouseLift.Valve(-.05f) == 0;
            });
            Check(report, "grounded reversal and air momentum", "Grounded reversal begins promptly, while airborne input cannot erase running momentum in one frame. A zero timestep cannot move velocity.", check =>
            {
                Vector3 grounded = Vector3.forward * 2.8f;
                Vector3 airborne = grounded;
                for (int i = 0; i < 12; i++)
                {
                    grounded = Walk(grounded, Vector3.back * 2.8f, true, 1f / 60);
                    airborne = Walk(airborne, Vector3.back * 2.8f, false, 1f / 60);
                }
                check.Measure("grounded velocity after reversing", grounded.z, "m/s");
                check.Measure("airborne forward momentum", airborne.z, "m/s");
                check.passed = grounded.z < -.7f && airborne.z > 2 && Walk(grounded, Vector3.zero, true, 0) == grounded;
            });
            Check(report, "inactive driver preserves walking cursor ownership", "Browser resume clears the inactive driver's controls without changing the walker's cursor; pausing an actual captured driver still releases it.", check =>
            {
                var originalLock = Cursor.lockState;
                bool originalVisible = Cursor.visible;
                GameObject fixture = null;
                try
                {
                    fixture = new GameObject("Disposable cursor ownership fixture") { hideFlags = HideFlags.HideAndDontSave };
                    fixture.SetActive(false);
                    var driver = fixture.AddComponent<ForkliftPlayerInteraction>();
                    var flags = BindingFlags.Instance | BindingFlags.NonPublic;
                    var captured = typeof(ForkliftPlayerInteraction).GetField("captured", flags);
                    var exitRequested = typeof(ForkliftPlayerInteraction).GetField("exitRequested", flags);
                    var lever = (ForkliftMouseLift)typeof(ForkliftPlayerInteraction).GetField("mouseLift", flags).GetValue(driver);
                    captured.SetValue(driver, false);
                    exitRequested.SetValue(driver, true);
                    lever.Tick(true, 12, 1f / 60);
                    Cursor.visible = false;
                    var walkingLock = Cursor.lockState;
                    driver.SetBrowserActive(true);
                    bool inactivePreserved = Cursor.lockState == walkingLock && !Cursor.visible &&
                        lever.Position == 0 && !(bool)exitRequested.GetValue(driver);
                    captured.SetValue(driver, true);
                    Cursor.visible = false;
                    driver.SetBrowserActive(false);
                    check.passed = inactivePreserved && Cursor.lockState == CursorLockMode.None && Cursor.visible &&
                        !(bool)captured.GetValue(driver) && lever.Position == 0;
                }
                finally
                {
                    if (fixture != null) UnityEngine.Object.DestroyImmediate(fixture);
                    Cursor.lockState = originalLock;
                    Cursor.visible = originalVisible;
                }
            });
            report.passed = report.checks.All(check => check.passed);
            return report;
        }

        static Vector3 Walk(Vector3 current, Vector3 target, bool grounded, float dt)
        {
            return RackWalkController.StepVelocity(current, target, grounded, 18, 24, 3, dt);
        }

        static void Check(Report report, string name, string expectation, Action<ForkliftDrivingValidation.Check> action)
        {
            var check = new ForkliftDrivingValidation.Check { name = name, expectation = expectation };
            report.checks.Add(check);
            try { action(check); }
            catch (Exception error) { check.error = error.ToString(); check.passed = false; }
        }
    }
}
