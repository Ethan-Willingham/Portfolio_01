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
    // Actual prefab contacts in disposable physics scenes. Initial placement is
    // the only time this harness positions a truck or pallet directly.
    public static class ForkliftHandlingValidation
    {
        const float Dt = .005f;
        const string Root = "Assets/RackLab/";
        const string ReportPath = Root + "Reports/forklift-handling-validation.json";
        static readonly string[] Pallets = {
            "Pallet_01_Fresh_Pine", "Pallet_02_Working_Wear",
            "Pallet_03_Split_Battered", "Pallet_04_Repaired"
        };
        static readonly string[] Cargo = { "Cargo_Light80", "Cargo_Working800", "Cargo_Heavy3500", "Cargo_Offset800" };

        [Serializable]
        public sealed class Report
        {
            public string generatedUtc, unityVersion;
            public string method = "Isolated PhysX at the production 0.005 second timestep. Saved forklift, pallet, cargo and rack prefabs. Pickup, carrying and release use actual contacts; no load parenting, attached carrying joints or pose writes after initial placement.";
            public bool passed;
            public List<ForkliftDrivingValidation.Check> checks = new List<ForkliftDrivingValidation.Check>();
        }

        [MenuItem("One Shift/Validate forklift handling")]
        public static void MenuValidate() { Debug.Log(ValidateAndSave()); }
        public static string Validate() { return JsonUtility.ToJson(Run(), true); }
        public static string ValidateAndSave()
        {
            string json = Validate();
            Directory.CreateDirectory(Path.GetDirectoryName(ReportPath));
            File.WriteAllText(ReportPath, json + "\n");
            AssetDatabase.ImportAsset(ReportPath);
            return json;
        }

        [MenuItem("One Shift/Validate simple forklift assist")]
        public static void MenuValidateAssist() { Debug.Log(ValidateAssistAndSave()); }

        public static string ValidateMouseLiftAndSave()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode || Mathf.Abs(Time.fixedDeltaTime - Dt) > .000001f)
                throw new InvalidOperationException("Stop Play and use the production physics step before mouse-control validation.");
            var report = new Report { generatedUtc = DateTime.UtcNow.ToString("O"), unityVersion = Application.unityVersion };
            RunCheck(report, "held stationary mouse cannot drive or lift", "Holding X without mouse movement leaves the truck and forks stationary; release and a long interrupted frame send no valve command.", (rig, check) =>
            {
                rig.Step(3); float height = rig.ForkTop; Vector3 position = rig.Body.position;
                MouseFrames(rig, true, 0, 60, 2);
                float rise = check.Measure("stationary held-X fork movement", Mathf.Abs(rig.ForkTop-height), "m");
                float travel = check.Measure("stationary held-X truck movement", Vector3.Distance(position, rig.Body.position), "m");
                float released = check.Measure("released X with moving mouse valve", ForkliftMouseLift.Valve(false, 4, 1f/60), "input");
                float interrupted = check.Measure("long interrupted frame valve", ForkliftMouseLift.Valve(true, 4, .5f), "input");
                check.passed = rise < .015f && travel < .02f && released == 0 && interrupted == 0;
            });
            foreach (int rate in new[] { 30, 60, 120 })
            {
                int frames = rate;
                RunCheck(report, "direct mouse lift at " + frames + " frames per second", "The same mouse speed raises and lowers through the existing hydraulics at this render cadence. A stationary mouse closes the valve and no driving intent is generated.", (rig, check) =>
                {
                    rig.Step(3); float initial = rig.ForkTop; Vector3 start = rig.Body.position;
                    MouseFrames(rig, true, 24, frames, 2);
                    MouseFrames(rig, true, 0, frames, 1);
                    float raised = rig.ForkTop;
                    MouseFrames(rig, true, 0, frames, 1);
                    float heldDrift = check.Measure("height drift with held stationary mouse", Mathf.Abs(rig.ForkTop-raised), "m");
                    MouseFrames(rig, true, -24, frames, 1);
                    MouseFrames(rig, false, 24, frames, 1);
                    float rise = check.Measure("physical rise from upward mouse movement", raised-initial, "m");
                    float lower = check.Measure("physical lowering from downward mouse movement", raised-rig.ForkTop, "m");
                    float travel = check.Measure("truck movement without WASD", Vector3.Distance(start, rig.Body.position), "m");
                    check.passed = rise > .45f && rise < .7f && lower > .20f && lower < .4f && heldDrift < .025f && travel < .04f && rig.Lift.LiftInput == 0;
                });
            }
            RunCheck(report, "mouse-controlled working-load pickup and setdown", "After direct physical pocket insertion, mouse movement lifts and lowers an independent working load. Stopping the mouse holds it; normal driving carries it through contact.", (rig, check) =>
            {
                rig.Step(3); var load = rig.LoadAhead(Cargo[1]); rig.Step(2);
                EnterFromOutside(rig, load, check); float bottom = BoardBounds(load).min.y;
                MouseFrames(rig, true, 24, 60, 2); MouseFrames(rig, true, 0, 60, 1);
                float rise = check.Measure("working load mouse lift", BoardBounds(load).min.y-bottom, "m");
                rig.DriveDistance(-1, 1);
                MouseFrames(rig, true, -40, 60, 3); MouseFrames(rig, false, 0, 60, 1);
                Vector3 resting = load.position; rig.DriveDistance(-1, 1.3f); rig.Step(1);
                float drift = check.Measure("setdown drift after fork withdrawal", Vector3.Distance(resting, load.position), "m");
                check.passed = rise > .4f && BoardBounds(load).min.y < .03f && drift < .08f;
            });
            RunCheck(report, "mouse control retains overload force limit", "Upward mouse movement cannot bypass the finite hydraulic force when lifting a 3500 kg independent package.", (rig, check) =>
            {
                rig.Step(3); var load = rig.LoadAhead(Cargo[2]); rig.Step(2);
                EnterFromOutside(rig, load, check); float bottom = BoardBounds(load).min.y;
                MouseFrames(rig, true, 40, 60, 5);
                float rise = check.Measure("heavy load rise under mouse command", BoardBounds(load).min.y-bottom, "m");
                float pressure = check.Measure("bounded hydraulic pressure", rig.Lift.HydraulicPressure, "fraction");
                check.passed = rise < .06f && pressure > .9f && rig.Lift.maximumLiftForce < load.mass * Physics.gravity.magnitude;
                rig.Lift.ClearInput();
            });
            report.passed = report.checks.All(check => check.passed);
            string json = JsonUtility.ToJson(report, true);
            const string path = Root + "Reports/forklift-mouse-lift-validation.json";
            File.WriteAllText(path, json + "\n"); AssetDatabase.ImportAsset(path);
            return json;
        }

        static void MouseFrames(Rig rig, bool held, float axisUnitsPerSecond, int rate, float duration)
        {
            float frame = 1f / rate, accumulator = 0;
            for (int i = 0; i < Mathf.RoundToInt(duration*rate); i++)
            {
                rig.Lift.SetInput(ForkliftMouseLift.Valve(held, axisUnitsPerSecond*frame, frame), 0);
                accumulator += frame;
                while (accumulator >= Dt) { rig.Step(Dt); accumulator -= Dt; }
            }
        }

        public static string ValidateAssistAndSave()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode || Mathf.Abs(Time.fixedDeltaTime - Dt) > .000001f)
                throw new InvalidOperationException("Stop Play and use the production physics step before assist validation.");
            var report = new Report { generatedUtc = DateTime.UtcNow.ToString("O"), unityVersion = Application.unityVersion };
            RunCheck(report, "held assist pickup transport setdown", "Holding the guide enters real pockets, lifts independent working cargo and sets it on the floor before full withdrawal.", AssistCycle);
            RunCheck(report, "guide corrects a modest approach offset", "A slightly offset forklift lines up through wheel steering before its fork blades enter the pockets.", AssistOffset);
            foreach (int rate in new[] { 30, 60 })
            {
                int frames = rate;
                RunCheck(report, "guide pickup at " + frames + " rendered frames per second", "Guide decisions arrive at browser frame cadence while the jointed truck and independent cargo retain the production physics step.", (rig, check) => AssistFrameCadence(rig, check, frames));
            }
            RunCheck(report, "guide retrieves from middle rack", "The guide finds the actual elevated pocket and lifts independently supported cargo clear of a rack deck.", AssistRack);
            RunCheck(report, "guide rejects distant and side approaches", "No guide starts on remote stock or through a pallet's shallow side notches.", AssistBounds);
            RunCheck(report, "guide stops at obstruction", "An obstacle between forks and pocket stops wheel intent without moving the target through the obstacle.", AssistObstacle);
            RunCheck(report, "guide respects overhead clearance", "An upward sweep of the actual load and carriage refuses a lift beneath a low obstruction.", AssistHeadroom);
            RunCheck(report, "guide release clears intent", "Releasing the held guide brakes the truck and clears hydraulic commands; no future frame continues the approach.", AssistRelease);
            RunCheck(report, "guide preserves overload limit", "Assisted pickup retains the hydraulic force limit of the independent 3500 kg package.", AssistOverload);
            RunCheck(report, "guide sets down a manually lifted load", "A working load picked up with direct steering and hydraulic controls is recognized through contact on both forks and can be set down by the guide.", AssistManualLoad);
            RunCheck(report, "guide recognizes an interrupted pickup", "Releasing the guide after a load lifts clear preserves independent cargo and the next hold offers physical setdown.", AssistInterruptedLoad);
            RunCheck(report, "guide can repick after manual setdown", "A cached carried package manually lowered onto its support is offered as a pickup on the next guide press.", AssistRepick);
            report.passed = report.checks.All(check => check.passed);
            string json = JsonUtility.ToJson(report, true);
            const string path = Root + "Reports/forklift-assist-validation.json";
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path, json + "\n");
            AssetDatabase.ImportAsset(path);
            return json;
        }

        public static string ValidateReceivingAssistAndSave(bool flushPlateInPreview = false)
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode || Mathf.Abs(Time.fixedDeltaTime - Dt) > .000001f)
                throw new InvalidOperationException("Stop Play and use the production physics step before receiving validation.");
            var report = new Report { generatedUtc = DateTime.UtcNow.ToString("O"), unityVersion = Application.unityVersion };
            report.method += " Actual installed warehouse static colliders and receiving-start clone, opened doors, independent delivery cargo, 30 Hz guide input.";
            if (flushPlateInPreview) report.method += " Preview-only plate correction: top at warehouse floor y=0.";
            RunCheck(report, "actual receiving dock pickup transport setdown", "The guide drives over the actual dock plate into the first delivery pallet, lifts through contact, reverses into the warehouse and releases it on the floor.",
                (rig, check) => ReceivingAssist(rig, check, flushPlateInPreview));
            RunCheck(report, "deepest original trailer pallet pickup", "After the first three pallets are unloaded, the compact forklift enters the original full-scale trailer and retrieves the deepest package beneath its roof.",
                (rig, check) => ReceivingAssist(rig, check, flushPlateInPreview, 3));
            report.passed = report.checks.All(check => check.passed);
            string json = JsonUtility.ToJson(report, true);
            const string path = Root + "Reports/forklift-receiving-assist-validation.json";
            File.WriteAllText(path, json + "\n"); AssetDatabase.ImportAsset(path);
            return json;
        }

        static void ReceivingAssist(Rig rig, ForkliftDrivingValidation.Check check, bool flushPlate, int index = 0)
        {
            var receiving = rig.ReceivingStart(flushPlate);
            var load = receiving.cargo[index].GetComponent<Rigidbody>();
            if (index > 0)
                for (int i = 0; i < index; i++)
                {
                    // These remain independent stock, already unloaded before
                    // the deep-trailer cycle begins; no cargo is deleted.
                    receiving.cargo[i].Body.position = new Vector3(-8, .02f, i * 2);
                }
            rig.InitialTruck(new Vector3(0, .15f, 9.6f));
            rig.Step(3);
            if (index > 0) rig.DriveToZ(load.position.z - 4.75f);
            float initialBottom = BoardBounds(load).min.y;
            float initialZ = load.position.z;
            var guide = Guide(rig, load);
            float accumulator = 0;
            for (int frame = 0; frame < 30 * 28 && guide.IsRunning; frame++)
            {
                guide.Tick(1f / 30);
                accumulator += 1f / 30;
                while (accumulator >= Dt) { rig.Step(Dt); accumulator -= Dt; }
            }
            check.Measure("bridge collision top", receiving.dockPlate.GetComponent<BoxCollider>().bounds.max.y, "m");
            check.Measure("pallet movement before pickup completes", load.position.z - initialZ, "m");
            float rise = check.Measure("actual delivery pallet lift", BoardBounds(load).min.y - initialBottom, "m");
            check.Measure("forklift pitch after dock entry", rig.Body.transform.eulerAngles.x, "degrees");
            check.Measure("inner mast collision top after pickup", rig.Lift.innerMastBody.GetComponentsInChildren<Collider>().Max(c => c.bounds.max.y), "m");
            if (guide.CurrentStage != ForkliftLoadAssist.Stage.Complete || !guide.Carrying)
                throw new InvalidOperationException(guide.Status + " " + guide.DebugState);
            guide.Cancel();
            rig.DriveDistance(-1, index == 0 ? 5f : load.position.z - 9.35f);
            float unloadingZ = check.Measure("cargo position after reversing into warehouse", load.position.z, "m");
            if (!guide.Begin(load.GetComponent<PalletCargo>())) throw new InvalidOperationException(guide.Status);
            RunGuide(rig, guide);
            bool setDown = guide.CurrentStage == ForkliftLoadAssist.Stage.Complete;
            guide.Cancel();
            Vector3 resting = load.position;
            rig.DriveDistance(-1, 1.3f); rig.Step(1);
            float drift = check.Measure("delivery pallet setdown drift after withdrawal", Vector3.Distance(resting, load.position), "m");
            check.passed = rise > .08f && unloadingZ < 11.5f && setDown && drift < .08f && BoardBounds(load).min.y < .03f;
            if (!check.passed) check.error = guide.Status;
        }

        static ForkliftLoadAssist Guide(Rig rig, Rigidbody load)
        {
            var guide = new ForkliftLoadAssist(rig.Drive, rig.Lift);
            if (!guide.Begin(load.GetComponent<PalletCargo>())) throw new InvalidOperationException(guide.Status);
            return guide;
        }

        static void RunGuide(Rig rig, ForkliftLoadAssist guide, float limit = 28)
        {
            for (int step = 0; step < limit / Dt && guide.IsRunning; step++)
            { guide.Tick(Dt); rig.Step(Dt); }
        }

        static void AssistCycle(Rig rig, ForkliftDrivingValidation.Check check)
        {
            rig.Step(3);
            var load = rig.LoadAhead(Cargo[1]);
            rig.Step(2);
            float initial = BoardBounds(load).min.y;
            var guide = Guide(rig, load);
            RunGuide(rig, guide);
            float rise = check.Measure("physical guided load rise", BoardBounds(load).min.y - initial, "m");
            bool picked = guide.CurrentStage == ForkliftLoadAssist.Stage.Complete && guide.Carrying;
            guide.Cancel();
            Vector3 start = load.position;
            rig.DriveDistance(-1, 1);
            float travel = check.Measure("independent guided load transport", Vector3.Distance(start, load.position), "m");
            bool lowering = guide.Begin();
            RunGuide(rig, guide);
            bool setdown = guide.CurrentStage == ForkliftLoadAssist.Stage.Complete;
            guide.Cancel();
            Vector3 placed = load.position;
            rig.DriveDistance(-1, 1.3f);
            rig.Step(1);
            float drift = check.Measure("setdown movement during withdrawal", Vector3.Distance(placed, load.position), "m");
            check.Measure("setdown bottom", BoardBounds(load).min.y, "m");
            check.passed = picked && rise > .14f && travel > .8f && lowering && setdown && drift < .08f && BoardBounds(load).min.y < .03f;
            if (!check.passed) check.error = guide.Status;
        }

        static void AssistOffset(Rig rig, ForkliftDrivingValidation.Check check)
        {
            rig.Step(3);
            var load = rig.Load(Cargo[1], new Vector3(.12f, .04f, rig.ForkBounds.max.z + 1.55f));
            rig.Step(2);
            var guide = Guide(rig, load);
            RunGuide(rig, guide);
            check.Measure("pallet bottom after offset guide", BoardBounds(load).min.y, "m");
            check.Measure("wheel steering correction distance", rig.Body.position.x, "m");
            check.passed = guide.CurrentStage == ForkliftLoadAssist.Stage.Complete && guide.Carrying && BoardBounds(load).min.y > .14f;
            if (!check.passed) check.error = guide.Status;
        }

        static void AssistRack(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var rack = rig.EmptyRack(new Vector3(0, 0, 8));
            var slot = rack.GetComponentsInChildren<PalletRackBay>().OrderBy(bay => bay.transform.position.x).First().palletPositions[2];
            rig.InitialTruck(new Vector3(slot.position.x, .15f, 4));
            var load = rig.Load(Cargo[1], slot.position + Vector3.up * .025f);
            rig.Step(3);
            var guide = Guide(rig, load);
            RunGuide(rig, guide);
            float rise = check.Measure("guide rack clearance", BoardBounds(load).min.y - slot.position.y, "m");
            bool picked = guide.CurrentStage == ForkliftLoadAssist.Stage.Complete;
            if (!picked) throw new InvalidOperationException("Rack pickup stopped in " + guide.CurrentStage + ": " + guide.Status + " Obstruction: " + guide.ObstructionName + " " + guide.DebugState);
            guide.Cancel();
            rig.DriveDistance(-1, 1.4f);
            bool lowering = guide.Begin();
            RunGuide(rig, guide);
            check.Measure("retrieved load bottom after lowering", BoardBounds(load).min.y, "m");
            check.passed = picked && rise > .08f && lowering && guide.CurrentStage == ForkliftLoadAssist.Stage.Complete && BoardBounds(load).min.y < .035f;
            if (!check.passed) check.error = guide.Status;
        }

        static void AssistFrameCadence(Rig rig, ForkliftDrivingValidation.Check check, int rate)
        {
            rig.Step(2);
            var load = rig.LoadAhead(Cargo[1]); rig.Step(1);
            var guide = Guide(rig, load);
            float accumulator = 0;
            for (int frame = 0; frame < rate * 28 && guide.IsRunning; frame++)
            {
                guide.Tick(1f / rate);
                accumulator += 1f / rate;
                while (accumulator >= Dt) { rig.Step(Dt); accumulator -= Dt; }
            }
            check.Measure("rendered control rate", rate, "Hz");
            check.Measure("physical load bottom", BoardBounds(load).min.y, "m");
            check.passed = guide.CurrentStage == ForkliftLoadAssist.Stage.Complete && guide.Carrying && BoardBounds(load).min.y > .14f;
            if (!check.passed) check.error = guide.Status;
        }

        static void AssistBounds(Rig rig, ForkliftDrivingValidation.Check check)
        {
            rig.Step(2);
            var far = rig.Load(Cargo[1], new Vector3(0, .04f, 10));
            var side = rig.Load(Cargo[0], new Vector3(0, .04f, rig.ForkBounds.max.z + 1));
            side.rotation = Quaternion.Euler(0, 90, 0);
            Physics.SyncTransforms(); rig.Step(1);
            var guide = new ForkliftLoadAssist(rig.Drive, rig.Lift);
            bool farRejected = !guide.Begin(far.GetComponent<PalletCargo>());
            bool sideRejected = !guide.Begin(side.GetComponent<PalletCargo>());
            check.Measure("far target rejected", farRejected ? 1 : 0, "boolean");
            check.Measure("side target rejected", sideRejected ? 1 : 0, "boolean");
            check.passed = farRejected && sideRejected && !guide.IsRunning;
        }

        static void AssistObstacle(Rig rig, ForkliftDrivingValidation.Check check)
        {
            rig.Step(2);
            var load = rig.LoadAhead(Cargo[1]);
            var wall = new GameObject("Guide path obstruction");
            SceneManager.MoveGameObjectToScene(wall, rig.Vehicle.scene);
            wall.transform.position = new Vector3(0, .6f, rig.ForkBounds.max.z + .2f);
            wall.AddComponent<BoxCollider>().size = new Vector3(2, 1.2f, .08f);
            Physics.SyncTransforms(); rig.Step(1);
            Vector3 start = load.position, truck = rig.Body.position;
            var guide = Guide(rig, load);
            RunGuide(rig, guide);
            float shift = check.Measure("blocked pallet displacement", Vector3.Distance(start, load.position), "m");
            float truckShift = check.Measure("blocked truck displacement", Vector3.Distance(truck, rig.Body.position), "m");
            check.passed = !guide.IsRunning && guide.CurrentStage != ForkliftLoadAssist.Stage.Complete && shift < .015f && truckShift < .04f && Mathf.Abs(rig.Drive.ThrottleInput) < .001f;
        }

        static void AssistRelease(Rig rig, ForkliftDrivingValidation.Check check)
        {
            rig.Step(2);
            var load = rig.LoadAhead(Cargo[1]); rig.Step(1);
            var guide = Guide(rig, load);
            RunGuide(rig, guide, .9f);
            guide.Cancel();
            rig.Step(.5f);
            Vector3 stopped = rig.Body.position;
            float height = rig.Lift.LiftTravelMeters;
            RunGuide(rig, guide, 1);
            rig.Step(1);
            float travel = check.Measure("released guide travel", Vector3.Distance(stopped, rig.Body.position), "m");
            float liftTravel = check.Measure("released guide hydraulic travel", Mathf.Abs(rig.Lift.LiftTravelMeters - height), "m");
            check.passed = !guide.IsRunning && travel < .035f && liftTravel < .025f && rig.Drive.ThrottleInput == 0 && rig.Lift.LiftInput == 0 && rig.Lift.TiltInput == 0;
        }

        static void AssistHeadroom(Rig rig, ForkliftDrivingValidation.Check check)
        {
            rig.Step(2);
            var load = rig.LoadAhead(Cargo[1]); rig.Step(1);
            var beam = new GameObject("Low overhead obstruction");
            SceneManager.MoveGameObjectToScene(beam, rig.Vehicle.scene);
            beam.transform.position = load.position + new Vector3(0, 1.62f, 0);
            beam.AddComponent<BoxCollider>().size = new Vector3(1.2f, .1f, 1.3f);
            Physics.SyncTransforms();
            float bottom = BoardBounds(load).min.y;
            var guide = Guide(rig, load);
            RunGuide(rig, guide);
            float rise = check.Measure("load rise beneath low beam", BoardBounds(load).min.y - bottom, "m");
            check.passed = !guide.IsRunning && guide.CurrentStage != ForkliftLoadAssist.Stage.Complete && guide.Status.Contains("room above") && rise < .025f;
            if (!check.passed) check.error = guide.Status;
        }

        static void AssistOverload(Rig rig, ForkliftDrivingValidation.Check check)
        {
            rig.Step(2);
            var load = rig.LoadAhead(Cargo[2]); rig.Step(1);
            float bottom = BoardBounds(load).min.y;
            var guide = Guide(rig, load);
            RunGuide(rig, guide);
            float rise = check.Measure("overload rise with guide", BoardBounds(load).min.y - bottom, "m");
            check.passed = !guide.IsRunning && guide.CurrentStage != ForkliftLoadAssist.Stage.Complete && rise < .05f && load.mass > 3000;
        }

        static void AssistManualLoad(Rig rig, ForkliftDrivingValidation.Check check)
        {
            rig.Step(2);
            var load = rig.LoadAhead(Cargo[1]); rig.Step(1);
            EnterFromOutside(rig, load, check);
            rig.RaiseLoadBottom(load, .25f);
            var guide = new ForkliftLoadAssist(rig.Drive, rig.Lift);
            bool recognized = guide.Begin(load.GetComponent<PalletCargo>()) && guide.CurrentStage == ForkliftLoadAssist.Stage.Lower;
            RunGuide(rig, guide);
            check.Measure("manual load setdown bottom", BoardBounds(load).min.y, "m");
            check.passed = recognized && guide.CurrentStage == ForkliftLoadAssist.Stage.Complete && BoardBounds(load).min.y < .03f;
            if (!check.passed) check.error = guide.Status;
        }

        static void AssistInterruptedLoad(Rig rig, ForkliftDrivingValidation.Check check)
        {
            rig.Step(2);
            var load = rig.LoadAhead(Cargo[1]); rig.Step(1);
            var guide = Guide(rig, load);
            for (int step = 0; step < 28 / Dt && guide.IsRunning && BoardBounds(load).min.y < .11f; step++)
            { guide.Tick(Dt); rig.Step(Dt); }
            guide.Cancel(); rig.Step(.5f);
            bool recognized = guide.Begin(load.GetComponent<PalletCargo>()) && guide.CurrentStage == ForkliftLoadAssist.Stage.Lower;
            RunGuide(rig, guide);
            check.Measure("interrupted load setdown bottom", BoardBounds(load).min.y, "m");
            check.passed = recognized && guide.CurrentStage == ForkliftLoadAssist.Stage.Complete && BoardBounds(load).min.y < .03f;
            if (!check.passed) check.error = guide.Status;
        }

        static void AssistRepick(Rig rig, ForkliftDrivingValidation.Check check)
        {
            rig.Step(2);
            var load = rig.LoadAhead(Cargo[1]); rig.Step(1);
            var guide = Guide(rig, load); RunGuide(rig, guide); guide.Cancel();
            rig.SetForkTop(rig.PocketForkTopOffset(load)); rig.Step(1);
            float bottom = BoardBounds(load).min.y;
            bool pickup = guide.Begin(load.GetComponent<PalletCargo>()) && guide.CurrentStage == ForkliftLoadAssist.Stage.Level;
            RunGuide(rig, guide);
            float rise = check.Measure("repick rise after manual setdown", BoardBounds(load).min.y-bottom, "m");
            check.passed = pickup && guide.CurrentStage == ForkliftLoadAssist.Stage.Complete && rise > .15f;
            if (!check.passed) check.error = guide.Status;
        }

        [MenuItem("One Shift/Validate loaded forklift tilt")]
        public static void MenuValidateLoadedTilt() { Debug.Log(ValidateLoadedTiltAndSave()); }

        public static string ValidateLoadedTiltAndSave()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode || Mathf.Abs(Time.fixedDeltaTime - Dt) > .000001f)
                throw new InvalidOperationException("Stop Play and use the production 0.005 second timestep for loaded tilt validation.");
            var report = new Report { generatedUtc = DateTime.UtcNow.ToString("O"), unityVersion = Application.unityVersion };
            RunCheck(report, "loaded backward and forward mast tilt",
                "An 800 kg independent package follows both commanded mast directions to their physical limits, remains supported by fork contact and stays at least 30 mm clear of the floor.", LoadedTilt);
            report.passed = report.checks.All(check => check.passed);
            string json = JsonUtility.ToJson(report, true);
            const string path = Root + "Reports/forklift-loaded-tilt-validation.json";
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path, json + "\n");
            AssetDatabase.ImportAsset(path);
            return json;
        }

        public static Report Run()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                throw new InvalidOperationException("Stop Play before isolated handling validation.");
            if (Mathf.Abs(Time.fixedDeltaTime - Dt) > .000001f)
                throw new InvalidOperationException("Handling validation requires the production 0.005 second timestep.");
            var report = new Report { generatedUtc = DateTime.UtcNow.ToString("O"), unityVersion = Application.unityVersion };
            RunCheck(report, "measured pallet and rack geometry", "Every pallet has independent dynamic collision, open front fork pockets and actual placement anchors at floor and both raised rack levels.", Geometry);
            RunCheck(report, "physical full lift travel", "Finite hydraulic actuation raises the actual forks above the highest measured rack pocket, retaining clearance for a 100 mm pickup.", FullTravel);
            RunCheck(report, "compact mast retains guide and cylinder engagement", "The lowered visual and physical mast fit the original trailer; at full hydraulic travel both guide stages remain engaged, chain anchors stay below the sheaves and the polished rods retain barrel overlap.", CompactGeometry);
            for (int i = 0; i < Pallets.Length; ++i)
            {
                int variant = i;
                RunCheck(report, Pallets[i] + " floor pickup transport release", "Drive in from outside the pallet, lift through fork contact, reverse with the independent load, lower and withdraw without carrying the released pallet.", (rig, check) => FloorCycle(rig, check, Pallets[variant]));
                RunCheck(report, Pallets[i] + " floor rack placement retrieval", "Place within the actual floor rack slot, fully withdraw, then re-enter and retrieve through the existing rack geometry.", (rig, check) => RackCycle(rig, check, variant, 0));
                RunCheck(report, Pallets[i] + " upper rack placement retrieval", "Pick up from the floor, place on the actual upper rack deck, withdraw, then re-enter and retrieve the independently resting pallet.", (rig, check) => RackCycle(rig, check, variant, 2));
            }
            RunCheck(report, "middle rack placement retrieval", "The working-wear pallet can also be placed and retrieved on the actual middle deck, preserving clearance beneath the upper beam.", (rig, check) => RackCycle(rig, check, 1, 1));
            for (int i = 0; i < 2; ++i)
            {
                int cargo = i;
                RunCheck(report, Cargo[i] + " physical handling", "The saved light or working load can be lifted, transported and released by contact with the forks.", (rig, check) => FloorCycle(rig, check, Cargo[cargo]));
            }
            RunCheck(report, "working cargo upper rack placement retrieval", "The actual 800 kg working package reaches the highest deck, rests independently after fork withdrawal, and can be retrieved and lowered.", (rig, check) => RackCycle(rig, check, 0, 2, Cargo[1]));
            RunCheck(report, "overload respects hydraulic force", "The saved heavy load remains near its support while a full raise command reaches the finite pressure limit, rather than moving at the normal lift rate.", Overload);
            RunCheck(report, "off center load changes physical response", "Moving the working load's centre of mass toward one edge changes measured pallet tilt, slip or wheel load distribution relative to its centered control.", OffCenter);
            RunCheck(report, "pause clears held hydraulic input", "Deactivation clears lift and tilt commands immediately; reactivation without fresh input cannot resume their motion.", ClearsInput);
            report.passed = report.checks.All(check => check.passed);
            return report;
        }

        static void RunCheck(Report report, string name, string expectation, Action<Rig, ForkliftDrivingValidation.Check> action)
        {
            var check = new ForkliftDrivingValidation.Check { name = name, expectation = expectation };
            report.checks.Add(check);
            try { using (var rig = new Rig()) action(rig, check); }
            catch (Exception error) { check.error = error.ToString(); check.passed = false; }
        }

        static void Geometry(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var rack = rig.EmptyRack(new Vector3(0, 0, 10));
            var slots = rack.GetComponentsInChildren<PalletRackBay>().SelectMany(bay => bay.palletPositions).ToArray();
            check.Measure("actual rack slot count", slots.Length, "count");
            check.Measure("lowest rack anchor", slots.Min(slot => slot.position.y), "m");
            check.Measure("highest rack anchor", slots.Max(slot => slot.position.y), "m");
            check.Measure("highest deck collider top", rack.GetComponentsInChildren<BoxCollider>().Where(c => c.name == "Wire deck").Max(c => c.bounds.max.y), "m");
            bool passed = slots.Length == 18 && slots.Max(slot => slot.position.y) > 3.65f;
            var warehouse = SceneManager.GetActiveScene();
            var installedEntries = warehouse.GetRootGameObjects().SelectMany(root => root.GetComponentsInChildren<Transform>(true))
                .Where(node => node.gameObject.activeInHierarchy && node.name == "Left fork entry").ToArray();
            int dynamicEntries = installedEntries.Count(entry =>
            {
                var body = entry.GetComponentInParent<Rigidbody>();
                return body != null && !body.isKinematic && body.useGravity && body.constraints == RigidbodyConstraints.None;
            });
            check.Measure("installed warehouse pallets", installedEntries.Length, "count");
            check.Measure("installed pallets with independent dynamic bodies", dynamicEntries, "count");
            var receiving = Object.FindFirstObjectByType<WarehouseReceiving>();
            int expectedPallets = receiving != null ? receiving.cargo.Length : 22;
            passed &= installedEntries.Length >= expectedPallets && dynamicEntries == installedEntries.Length;
            for (int i = 0; i < Pallets.Length; ++i)
            {
                var load = rig.Load(Pallets[i], new Vector3(-8 + i * 2, .04f, 0));
                Bounds bounds = BoardBounds(load);
                var entry = Pocket(load);
                check.Measure(Pallets[i] + " physical mass", load.mass, "kg");
                check.Measure(Pallets[i] + " board width", bounds.size.x, "m");
                check.Measure(Pallets[i] + " board depth", bounds.size.z, "m");
                check.Measure(Pallets[i] + " front pocket height", entry.y - entry.x, "m");
                check.Measure(Pallets[i] + " physical board collider count", Boards(load).Length, "count");
                passed &= bounds.size.x > 1f && bounds.size.x < 1.03f && bounds.size.z > 1.20f && bounds.size.z < 1.23f &&
                    entry.y - entry.x > .08f && load.mass > 0 && !load.isKinematic && load.useGravity;
            }
            check.passed = passed;
        }

        static void FullTravel(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var rack = rig.EmptyRack(new Vector3(0, 0, 10));
            float highestSlot = rack.GetComponentsInChildren<PalletRackBay>().SelectMany(bay => bay.palletPositions).Max(slot => slot.position.y);
            var pallet = rig.Load(Pallets[0], new Vector3(-8, .04f, 0));
            rig.Step(3f);
            float pocketTop = Pocket(pallet).y - BoardBounds(pallet).min.y;
            float before = rig.ForkTop;
            rig.Lift.SetInput(1f, 0f);
            rig.Step(20f);
            rig.Lift.SetInput(0f, 0f);
            rig.Step(1f);
            float actual = check.Measure("actual maximum fork top", rig.ForkTop, "m");
            check.Measure("fork rise under hydraulic force", actual - before, "m");
            check.Measure("highest actual rack anchor", highestSlot, "m");
            float required = check.Measure("fork top required for upper pickup with 100 mm clearance", highestSlot + pocketTop + .10f, "m");
            check.Measure("measured lift travel", rig.Lift.LiftTravelMeters, "m");
            check.Measure("maximum hydraulic force", rig.Lift.maximumLiftForce, "N");
            check.passed = actual >= required && actual - before > 3.6f && rig.Lift.maximumLiftForce > 0 && !rig.Drive.IsOverturned;
        }

        static void CompactGeometry(Rig rig, ForkliftDrivingValidation.Check check)
        {
            rig.Step(3);
            var nodes = rig.Vehicle.GetComponentsInChildren<Transform>();
            var outer = rig.Lift.mastBody.GetComponentsInChildren<Collider>().Where(c => c.name == "Outer mast rail").ToArray();
            var inner = rig.Lift.innerMastBody.GetComponentsInChildren<Collider>().Where(c => c.name == "Inner mast rail").ToArray();
            var rollers = nodes.Where(n => n.name.StartsWith("CarriageRoller_", StringComparison.Ordinal) && n.GetComponent<MeshFilter>() == null).ToArray();
            var rods = rig.Lift.innerMastBody.GetComponentsInChildren<Renderer>().Where(r => r.name == "Full stroke polished lift piston").ToArray();
            float restCollision = check.Measure("collapsed mast collision top", rig.Lift.innerMastBody.GetComponentsInChildren<Collider>().Max(c => c.bounds.max.y), "m");
            float restVisual = check.Measure("collapsed mast visual top", rig.Lift.innerMastBody.GetComponentsInChildren<Renderer>().Where(r => r.enabled).Max(r => r.bounds.max.y), "m");
            float restRodBottom = check.Measure("collapsed piston bottom above ground", rods.Min(r => r.bounds.min.y), "m");
            float restGuide = check.Measure("lowered carriage guide edge above inner rail foot", rollers.Min(n => n.position.y) - .056f - inner.Max(c => c.bounds.min.y), "m");
            rig.Lift.SetInput(1, 0); rig.Step(20); rig.Lift.SetInput(0, 0); rig.Step(1);
            float railOverlap = check.Measure("fully extended mast rail overlap", outer.Min(c => c.bounds.max.y) - inner.Max(c => c.bounds.min.y), "m");
            float upperGuide = check.Measure("fully extended carriage guide edge below rail top", inner.Min(c => c.bounds.max.y) - rollers.Max(n => n.position.y) - .056f, "m");
            float lowerStageGuide = check.Measure("inner lower guide edge below outer rail top", outer.Min(c => c.bounds.max.y) - nodes.Where(n => n.name.StartsWith("InnerGuide_", StringComparison.Ordinal) && n.name.EndsWith("_Lower", StringComparison.Ordinal)).Max(n => n.position.y) - .121f, "m");
            float fixedGuide = check.Measure("fixed upper guide edge above inner rail foot", nodes.Where(n => n.name.StartsWith("OuterGuide_", StringComparison.Ordinal) && n.name.EndsWith("_Upper", StringComparison.Ordinal)).Min(n => n.position.y) - .056f - inner.Max(c => c.bounds.min.y), "m");
            float chainReturn = check.Measure("fully extended sheave above carriage chain anchor", Enumerable.Range(0, 2).Min(i => rig.Lift.chainSheaves[i].position.y - rig.Lift.carriageChainAnchors[i].position.y), "m");
            // Measure from the retained barrel pivot, including its original
            // offset below the mast hinge and the derived vertical scale.
            float glandTop = nodes.Where(n => n.name.StartsWith("LiftCylinder_", StringComparison.Ordinal) && n.name.EndsWith("_Barrel", StringComparison.Ordinal)).Min(n => n.position.y) + 1.74f * 1.20f;
            float rodOverlap = check.Measure("fully extended polished piston barrel overlap", glandTop - rods.Max(r => r.bounds.min.y), "m");
            check.passed = restCollision < 2.54f && restVisual < 2.54f && restRodBottom > .03f && restGuide > .015f &&
                railOverlap > .4f && upperGuide > .012f && lowerStageGuide > .01f && fixedGuide > .01f && chainReturn > .08f && rodOverlap > .20f;
        }

        static void FloorCycle(Rig rig, ForkliftDrivingValidation.Check check, string prefab)
        {
            rig.Step(3f);
            var load = rig.LoadAhead(prefab);
            rig.Step(2f);
            float initialBottom = BoardBounds(load).min.y;
            float initialX = load.position.x;
            EnterFromOutside(rig, load, check);
            rig.RaiseLoadBottom(load, initialBottom + .30f);
            rig.Step(1f);
            float rise = check.Measure("load rise after contact lift", BoardBounds(load).min.y - initialBottom, "m");
            float separation = check.Measure("nearest fork to board surface separation while lifted", rig.ForkSeparation(load), "m");
            Vector3 truckStart = rig.Body.position, loadStart = load.position;
            rig.DriveDistance(-1f, 1.0f);
            float truckTravel = Vector3.ProjectOnPlane(rig.Body.position - truckStart, Vector3.up).magnitude;
            float loadTravel = Vector3.ProjectOnPlane(load.position - loadStart, Vector3.up).magnitude;
            check.Measure("truck reverse transport", truckTravel, "m");
            check.Measure("independent pallet reverse transport", loadTravel, "m");
            rig.SetForkTop(initialBottom + rig.PocketForkTopOffset(load));
            rig.Step(2f);
            float loweredBottom = check.Measure("load bottom after lowering", BoardBounds(load).min.y, "m");
            Vector3 released = load.position;
            rig.DriveDistance(-1f, 1.35f);
            rig.Step(2f);
            float releaseDrift = check.Measure("released pallet movement while forks withdraw", Vector3.ProjectOnPlane(load.position - released, Vector3.up).magnitude, "m");
            check.Measure("final pallet speed", load.linearVelocity.magnitude, "m/s");
            check.Measure("final lateral placement change", Mathf.Abs(load.position.x - initialX), "m");
            check.Measure("load mass", load.mass, "kg");
            check.passed = rise > .20f && separation < .015f && truckTravel > .8f && loadTravel > .75f &&
                Mathf.Abs(truckTravel - loadTravel) < .20f && loweredBottom < .03f && releaseDrift < .10f && load.linearVelocity.magnitude < .10f;
        }

        static void RackCycle(Rig rig, ForkliftDrivingValidation.Check check, int variant, int level, string prefab = null)
        {
            var rack = rig.EmptyRack(new Vector3(0, 0, 8));
            var bays = rack.GetComponentsInChildren<PalletRackBay>().OrderBy(bay => bay.transform.position.x).ToArray();
            var slot = bays[variant % bays.Length].palletPositions[level * 2 + variant % 2];
            rig.InitialTruck(new Vector3(slot.position.x, .15f, 0));
            rig.Step(3f);
            var load = rig.LoadAhead(prefab ?? Pallets[variant]);
            rig.Step(2f);
            EnterFromOutside(rig, load, check);
            rig.RaiseLoadBottom(load, .30f);
            rig.RaiseLoadBottom(load, slot.position.y + .10f);
            Vector3 carriedOffset = load.position - rig.Body.position;
            rig.DriveToZ(slot.position.z - carriedOffset.z);
            rig.SetForkTop(slot.position.y + rig.PocketForkTopOffset(load));
            rig.Step(2f);
            Vector3 placed = load.position;
            float bottom = check.Measure("pallet bottom on rack support", BoardBounds(load).min.y, "m");
            check.Measure("actual rack slot height", slot.position.y, "m");
            float horizontalError = check.Measure("rack placement horizontal error", Vector3.ProjectOnPlane(load.position - slot.position, Vector3.up).magnitude, "m");
            rig.DriveDistance(-1f, 1.35f);
            rig.Step(2f);
            float releasedDrift = check.Measure("rack pallet movement after complete fork withdrawal", Vector3.Distance(load.position, placed), "m");
            float releasedSpeed = check.Measure("rack pallet resting speed", load.linearVelocity.magnitude, "m/s");
            EnterFromOutside(rig, load, check, "rack retrieval ");
            float retrievalBottom = BoardBounds(load).min.y;
            rig.RaiseLoadBottom(load, retrievalBottom + .12f);
            float retrievedRise = check.Measure("rack pickup actual pallet rise", BoardBounds(load).min.y - retrievalBottom, "m");
            Vector3 retrievalStart = load.position;
            rig.DriveDistance(-1f, 1.4f);
            float retrievedDistance = check.Measure("pallet retrieved clear of rack", Vector3.ProjectOnPlane(load.position - retrievalStart, Vector3.up).magnitude, "m");
            rig.SetForkTop(rig.PocketForkTopOffset(load));
            rig.Step(2f);
            float finalBottom = check.Measure("retrieved pallet bottom after lowering to floor", BoardBounds(load).min.y, "m");
            check.passed = Mathf.Abs(bottom - slot.position.y) < .03f && horizontalError < .08f && releasedDrift < .08f &&
                releasedSpeed < .08f && retrievedRise > .08f && retrievedDistance > 1.1f && finalBottom < .04f;
        }

        static void Overload(Rig rig, ForkliftDrivingValidation.Check check)
        {
            rig.Step(3f);
            var load = rig.LoadAhead(Cargo[2]);
            rig.Step(2f);
            EnterFromOutside(rig, load, check);
            float bottom = BoardBounds(load).min.y, travel = rig.Lift.LiftTravelMeters;
            float maxPressure = 0f, maxBottom = bottom;
            int stalledSamples = 0;
            rig.Lift.SetInput(1f, 0f);
            rig.Step(6f, () =>
            {
                maxPressure = Mathf.Max(maxPressure, rig.Lift.HydraulicPressure);
                maxBottom = Mathf.Max(maxBottom, BoardBounds(load).min.y);
                if (rig.Lift.IsStalled) stalledSamples++;
            });
            rig.Lift.SetInput(0f, 0f);
            check.Measure("heavy load mass", load.mass, "kg");
            check.Measure("heavy load weight", load.mass * Physics.gravity.magnitude, "N");
            check.Measure("finite carriage lift force", rig.Lift.maximumLiftForce, "N");
            check.Measure("maximum heavy load rise", maxBottom - bottom, "m");
            check.Measure("carriage travel with overload", rig.Lift.LiftTravelMeters - travel, "m");
            check.Measure("peak hydraulic pressure fraction", maxPressure, "fraction");
            check.Measure("time stalled at full raise input", stalledSamples * Dt, "s");
            check.passed = load.mass * Physics.gravity.magnitude > rig.Lift.maximumLiftForce * 1.5f &&
                maxBottom - bottom < .08f && maxPressure > .90f && stalledSamples * Dt > 1f;
        }

        static void LoadedTilt(Rig rig, ForkliftDrivingValidation.Check check)
        {
            rig.Step(3f);
            var load = rig.LoadAhead(Cargo[1]);
            rig.Step(2f);
            EnterFromOutside(rig, load, check);
            rig.RaiseLoadBottom(load, .30f);
            rig.Step(1f);
            check.Measure("actual load mass", load.mass, "kg");
            check.Measure("initial lifted load bottom", BoardBounds(load).min.y, "m");
            float minimumClearance = BoardBounds(load).min.y;
            Action sample = () => minimumClearance = Mathf.Min(minimumClearance, BoardBounds(load).min.y);

            rig.Lift.SetInput(0f, -1f);
            rig.Step(3f, sample);
            rig.Lift.SetInput(0f, 0f);
            rig.Step(1f, sample);
            float backward = check.Measure("backward mast angle relative to chassis", rig.Lift.TiltDegrees, "degrees");
            float backwardGap = check.Measure("backward tilt nearest fork-board separation", rig.ForkSeparation(load), "m");
            float backwardBottom = check.Measure("backward tilt load bottom", BoardBounds(load).min.y, "m");
            check.Measure("backward tilt load world angle", Vector3.Angle(load.rotation * Vector3.up, Vector3.up), "degrees");

            rig.Lift.SetInput(0f, 1f);
            rig.Step(4f, sample);
            rig.Lift.SetInput(0f, 0f);
            rig.Step(1f, sample);
            float forward = check.Measure("forward mast angle relative to chassis", rig.Lift.TiltDegrees, "degrees");
            float forwardGap = check.Measure("forward tilt nearest fork-board separation", rig.ForkSeparation(load), "m");
            float forwardBottom = check.Measure("forward tilt load bottom", BoardBounds(load).min.y, "m");
            check.Measure("forward tilt load world angle", Vector3.Angle(load.rotation * Vector3.up, Vector3.up), "degrees");
            // Forward tilt lowers the far edge along an arc. Require real floor
            // clearance, rather than preserving an arbitrary fraction of lift height.
            check.Measure("required floor clearance", .03f, "m");
            check.Measure("minimum floor clearance throughout both tilts", minimumClearance, "m");
            check.passed = Mathf.Abs(backward + rig.Lift.backwardTiltLimit) < 1f &&
                Mathf.Abs(forward - rig.Lift.forwardTiltLimit) < 1f && backwardGap < .015f && forwardGap < .015f &&
                minimumClearance > .03f && !rig.Drive.IsOverturned;
        }

        static void OffCenter(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var centered = MeasureOffsetResponse(rig, Cargo[1]);
            Vector3 offset;
            using (var comparison = new Rig()) offset = MeasureOffsetResponse(comparison, Cargo[3]);
            check.Measure("centered load maximum tilt", centered.x, "degrees");
            check.Measure("offset load maximum tilt", offset.x, "degrees");
            check.Measure("centered load lateral slip", centered.y, "m");
            check.Measure("offset load lateral slip", offset.y, "m");
            check.Measure("centered mean signed front wheel load imbalance", centered.z, "fraction");
            check.Measure("offset mean signed front wheel load imbalance", offset.z, "fraction");
            check.passed = offset.x > centered.x + 2f || offset.y > centered.y + .08f || Mathf.Abs(offset.z - centered.z) > .05f;
        }

        static Vector3 MeasureOffsetResponse(Rig rig, string prefab)
        {
            rig.Step(3f);
            var load = rig.LoadAhead(prefab);
            rig.Step(2f);
            EnterFromOutside(rig, load, new ForkliftDrivingValidation.Check());
            float initialX = rig.Body.transform.InverseTransformPoint(load.worldCenterOfMass).x;
            float maxTilt = 0f, maxSlip = 0f, imbalanceTotal = 0f;
            int imbalanceSamples = 0;
            rig.Lift.SetInput(1f, 0f);
            rig.Step(4f, () =>
            {
                maxTilt = Mathf.Max(maxTilt, Vector3.Angle(load.rotation * Vector3.up, Vector3.up));
                maxSlip = Mathf.Max(maxSlip, Mathf.Abs(rig.Body.transform.InverseTransformPoint(load.worldCenterOfMass).x - initialX));
                if (rig.Drive.wheels[0].GetGroundHit(out WheelHit left) && rig.Drive.wheels[1].GetGroundHit(out WheelHit right))
                {
                    imbalanceTotal += (right.force - left.force) / Mathf.Max(1f, Mathf.Abs(left.force) + Mathf.Abs(right.force));
                    imbalanceSamples++;
                }
            });
            rig.Lift.SetInput(0f, 0f);
            return new Vector3(maxTilt, maxSlip, imbalanceSamples > 0 ? imbalanceTotal / imbalanceSamples : 0f);
        }

        static void ClearsInput(Rig rig, ForkliftDrivingValidation.Check check)
        {
            rig.Step(3f);
            rig.Lift.SetInput(1f, .5f);
            rig.Step(.5f);
            float before = check.Measure("lift command before pause", rig.Lift.LiftInput, "input");
            rig.Lift.SetBrowserActive(false);
            float cleared = Mathf.Abs(rig.Lift.LiftInput) + Mathf.Abs(rig.Lift.TiltInput);
            // The browser stops physics during pause. Do not introduce an
            // artificial interval of gravity with an inactive controller.
            rig.Lift.SetBrowserActive(true);
            float pauseTravel = rig.Lift.LiftTravelMeters;
            // A finite hydraulic hold may finish a small pre-pause correction.
            // After that settles, a stale held command must not keep raising.
            rig.Step(.5f);
            check.Measure("initial hydraulic settling after resume", rig.Lift.LiftTravelMeters - pauseTravel, "m");
            float startTravel = rig.Lift.LiftTravelMeters, startTilt = rig.Lift.TiltDegrees;
            rig.Step(1f);
            check.Measure("combined hydraulic commands immediately inactive", cleared, "input");
            check.Measure("combined hydraulic commands after resume", Mathf.Abs(rig.Lift.LiftInput) + Mathf.Abs(rig.Lift.TiltInput), "input");
            float rise = check.Measure("lift travel after resume without fresh command", rig.Lift.LiftTravelMeters - startTravel, "m");
            float tilt = check.Measure("tilt change after resume without fresh command", Mathf.Abs(rig.Lift.TiltDegrees - startTilt), "degrees");
            check.passed = before > .5f && cleared < .001f && Mathf.Abs(rig.Lift.LiftInput) + Mathf.Abs(rig.Lift.TiltInput) < .001f && Mathf.Abs(rise) < .03f && tilt < 1f;
        }

        static void EnterFromOutside(Rig rig, Rigidbody load, ForkliftDrivingValidation.Check check, string prefix = "")
        {
            Bounds bounds = BoardBounds(load);
            float outside = bounds.min.z - rig.ForkBounds.max.z;
            check.Measure(prefix + "initial gap from fork tips to pallet", outside, "m");
            if (outside < .05f) throw new InvalidOperationException("Entry must begin with the actual fork tips outside the pallet.");
            Vector3 start = load.position;
            float targetTop = bounds.min.y + rig.PocketForkTopOffset(load);
            rig.SetForkTop(targetTop);
            check.Measure(prefix + "actual fork top at entry", rig.ForkTop, "m");
            check.Measure(prefix + "actual pocket lower surface", Pocket(load).x, "m");
            check.Measure(prefix + "actual pocket upper surface", Pocket(load).y, "m");
            if (rig.ForkTop >= Pocket(load).y - .003f || rig.ForkBounds.min.y <= Pocket(load).x + .003f)
                throw new InvalidOperationException("The actual fork heel does not fit vertically inside the measured floor pocket.");
            float heelFromBody = rig.ForkBounds.min.z - rig.Body.position.z;
            // The vertical fork upright ends at the blade heel. Stop that
            // plane outside the pallet front rather than driving it into the
            // front board. The remaining insertion is still over one metre.
            rig.DriveToZ(bounds.min.z - heelFromBody - .025f);
            float push = check.Measure(prefix + "pallet displacement before lift", Vector3.ProjectOnPlane(load.position - start, Vector3.up).magnitude, "m");
            check.Measure(prefix + "actual tine penetration beyond pallet front", rig.ForkBounds.max.z - BoardBounds(load).min.z, "m");
            if (push > .08f) throw new InvalidOperationException("Fork entry pushed the pallet instead of passing through its pockets.");
        }

        static Collider[] Boards(Rigidbody load)
        {
            return load.GetComponentsInChildren<Collider>().Where(c => c.enabled && !c.isTrigger &&
                (c.name == "Top board" || c.name == "Bottom board" || c.name.StartsWith("Stringer", StringComparison.Ordinal) || c.name == "Notch shoulder")).ToArray();
        }

        static Bounds BoardBounds(Rigidbody load)
        {
            var boards = Boards(load);
            if (boards.Length == 0) throw new InvalidOperationException("No actual pallet board colliders on " + load.name);
            Bounds bounds = boards[0].bounds;
            foreach (var board in boards.Skip(1)) bounds.Encapsulate(board.bounds);
            return bounds;
        }

        static Vector2 Pocket(Rigidbody load)
        {
            var boards = Boards(load);
            return new Vector2(boards.Where(c => c.name == "Bottom board").Max(c => c.bounds.max.y),
                boards.Where(c => c.name == "Top board").Min(c => c.bounds.min.y));
        }

        sealed class Rig : IDisposable
        {
            readonly Scene scene;
            readonly PhysicsScene physics;
            readonly List<Rigidbody> loads = new List<Rigidbody>();
            readonly Dictionary<Rigidbody, Transform> loadParents = new Dictionary<Rigidbody, Transform>();
            public readonly GameObject Vehicle;
            public readonly ForkliftDriveController Drive;
            public readonly ForkliftLiftController Lift;
            public readonly Collider[] Forks;
            public Rigidbody Body => Drive.body;
            public float ForkTop => Forks.Max(fork => fork.bounds.max.y);
            public Bounds ForkBounds
            {
                get { Bounds bounds = Forks[0].bounds; foreach (var fork in Forks.Skip(1)) bounds.Encapsulate(fork.bounds); return bounds; }
            }

            public Rig()
            {
                scene = EditorSceneManager.NewPreviewScene();
                physics = scene.GetPhysicsScene();
                try
                {
                    if (!physics.IsValid() || physics == Physics.defaultPhysicsScene) throw new InvalidOperationException("An isolated physics scene is required.");
                    var ground = EditorUtility.CreateGameObjectWithHideFlags("Handling validation floor", HideFlags.HideAndDontSave);
                    SceneManager.MoveGameObjectToScene(ground, scene);
                    ground.transform.position = new Vector3(0, -.5f, 20);
                    ground.AddComponent<BoxCollider>().size = new Vector3(100, 1, 100);
                    Vehicle = Prefab("WarehouseForklift");
                    Drive = Vehicle.GetComponent<ForkliftDriveController>();
                    Lift = Vehicle.GetComponent<ForkliftLiftController>();
                    if (Drive == null || Lift == null) throw new InvalidOperationException("The saved truck requires drive and physical lift controllers.");
                    Vehicle.transform.position = new Vector3(0, .15f, 0);
                    Drive.Initialize(); Lift.Initialize();
                    Drive.SetBrowserActive(true); Lift.SetBrowserActive(true);
                    Drive.SetOccupied(true); Lift.SetOccupied(true);
                    Drive.ClearDriverInput(); Lift.ClearInput();
                    Forks = Vehicle.GetComponentsInChildren<MeshCollider>().Where(c => c.name == "Solid tapered fork blade").Cast<Collider>().ToArray();
                    if (Forks.Length != 2) throw new InvalidOperationException("Expected two physical tapered fork blades.");
                    foreach (var camera in Vehicle.GetComponentsInChildren<Camera>()) camera.enabled = false;
                    Physics.SyncTransforms();
                }
                catch { Dispose(); throw; }
            }

            GameObject Prefab(string name)
            {
                string path = Root + "Prefabs/" + name + ".prefab";
                var asset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (asset == null) throw new InvalidOperationException("Missing saved physical asset: " + path);
                return (GameObject)PrefabUtility.InstantiatePrefab(asset, scene);
            }

            public void InitialTruck(Vector3 position)
            {
                // Only used before the first simulation step of the rack case.
                Vehicle.transform.position = position;
                Physics.SyncTransforms();
            }

            public Rigidbody Load(string name, Vector3 position)
            {
                var instance = Prefab(name);
                instance.transform.SetPositionAndRotation(position, Quaternion.identity);
                var body = instance.GetComponent<Rigidbody>();
                if (body == null || body.isKinematic || !body.useGravity || body.constraints != RigidbodyConstraints.None)
                    throw new InvalidOperationException("Load must be an independent free dynamic Rigidbody: " + name);
                loads.Add(body); loadParents.Add(body, body.transform.parent);
                Physics.SyncTransforms();
                return body;
            }

            public Rigidbody LoadAhead(string name)
            {
                var load = Load(name, new Vector3(Body.position.x, .04f, ForkBounds.max.z + 2f));
                float halfDepth = BoardBounds(load).size.z * .5f;
                load.position = new Vector3(Body.position.x, .04f, ForkBounds.max.z + .45f + halfDepth);
                Physics.SyncTransforms();
                return load;
            }

            public GameObject EmptyRack(Vector3 position)
            {
                var rack = Prefab("ConnectedPalletRackRow");
                rack.transform.position = position;
                // Empty only the preview copy's example cargo. The production
                // frames, beams, decks and every placement anchor remain intact.
                foreach (var bay in rack.GetComponentsInChildren<PalletRackBay>())
                {
                    foreach (var load in bay.exampleLoads ?? Array.Empty<GameObject>()) if (load != null) Object.DestroyImmediate(load);
                    bay.exampleLoads = Array.Empty<GameObject>();
                }
                Physics.SyncTransforms();
                return rack;
            }

            public WarehouseReceiving ReceivingStart(bool flushPlate)
            {
                var source = Object.FindFirstObjectByType<WarehouseReceiving>();
                if (source == null) throw new InvalidOperationException("Install the receiving start before testing its actual dock geometry.");
                foreach (var node in scene.GetRootGameObjects())
                    if (node.name == "Handling validation floor") Object.DestroyImmediate(node);
                // Copy real static collision only, not a flattened substitute
                // floor. This retains gaps, apron, thresholds and the real walls.
                foreach (var collider in Object.FindObjectsByType<Collider>(FindObjectsSortMode.None))
                {
                    if (collider.gameObject.scene != source.gameObject.scene || collider.attachedRigidbody != null || collider.isTrigger ||
                        !collider.enabled || collider.transform.IsChildOf(source.transform) || !(collider is BoxCollider || collider is MeshCollider)) continue;
                    var node = new GameObject("Receiving check / " + collider.name);
                    SceneManager.MoveGameObjectToScene(node, scene);
                    node.transform.SetPositionAndRotation(collider.transform.position, collider.transform.rotation);
                    node.transform.localScale = collider.transform.lossyScale;
                    var copy = node.AddComponent(collider.GetType()) as Collider;
                    EditorUtility.CopySerialized(collider, copy);
                }
                var clone = Object.Instantiate(source.gameObject);
                SceneManager.MoveGameObjectToScene(clone, scene);
                foreach (var script in clone.GetComponentsInChildren<MonoBehaviour>()) script.enabled = false;
                foreach (var renderer in clone.GetComponentsInChildren<Renderer>()) renderer.enabled = false;
                var receiving = clone.GetComponent<WarehouseReceiving>();
                receiving.truck.isKinematic = true;
                receiving.truck.position = receiving.dockedPosition;
                receiving.leftDoor.localRotation = receiving.DoorPose(true, 1);
                receiving.rightDoor.localRotation = receiving.DoorPose(false, 1);
                receiving.dockBarrier.gameObject.SetActive(false);
                receiving.dockPlate.SetActive(true);
                if (flushPlate)
                {
                    var local = receiving.dockPlate.transform.localPosition;
                    local.y = -.05f; receiving.dockPlate.transform.localPosition = local;
                }
                foreach (var cargo in receiving.cargo)
                {
                    cargo.ApplyMassProperties();
                    var body = cargo.GetComponent<Rigidbody>();
                    loads.Add(body); loadParents.Add(body, body.transform.parent);
                }
                Physics.SyncTransforms();
                return receiving;
            }

            public void Step(float seconds, Action sample = null)
            {
                int count = Mathf.CeilToInt(seconds / Dt);
                for (int i = 0; i < count; ++i)
                {
                    Drive.TickPhysics(Dt); Lift.TickPhysics(Dt);
                    physics.Simulate(Dt);
                    foreach (var load in loads)
                    {
                        if (load.isKinematic || !load.useGravity || load.transform.parent != loadParents[load] || load.transform.IsChildOf(Vehicle.transform))
                            throw new InvalidOperationException("A load lost its independent dynamic state during handling.");
                        foreach (var joint in load.GetComponentsInChildren<Joint>())
                            if (joint.connectedBody != null && joint.connectedBody.transform.IsChildOf(Vehicle.transform))
                                throw new InvalidOperationException("A carrying joint attached the load to the truck.");
                        if (!Finite(load.position)) throw new InvalidOperationException("Non-finite or runaway load state.");
                    }
                    if (!Finite(Body.position)) throw new InvalidOperationException("Non-finite or runaway truck state.");
                    sample?.Invoke();
                }
            }

            public float PocketForkTopOffset(Rigidbody load)
            {
                Vector2 pocket = Pocket(load);
                float thickness = ForkBounds.size.y;
                return (pocket.x + pocket.y) * .5f + thickness * .5f - BoardBounds(load).min.y;
            }

            public void SetForkTop(float target)
            {
                float neutralDwell = 0f;
                for (int step = 0; step < 600; ++step)
                {
                    float error = target - ForkTop;
                    bool centered = Mathf.Abs(error) < .004f;
                    // Finish transferring weight to the rack before withdrawing.
                    // A first crossing can still carry cylinder and chain motion.
                    Lift.SetInput(centered ? 0f : Mathf.Clamp(error * 6f, -1f, 1f), 0f);
                    Step(.05f);
                    neutralDwell = centered && Mathf.Abs(target - ForkTop) < .004f ? neutralDwell + .05f : 0f;
                    if (neutralDwell >= 1f) break;
                }
                Lift.SetInput(0f, 0f);
                Step(.4f);
                if (neutralDwell < 1f || Mathf.Abs(target - ForkTop) > .015f)
                    throw new InvalidOperationException("Hydraulics could not settle at measured fork-top target " + target + "; actual " + ForkTop + "; neutral dwell " + neutralDwell);
            }

            public void RaiseLoadBottom(Rigidbody load, float target)
            {
                for (int step = 0; step < 600; ++step)
                {
                    float error = target - BoardBounds(load).min.y;
                    if (error < .005f) break;
                    Lift.SetInput(Mathf.Clamp(error * 5f, .15f, 1f), 0f);
                    Step(.05f);
                }
                Lift.SetInput(0f, 0f);
                Step(.4f);
                if (BoardBounds(load).min.y < target - .03f)
                    throw new InvalidOperationException("Load did not rise to " + target + " through physical fork contact; actual " + BoardBounds(load).min.y);
            }

            public void DriveDistance(float direction, float distance) { DriveToZ(Body.position.z + direction * distance); }
            public void DriveToZ(float target)
            {
                float direction = Mathf.Sign(target - Body.position.z);
                for (int step = 0; step < 5000 && direction * (target - Body.position.z) > .010f; ++step)
                {
                    float remaining = direction * (target - Body.position.z);
                    float approachSpeed = Mathf.Clamp(remaining * 1.8f, .06f, .65f);
                    bool brake = direction * Drive.SignedSpeedMps > approachSpeed + .02f;
                    // Physical brake input removes speed before the target;
                    // no body position or velocity is corrected by the test.
                    Drive.SetDriverInput(brake ? 0f : direction * .3f, 0f, brake, false, true);
                    Step(Dt);
                }
                Drive.SetDriverInput(0f, 0f, true, false, false);
                Step(.5f);
                Drive.SetDriverInput(0f, 0f, false, true, false);
                Step(.3f);
                if (Mathf.Abs(target - Body.position.z) > .08f)
                    throw new InvalidOperationException("Physical approach stopped short or overshot target " + target + "; actual " + Body.position.z);
            }

            public float ForkSeparation(Rigidbody load)
            {
                float nearest = float.MaxValue;
                foreach (var board in Boards(load)) foreach (var fork in Forks)
                {
                    Vector3 forkPoint = fork.ClosestPoint(board.bounds.center);
                    Vector3 boardPoint = board.ClosestPoint(forkPoint);
                    forkPoint = fork.ClosestPoint(boardPoint);
                    nearest = Mathf.Min(nearest, Vector3.Distance(boardPoint, forkPoint));
                }
                return nearest;
            }

            static bool Finite(Vector3 position) { return !float.IsNaN(position.sqrMagnitude) && !float.IsInfinity(position.sqrMagnitude) && position.sqrMagnitude < 1e8f; }
            public void Dispose() { if (scene.IsValid() && scene.isLoaded) EditorSceneManager.ClosePreviewScene(scene); }
        }
    }
}
