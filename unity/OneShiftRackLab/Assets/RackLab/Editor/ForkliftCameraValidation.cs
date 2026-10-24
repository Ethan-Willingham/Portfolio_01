using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace OneShift.RackLab
{
    public static class ForkliftCameraValidation
    {
        [MenuItem("One Shift/Validate forklift camera")]
        public static string ValidateAndSave()
        {
            var notes = new System.Text.StringBuilder();
            foreach (int frequency in new[] { 30, 60, 120, 144 })
            {
                float dt = 1f / frequency;
                var rig = new ForkliftCameraRigState();
                float worstRadius = 0, worstAim = 0, maxYawRate = 0, maxSpeed = 0;
                Pose previous = default;
                float previousYaw = 0;
                for (int i = 0; i < frequency * 14; i++)
                {
                    // A tight circle crosses the Euler wrap several times.
                    // Reversing heading later exercises a sharp steering change.
                    float time = i * dt;
                    float yaw = time <= 7 ? time * 65 : 455 - (time - 7) * 65;
                    var heading = Quaternion.Euler(0, yaw, 0);
                    var focus = heading * new Vector3(1.7f, 0, 0) + Vector3.up * .95f;
                    rig.Aim(yaw, 18, dt, i == 0);
                    Pose pose = rig.Place(focus, ForkliftCameraRigState.MaximumDistance, dt, i == 0);
                    worstRadius = Mathf.Max(worstRadius, Mathf.Abs(Vector3.Distance(pose.position, focus) - 5.8f));
                    worstAim = Mathf.Max(worstAim, Vector3.Angle(pose.rotation * Vector3.forward, focus - pose.position));
                    if (i > 0)
                    {
                        maxYawRate = Mathf.Max(maxYawRate, Mathf.Abs(Mathf.DeltaAngle(previousYaw, rig.Yaw)) / dt);
                        maxSpeed = Mathf.Max(maxSpeed, Vector3.Distance(previous.position, pose.position) / dt);
                    }
                    previous = pose;
                    previousYaw = rig.Yaw;
                }
                Require(worstRadius < .00001f && worstAim < .05f && maxYawRate < 65.1f && maxSpeed < 8.8f,
                    "Sharp-turn orbit at " + frequency + " Hz");
                notes.AppendLine("PASS sharp turns at " + frequency + " Hz: radius error " + worstRadius.ToString("G6") +
                    " m, aim error " + worstAim.ToString("G6") + " deg, peak yaw " + maxYawRate.ToString("F3") + " deg/s.");
            }
            var obstacle = new ForkliftCameraRigState();
            obstacle.Aim(0, 18, 1f / 60, true);
            obstacle.Place(Vector3.zero, 5.8f, 1f / 60, true);
            obstacle.Place(Vector3.zero, 1.8f, 1f / 60, false);
            Require(Mathf.Abs(obstacle.Distance - 1.8f) < .0001f, "Obstacle clearance");
            float previousDistance = obstacle.Distance;
            for (int i = 0; i < 180; i++)
            {
                obstacle.Place(Vector3.zero, 5.8f, 1f / 60, false);
                Require(obstacle.Distance >= previousDistance && obstacle.Distance <= 5.8f &&
                    obstacle.Distance - previousDistance < .26f, "Smooth camera return after obstruction");
                previousDistance = obstacle.Distance;
            }
            Require(obstacle.Distance > 5.799f, "Full camera clearance recovery");
            notes.AppendLine("PASS obstacle: immediate inward clearance and monotonic damped return without overshoot.");
            float frozenYaw = obstacle.Yaw;
            float frozenDistance = obstacle.Distance;
            obstacle.Aim(90, 30, 0, false);
            obstacle.Place(Vector3.zero, 5.8f, 0, false);
            Require(obstacle.Yaw == frozenYaw && obstacle.Distance == frozenDistance, "Paused camera state");
            notes.AppendLine("PASS zero simulation time preserves camera state.");
            string report = notes.ToString();
            Directory.CreateDirectory("Assets/RackLab/Reports");
            File.WriteAllText("Assets/RackLab/Reports/forklift-camera-validation.txt", report);
            AssetDatabase.Refresh();
            Debug.Log(report);
            return report;
        }

        static void Require(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException("Forklift camera validation failed: " + message);
        }
    }
}
