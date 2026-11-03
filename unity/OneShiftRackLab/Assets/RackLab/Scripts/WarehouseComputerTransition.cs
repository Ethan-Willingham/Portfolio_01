using System;
using UnityEngine;

namespace OneShift.RackLab
{
    [DefaultExecutionOrder(500)]
    public sealed class WarehouseComputerTransition : MonoBehaviour
    {
        public bool Active { get; private set; }
        public bool Returning { get; private set; }
        public float Progress { get; private set; }
        RackWalkController walking;
        BrowserLifecycle browser;
        Camera view;
        Vector3 savedLocalPosition, fromPosition, closePosition;
        Quaternion savedLocalRotation, fromRotation, closeRotation;
        float savedFov, fromFov;
        bool skipFirstFrame;
        Action completed;

        public void Enter(RackWalkController player, BrowserLifecycle owner, Action onComplete)
        {
            if (Active || player == null || player.eyes == null) return;
            walking = player; browser = owner; view = player.eyes;
            savedLocalPosition = view.transform.localPosition;
            savedLocalRotation = view.transform.localRotation;
            savedFov = view.fieldOfView;
            closePosition = new Vector3(9.8f, 1.22f, -8.26f);
            closeRotation = Quaternion.LookRotation(Vector3.back, Vector3.up);
            walking.CameraTransitionActive = true;
            Begin(false, onComplete);
        }

        public void Exit(Action onComplete)
        {
            if (view == null) { onComplete?.Invoke(); return; }
            Begin(true, onComplete);
        }

        void Begin(bool returning, Action onComplete)
        {
            Returning = returning; Progress = 0; Active = true; completed = onComplete;
            ResetPresentationClock();
            fromPosition = view.transform.position; fromRotation = view.transform.rotation; fromFov = view.fieldOfView;
        }

        public void ResetPresentationClock() { skipFirstFrame = true; }

        void LateUpdate() { Tick(Time.unscaledDeltaTime, browser != null && browser.PresentationActive); }

        public void Tick(float unscaledSeconds, bool presentationActive)
        {
            if (!Active || view == null) return;
            if (!presentationActive) { ResetPresentationClock(); return; }
            // WebGL's first resumed frame includes the time spent in the paused
            // desktop. Discard it so closing the computer still shows the move.
            if (skipFirstFrame) { skipFirstFrame = false; return; }
            if (unscaledSeconds <= 0 || float.IsNaN(unscaledSeconds) || float.IsInfinity(unscaledSeconds)) return;
            Progress = Mathf.Min(1, Progress + Mathf.Min(unscaledSeconds, .05f) / (Returning ? .55f : .75f));
            float t = Progress * Progress * (3 - 2 * Progress);
            Vector3 targetPosition = Returning ? view.transform.parent.TransformPoint(savedLocalPosition) : closePosition;
            Quaternion targetRotation = Returning ? view.transform.parent.rotation * savedLocalRotation : closeRotation;
            view.transform.SetPositionAndRotation(Vector3.Lerp(fromPosition, targetPosition, t), Quaternion.Slerp(fromRotation, targetRotation, t));
            view.fieldOfView = Mathf.Lerp(fromFov, Returning ? savedFov : 32, t);
            if (Progress < 1) return;
            Active = false;
            if (Returning)
            {
                view.transform.localPosition = savedLocalPosition;
                view.transform.localRotation = savedLocalRotation;
                view.fieldOfView = savedFov;
                walking.CameraTransitionActive = false;
            }
            var callback = completed; completed = null; callback?.Invoke();
        }
    }
}
