using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using Object=UnityEngine.Object;

namespace OneShift.RackLab
{
    public static class WarehouseComputerValidation
    {
        [MenuItem("One Shift/Validate computer camera transitions")]
        public static string ValidateAndSave()
        {
            if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play before validation.");
            var lines=new List<string>();
            foreach(int rate in new[]{30,60,120,144})
            {
                var root=new GameObject("Disposable computer transition check"){hideFlags=HideFlags.HideAndDontSave};
                var owner=new GameObject("Disposable browser owner"){hideFlags=HideFlags.HideAndDontSave};
                var view=new GameObject("Disposable computer camera");view.transform.SetParent(root.transform,false);
                try
                {
                    root.AddComponent<CharacterController>();
                    var walking=root.AddComponent<RackWalkController>();
                    walking.eyes=view.AddComponent<Camera>();walking.eyes.enabled=false;
                    root.transform.SetPositionAndRotation(new Vector3(9.8f,.025f,-7.3f),Quaternion.Euler(0,178,0));
                    view.transform.localPosition=new Vector3(0,1.65f,0);view.transform.localRotation=Quaternion.Euler(17,0,0);
                    walking.eyes.fieldOfView=65;
                    Vector3 position=view.transform.position;Quaternion rotation=view.transform.rotation;
                    var bridge=owner.AddComponent<BrowserLifecycle>();
                    var move=owner.AddComponent<WarehouseComputerTransition>();int entered=0,returned=0;
                    move.Enter(walking,bridge,()=>entered++);
                    move.Tick(40,true);
                    Need(move.Progress==0 && Vector3.Distance(view.transform.position,position)<.00001f,"Entering consumed a stale paused delta.");
                    for(int frame=0;frame<rate/3;frame++)move.Tick(1f/rate,true);
                    Need(move.Progress>0 && move.Progress<1 && entered==0,"Entry has no intermediate camera states.");
                    float paused=move.Progress;move.Tick(80,false);move.Tick(80,true);
                    Need(move.Progress==paused,"Focus loss or its first resumed frame advanced the camera.");
                    while(move.Active)move.Tick(1f/rate,true);
                    Need(entered==1 && walking.CameraTransitionActive && Vector3.Distance(view.transform.position,new Vector3(9.8f,1.22f,-8.26f))<.0001f,"Entry endpoint or callback invalid.");
                    move.Exit(()=>returned++);move.Tick(600,true);
                    Need(move.Progress==0 && returned==0,"The first resumed desktop frame skipped zoom-out.");
                    move.Tick(float.NaN,true);move.Tick(float.PositiveInfinity,true);move.Tick(-1,true);
                    Need(move.Progress==0,"Invalid time advanced the animation.");
                    move.Tick(30,true);
                    Need(move.Progress>0 && move.Progress<.1f,"A long active frame exceeded the 50 ms presentation cap.");
                    paused=move.Progress;move.ResetPresentationClock();move.Tick(100,true);
                    Need(move.Progress==paused,"The explicit browser inactivity reset failed.");
                    int returnFrames=0;
                    while(move.Active && returnFrames++<rate*2)move.Tick(1f/rate,true);
                    Need(!move.Active && returned==1 && !walking.CameraTransitionActive && returnFrames>rate*.45f,
                        "Return did not render its complete visible travel.");
                    Need(Vector3.Distance(view.transform.position,position)<.0001f && Quaternion.Angle(view.transform.rotation,rotation)<.01f && Mathf.Abs(walking.eyes.fieldOfView-65)<.001f,"Return did not restore the exact original camera.");
                    move.Tick(100,true);Need(returned==1 && entered==1,"Completion callback repeated.");
                    lines.Add("PASS "+rate+" Hz: entry, paused focus, stale resumed delta, bounded return, original pose/FOV and exactly-once callbacks.");
                }
                finally{Object.DestroyImmediate(owner);Object.DestroyImmediate(root);}
            }
            string report=string.Join("\n",lines)+"\n";
            File.WriteAllText("Assets/RackLab/Reports/warehouse-computer-validation.txt",report);
            return report;
        }
        static void Need(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    }
}
