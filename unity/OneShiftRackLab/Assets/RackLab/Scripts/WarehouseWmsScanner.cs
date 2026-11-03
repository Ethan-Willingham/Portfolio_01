using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace OneShift.RackLab
{
    [Serializable]
    public struct WarehouseWmsScanResult
    {
        public bool success;
        public string code, kind, id, label, message;
        public Vector3 point;
        public float distance;
    }

    // Input belongs to the walking/browser lifecycle. The held trigger aims
    // the device's top imager and decodes each newly acquired physical label.
    [DisallowMultipleComponent]
    public sealed class WarehouseWmsScanner : MonoBehaviour
    {
        public const float MaximumDistance = 4.2f;
        public const float MinimumDistance = .12f;
        public const float MinimumFacingDot = .38f;
        public bool Equipped { get; private set; }
        public bool TriggerHeld { get; private set; }
        public bool AimVisible => aimRenderer != null && aimRenderer.enabled;
        public bool AimHasSurface { get; private set; }
        public Vector3 AimPoint { get; private set; }
        public int ProjectedLineSegments { get; private set; }
        public string FeedbackStatus => Time.unscaledTime < flashUntil ? (feedbackSuccess ? "success" : "error") :
            TriggerHeld && (decodedCode.Length == 0 || candidateCode != decodedCode) ? "scanning" : "ready";
        public string FeedbackMessage => feedbackMessage;
        public Vector3 EmitterPosition => emitter != null ? emitter.position : Vector3.zero;
        public Vector3 EmitterDirection => emitter != null ? emitter.up : Vector3.forward;
        public WarehouseWmsScanResult LastResult { get; private set; }
        public event Action<WarehouseWmsScanResult> Scanned;
        RackWalkController walking;
        PhysicsScene physics;
        readonly RaycastHit[] hits = new RaycastHit[128];
        Transform device, emitter;
        Transform homeScreen;
        const int LineSamples = 17;
        Mesh aimMesh;
        MeshRenderer aimRenderer;
        readonly Vector3[] linePoints = new Vector3[LineSamples], lineNormals = new Vector3[LineSamples];
        readonly bool[] lineHits = new bool[LineSamples];
        readonly Vector3[] lineVertices = new Vector3[(LineSamples - 1) * 4];
        Material bodyMaterial, bumperMaterial, trimMaterial, screenMaterial, glowMaterial, paperMaterial, tileMaterial, laserMaterial, lensMaterial, metalMaterial;
        WarehouseWmsRuntime runtime;
        WarehouseGrabber grabber;
        TextMesh screenHeader, screenTitle, screenBody, screenNotice, screenFooter;
        readonly List<Mesh> deviceMeshes = new List<Mesh>();
        Renderer indicator;
        AudioSource sound;
        AudioClip goodBeep, badBeep;
        float flashUntil, nextScanAt, visibleAmount, nextScreenAt, scanAmount, singleShotUntil, candidateSince, nextAimAt, triggerSince;
        string candidateCode = "", decodedCode = "";
        string feedbackMessage = "", screenFeedback = "";
        WarehouseWmsLabel aimedLabel;
        RaycastHit aimHit;
        bool applicationFocused = true, inspecting, feedbackSuccess, noReadReported;

        bool CanScan => Equipped && !inspecting && walking != null && walking.eyes != null && walking.CanControl &&
            !walking.VehicleMode && applicationFocused && Time.timeScale > 0 && (grabber == null || !grabber.IsHolding);

        public void Bind(RackWalkController owner)
        {
            walking = owner; physics = gameObject.scene.GetPhysicsScene();
            grabber = owner != null ? owner.GetComponent<WarehouseGrabber>() : null;
            foreach(var value in UnityEngine.Object.FindObjectsByType<WarehouseWmsRuntime>(FindObjectsSortMode.None))
                if(value.Walking==owner){runtime=value;break;}
            if (walking != null && walking.eyes != null && device == null) BuildDevice();
        }

        public void SetInspecting(bool value)
        {
            inspecting=value;
            if(!value)return;
            SetTriggerHeld(false);singleShotUntil=0;
            if(device!=null)device.gameObject.SetActive(false);
            HideAim();
        }

        public void SetEquipped(bool value)
        {
            Equipped = value;
            if (!value) { SetTriggerHeld(false);flashUntil=singleShotUntil=0; if (sound != null) sound.Stop(); }
        }

        public void SetTriggerHeld(bool held)
        {
            if(held && !CanScan)held=false;
            if(!held){singleShotUntil=0;HideAim();}
            if(TriggerHeld==held)return;
            TriggerHeld=held;candidateCode=decodedCode="";candidateSince=0;triggerSince=Time.unscaledTime;noReadReported=false;
        }

        void HideAim()
        {
            if(aimRenderer!=null)aimRenderer.enabled=false;
            AimHasSurface=false;aimedLabel=null;ProjectedLineSegments=0;nextAimAt=0;
        }

        public WarehouseWmsScanResult TryScan()
        {
            if (!CanScan)
                return Fail("Return to floor control before scanning.", false);
            if (Time.unscaledTime < nextScanAt)
                return new WarehouseWmsScanResult { success=false,code="",kind="",id="",label="",message="Let the scan trigger reset, then scan again.",point=LastResult.point,distance=LastResult.distance };
            nextScanAt = Time.unscaledTime + .22f;
            var view = walking.eyes.transform;
            // The keyboard alternate remains an immediate single scan. Held
            // acquisition uses the actual exit window and its physical axis.
            var result = TriggerHeld && emitter!=null ? Trace(physics,emitter.position,emitter.up,walking.transform,hits) :
                Trace(physics, view.position, view.forward, walking.transform, hits);
            if(!TriggerHeld)singleShotUntil=Time.unscaledTime+.24f;
            LastResult = result; Feedback(result.success, result.message); Scanned?.Invoke(result); return result;
        }

        WarehouseWmsScanResult Fail(string message, bool feedback)
        {
            LastResult = new WarehouseWmsScanResult { success=false,code="",kind="",id="",label="",message=message };
            if(feedback)Feedback(false,message);return LastResult;
        }

        // Public deterministic ray query for geometry validation. A visible
        // payload is decoded only if its actual barcode face is the first hit.
        public static WarehouseWmsScanResult Trace(PhysicsScene physics,Vector3 origin,Vector3 forward,Transform player,RaycastHit[] buffer)
        {
            var result=new WarehouseWmsScanResult{success=false,code="",kind="",id="",label="",message="Aim at a carton or bin barcode and hold left mouse to scan.",point=origin+forward*MaximumDistance,distance=MaximumDistance};
            if(forward.sqrMagnitude<.5f||buffer==null||buffer.Length==0)return result;
            forward.Normalize();
            if(!FirstSurface(physics,origin,forward,player,buffer,MaximumDistance,out var first))return result;
            result.point=first.point;result.distance=first.distance;
            var target=first.collider.GetComponent<WarehouseWmsLabel>();
            if(target==null){result.message="No readable barcode under the aimer.";return result;}
            if(first.distance<MinimumDistance){result.message="Move the scanner slightly back from the label.";return result;}
            if(Vector3.Dot(target.Normal,-forward)<MinimumFacingDot){result.message="Face the printed side of the label more directly.";return result;}
            if(!WarehouseCode128.TryEncode(target.Code,out var symbols)||!WarehouseCode128.TryDecode(symbols,out string decoded)||decoded!=target.Code)
            {result.message="This label could not be decoded.";return result;}
            result.success=true;result.code=decoded;result.kind=target.Kind;result.id=target.Id;result.label=target.Caption;result.message="Read "+target.Caption+".";return result;
        }

        static bool FirstSurface(PhysicsScene physics,Vector3 origin,Vector3 forward,Transform player,RaycastHit[] buffer,float range,out RaycastHit first)
        {
            int count=physics.Raycast(origin,forward,buffer,range,~0,QueryTriggerInteraction.Collide);
            float nearest=float.PositiveInfinity;first=default;
            for(int i=0;i<count;i++)
            {
                var hit=buffer[i];if(hit.collider==null||(player!=null&&hit.collider.transform.IsChildOf(player)))continue;
                if(hit.collider.isTrigger&&hit.collider.GetComponent<WarehouseWmsLabel>()==null)continue;
                if(hit.distance<nearest){nearest=hit.distance;first=hit;}
            }
            return first.collider!=null;
        }

        public void Feedback(bool success,string message)
        {
            var result=LastResult;result.message=message;LastResult=result;
            feedbackSuccess=success;feedbackMessage=message;flashUntil=Time.unscaledTime+1.25f;
            if(glowMaterial==null)return;
            glowMaterial.color=success?new Color(.40f,.86f,.26f):new Color(1f,.22f,.08f);
            RefreshScreen();
            if(sound!=null&&applicationFocused&&Time.timeScale>0){sound.Stop();sound.clip=success?goodBeep:badBeep;sound.Play();}
        }

        void LateUpdate()
        {
            if(device==null)return;
            if(!CanScan)
            {
                SetTriggerHeld(false);HideAim();singleShotUntil=0;scanAmount=0;
                device.gameObject.SetActive(false);
                if(sound!=null&&sound.isPlaying)sound.Stop();visibleAmount=0;return;
            }
            device.gameObject.SetActive(true);visibleAmount=Mathf.MoveTowards(visibleAmount,1,Time.deltaTime*7);
            bool aiming=TriggerHeld||Time.unscaledTime<singleShotUntil;
            scanAmount=Mathf.MoveTowards(scanAmount,aiming?1:0,Time.deltaTime*6.5f);
            var view=walking.eyes.transform;
            device.localPosition=Vector3.Lerp(new Vector3(.205f,-.078f,.43f),new Vector3(.17f,-.19f,.49f),scanAmount)+Vector3.down*((1-visibleAmount)*.25f);
            var readingPose=view.rotation*Quaternion.Euler(-6,-12,6);
            device.rotation=readingPose;
            if(scanAmount>0)
            {
                Vector3 target=FirstSurface(physics,view.position,view.forward,walking.transform,hits,MaximumDistance,out var viewHit)?viewHit.point:view.position+view.forward*MaximumDistance;
                Vector3 direction=(target-device.position).normalized;
                // Local +Y is the exit window on the top edge, not the display.
                // Tilting this axis toward the label gives the scanner a real
                // wrist motion while retaining a readable carrying pose.
                Vector3 back=Vector3.ProjectOnPlane(-view.up,direction).normalized;
                if(back.sqrMagnitude<.01f)back=view.forward;
                Quaternion scanPose=Quaternion.LookRotation(back,direction);
                device.rotation=Quaternion.Slerp(readingPose,scanPose,scanAmount);
            }
            if(Time.unscaledTime>=nextScreenAt||screenFeedback!=FeedbackStatus){nextScreenAt=Time.unscaledTime+.2f;RefreshScreen();}
            if(indicator!=null)indicator.enabled=FeedbackStatus!="ready";
            if(aiming)
            {
                // The view model has no collider. If its exit window would be
                // behind a wall at very close range, it cannot emit or decode
                // from the far side of that obstruction.
                Vector3 toEmitter=emitter.position-view.position;
                if(FirstSurface(physics,view.position,toEmitter.normalized,walking.transform,hits,Mathf.Max(0,toEmitter.magnitude-.01f),out _))
                {HideAim();candidateCode="";return;}
                AimHasSurface=FirstSurface(physics,emitter.position,emitter.up,walking.transform,hits,MaximumDistance,out aimHit);
                aimedLabel=AimHasSurface?aimHit.collider.GetComponent<WarehouseWmsLabel>():null;
                AimPoint=AimHasSurface?aimHit.point:emitter.position+emitter.up*MaximumDistance;
                if(AimHasSurface)ProjectScanLine(view);
                else{aimRenderer.enabled=false;ProjectedLineSegments=0;nextAimAt=0;}
                if(TriggerHeld)AcquireLabel();
            }
            else HideAim();
        }

        void ProjectScanLine(Transform view)
        {
            if(Time.unscaledTime<nextAimAt)return;
            nextAimAt=Time.unscaledTime+1f/30f;
            // Only light already-hit surfaces. Each sample stops at its first
            // solid hit; disconnected faces never get a ribbon across the air.
            Vector3 across=Vector3.ProjectOnPlane(view.right,aimHit.normal).normalized;
            if(across.sqrMagnitude<.01f){aimRenderer.enabled=false;ProjectedLineSegments=0;return;}
            float halfWidth=Mathf.Clamp(aimHit.distance*.1f,.07f,.23f);
            float step=halfWidth*2/(LineSamples-1),halfHeight=Mathf.Clamp(aimHit.distance*.0012f,.0015f,.003f);
            for(int i=0;i<LineSamples;i++)
            {
                Vector3 target=AimPoint+across*Mathf.Lerp(-halfWidth,halfWidth,(float)i/(LineSamples-1));
                Vector3 ray=target-emitter.position;
                lineHits[i]=FirstSurface(physics,emitter.position,ray.normalized,walking.transform,hits,Mathf.Min(MaximumDistance,ray.magnitude+.035f),out var surface);
                linePoints[i]=surface.point;lineNormals[i]=surface.normal;
            }
            ProjectedLineSegments=0;
            for(int i=0;i<LineSamples-1;i++)
            {
                int at=i*4;
                if(!lineHits[i]||!lineHits[i+1]||Vector3.Dot(lineNormals[i],lineNormals[i+1])<.92f||Vector3.Distance(linePoints[i],linePoints[i+1])>step*2.5f+.008f)
                {for(int j=0;j<4;j++)lineVertices[at+j]=Vector3.zero;continue;}
                Vector3 from=linePoints[i]+lineNormals[i]*.0015f,to=linePoints[i+1]+lineNormals[i+1]*.0015f;
                Vector3 up=Vector3.Cross(lineNormals[i],across).normalized*halfHeight;
                lineVertices[at]=from-up;lineVertices[at+1]=from+up;
                lineVertices[at+2]=to-up;lineVertices[at+3]=to+up;
                ProjectedLineSegments++;
            }
            aimMesh.SetVertices(lineVertices);aimMesh.bounds=new Bounds(AimPoint,Vector3.one*(MaximumDistance*2));aimRenderer.enabled=ProjectedLineSegments>0;
        }

        void AcquireLabel()
        {
            string code=aimedLabel!=null&&aimHit.distance>=MinimumDistance&&Vector3.Dot(aimedLabel.Normal,-emitter.up)>=MinimumFacingDot?aimedLabel.Code:"";
            if(code!=candidateCode){candidateCode=code;candidateSince=Time.unscaledTime;}
            if(code.Length==0)
            {
                // One clear no-read result per empty hold, never failure spam.
                // The same hold may still decode if the player then finds a label.
                if(!noReadReported&&decodedCode.Length==0&&scanAmount>=.98f&&Time.unscaledTime-triggerSince>.9f&&Time.unscaledTime>=nextScanAt)
                {noReadReported=true;if(runtime!=null)runtime.Scan();else TryScan();}
                return;
            }
            if(code==decodedCode||scanAmount<.98f||Time.unscaledTime-candidateSince<.06f||Time.unscaledTime<nextScanAt)return;
            // Holding on the same label never repeats a receipt or task step.
            // Moving onto a different label arms one new decode, without a
            // stream of failure beeps while crossing blank cardboard or walls.
            decodedCode=code;noReadReported=true;
            if(runtime!=null)runtime.Scan();else TryScan();
        }
        void OnApplicationFocus(bool value){applicationFocused=value;if(!value){SetTriggerHeld(false);singleShotUntil=0;HideAim();if(sound!=null)sound.Stop();}}
        void OnApplicationPause(bool value){if(value){SetTriggerHeld(false);singleShotUntil=0;HideAim();}}
        void OnDisable(){SetEquipped(false);if(device!=null)device.gameObject.SetActive(false);}

        void BuildDevice()
        {
            // Original geometry follows the TC22's 165 x 76.3 x 12.5 mm body,
            // top exit window, side scan keys and lower speaker/contact chin.
            // The readable horizontal scan stripe is the game's chosen aimer.
            bodyMaterial=WarehouseCareer.Material("TC22 charcoal housing",new Color(.13f,.145f,.135f));
            bumperMaterial=WarehouseCareer.Material("TC22 edge protection",new Color(.035f,.043f,.038f));
            trimMaterial=WarehouseCareer.Material("TC22 scan key",new Color(.22f,.245f,.23f));
            metalMaterial=WarehouseCareer.Material("TC22 cradle contacts",new Color(.52f,.43f,.26f));
            lensMaterial=WarehouseCareer.Material("TC22 imager optics",new Color(.055f,.008f,.007f),true);
            screenMaterial=WarehouseCareer.Material("TC22 display header",new Color(.10f,.20f,.17f),true);
            paperMaterial=WarehouseCareer.Material("TC22 display paper",new Color(.89f,.85f,.73f),true);
            tileMaterial=WarehouseCareer.Material("TC22 display tiles",new Color(.77f,.76f,.64f),true);
            glowMaterial=WarehouseCareer.Material("TC22 read indicator",new Color(.39f,.72f,.35f),true);
            laserMaterial=WarehouseCareer.Material("Red projected scan stripe",new Color(1f,.025f,.012f),true);
            laserMaterial.SetFloat("_Cull",(float)CullMode.Off);
            device=new GameObject("Zebra TC22 handheld").transform;device.SetParent(walking.eyes.transform,false);device.localScale=Vector3.one*1.52f;
            RoundedPart("Rounded edge frame",Vector3.zero,new Vector3(.0783f,.168f,.0145f),.008f,bumperMaterial);
            RoundedPart("TC22 housing",new Vector3(0,0,-.001f),new Vector3(.0763f,.165f,.0125f),.0075f,bodyMaterial);
            RoundedPart("Replaceable battery back",new Vector3(0,-.013f,.0077f),new Vector3(.062f,.111f,.0028f),.006f,bodyMaterial);
            RoundedPart("Display glass surround",new Vector3(0,.001f,-.0074f),new Vector3(.069f,.139f,.0015f),.005f,bumperMaterial);
            RoundedPart("Six inch live WMS display",new Vector3(0,.001f,-.0084f),new Vector3(.0645f,.132f,.0007f),.0032f,paperMaterial);
            RoundedPart("Screen header",new Vector3(0,.061f,-.0090f),new Vector3(.063f,.011f,.0005f),.002f,screenMaterial);
            var exit=RoundedPart("Top scanner exit window",new Vector3(0,.0838f,0),new Vector3(.032f,.010f,.0012f),.0025f,lensMaterial);exit.localRotation=Quaternion.Euler(90,0,0);
            var aperture=RoundedPart("Imager emitter lens",new Vector3(.006f,.0846f,0),new Vector3(.007f,.005f,.0005f),.002f,bumperMaterial);aperture.localRotation=Quaternion.Euler(90,0,0);
            var windowBar=RoundedPart("Imager receiver lens",new Vector3(-.006f,.0846f,0),new Vector3(.008f,.005f,.0005f),.001f,trimMaterial);windowBar.localRotation=Quaternion.Euler(90,0,0);
            RoundedPart("Left scan key",new Vector3(-.0397f,.021f,0),new Vector3(.0026f,.025f,.009f),.0012f,trimMaterial);
            RoundedPart("Right scan key",new Vector3(.0397f,.021f,0),new Vector3(.0026f,.025f,.009f),.0012f,trimMaterial);
            RoundedPart("Volume rocker",new Vector3(.0393f,.054f,0),new Vector3(.0022f,.022f,.007f),.001f,trimMaterial);
            RoundedPart("Programmable key",new Vector3(-.0393f,.054f,0),new Vector3(.0022f,.013f,.007f),.001f,trimMaterial);
            RoundedPart("Power key",new Vector3(.026f,.0836f,0),new Vector3(.010f,.0017f,.006f),.0008f,trimMaterial);
            RoundedPart("Top earpiece",new Vector3(0,.076f,-.0076f),new Vector3(.021f,.0018f,.0007f),.0008f,bumperMaterial);
            RoundedPart("Front camera",new Vector3(-.027f,.0755f,-.0078f),new Vector3(.0048f,.0048f,.0007f),.0024f,bumperMaterial);
            RoundedPart("Camera lens",new Vector3(-.027f,.0755f,-.0083f),new Vector3(.0025f,.0025f,.0005f),.0012f,screenMaterial);
            RoundedPart("Light sensor",new Vector3(.018f,.0755f,-.0078f),new Vector3(.003f,.002f,.0007f),.001f,bumperMaterial);
            indicator=RoundedPart("Read LED",new Vector3(.026f,.0755f,-.008f),new Vector3(.0017f,.0017f,.0005f),.0008f,glowMaterial).GetComponent<Renderer>();
            for(int i=0;i<5;i++)RoundedPart("Lower speaker slot "+i,new Vector3((i-2)*.0032f,-.075f,-.0079f),new Vector3(.0012f,.0032f,.0005f),.0005f,bumperMaterial);
            var usb=RoundedPart("Bottom USB-C connector",new Vector3(0,-.084f,0),new Vector3(.010f,.004f,.0006f),.0016f,bumperMaterial);usb.localRotation=Quaternion.Euler(-90,0,0);
            for(int i=0;i<4;i++)
            {
                float x=(i<2?-.024f:.014f)+(i%2)*.008f;
                var contact=RoundedPart("Cradle contact "+i,new Vector3(x,-.0838f,0),new Vector3(.004f,.003f,.0005f),.0006f,metalMaterial);contact.localRotation=Quaternion.Euler(-90,0,0);
            }
            screenHeader=ScreenText("Application header","LATCHFORD WMS",new Vector2(.055f,.0055f),new Vector3(0,.061f,-.0101f),new Color(.92f,.88f,.74f));
            screenTitle=ScreenText("Live task title","Floor operations",new Vector2(.058f,.014f),new Vector3(0,.043f,-.0101f),new Color(.015f,.025f,.018f));
            screenBody=ScreenText("Live task instruction","",new Vector2(.058f,.071f),new Vector3(0,-.003f,-.0101f),new Color(.015f,.025f,.018f));
            screenNotice=ScreenText("Live scan response","Ready to scan",new Vector2(.058f,.013f),new Vector3(0,-.048f,-.0101f),new Color(.28f,.37f,.24f));
            screenFooter=ScreenText("Device controls","HOLD LEFT Scan / RIGHT Inspect",new Vector2(.057f,.0045f),new Vector3(0,-.060f,-.0101f),new Color(.27f,.31f,.24f));
            ScreenText("Device identification","ZEBRA",new Vector2(.018f,.0035f),new Vector3(-.023f,-.074f,-.0084f),new Color(.70f,.72f,.67f));
            ScreenText("Model identification","TC22",new Vector2(.014f,.0035f),new Vector3(.024f,-.074f,-.0084f),new Color(.70f,.72f,.67f));
            homeScreen=new GameObject("Live WMS home tiles").transform;homeScreen.SetParent(device,false);
            string[] titles={"RECEIVE","TRANSFER","PICK","SHIP","ITEM LOOKUP"};
            for(int i=0;i<titles.Length;i++)
            {
                float x=i==4?0:(i%2==0?-.016f:.016f),y=i<4?.021f-(i/2)*.029f:-.032f;
                Vector3 size=new Vector3(i==4?.058f:.027f,i==4?.016f:.023f,.0004f);
                RoundedPart(titles[i]+" tile",new Vector3(x,y,-.0092f),size,.002f,tileMaterial,homeScreen);
                ScreenText(titles[i]+" tile label",titles[i],new Vector2(size.x*.88f,.006f),new Vector3(x,y,-.0101f),new Color(.015f,.025f,.018f),homeScreen);
            }
            emitter=new GameObject("SE4710 exit axis").transform;emitter.SetParent(device,false);emitter.localPosition=new Vector3(0,.085f,0);
            // Keep the cached stripe in world space between its bounded 30 Hz
            // ray queries, rather than dragging it with the player's transform.
            var projection=new GameObject("Surface-only horizontal scan stripe");SceneManager.MoveGameObjectToScene(projection,gameObject.scene);
            aimMesh=new Mesh{name="Clipped scan stripe"};aimMesh.MarkDynamic();aimMesh.vertices=lineVertices;
            var indices=new int[(LineSamples-1)*6];
            for(int i=0;i<LineSamples-1;i++){int v=i*4,t=i*6;indices[t]=v;indices[t+1]=v+1;indices[t+2]=v+2;indices[t+3]=v+2;indices[t+4]=v+1;indices[t+5]=v+3;}
            aimMesh.triangles=indices;aimMesh.bounds=new Bounds(Vector3.zero,Vector3.one*(MaximumDistance*2+2));
            projection.AddComponent<MeshFilter>().sharedMesh=aimMesh;aimRenderer=projection.AddComponent<MeshRenderer>();aimRenderer.sharedMaterial=laserMaterial;
            aimRenderer.shadowCastingMode=ShadowCastingMode.Off;aimRenderer.receiveShadows=false;aimRenderer.enabled=false;
            sound=gameObject.AddComponent<AudioSource>();sound.playOnAwake=false;sound.spatialBlend=0;sound.volume=.10f;
            goodBeep=Tone("TC22 decode",1700,2200,.09f);badBeep=Tone("TC22 rejected",280,240,.13f);
            device.gameObject.SetActive(false);
        }
        TextMesh ScreenText(string name,string value,Vector2 area,Vector3 position,Color color,Transform parent=null)
        {
            var text=new GameObject(name).AddComponent<TextMesh>();text.transform.SetParent(parent!=null?parent:device,false);
            WarehouseCareer.UseWarehouseFont(text);text.fontSize=96;text.fontStyle=FontStyle.Bold;text.anchor=TextAnchor.MiddleCenter;text.alignment=TextAlignment.Left;text.color=color;
            text.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;text.GetComponent<Renderer>().receiveShadows=false;
            text.text=value;WarehouseWmsLabel.FitText(text,area,position);return text;
        }
        void WriteScreen(TextMesh text,string value,Vector2 area,Vector3 position)
        {if(text.text==value)return;text.text=value;WarehouseWmsLabel.FitText(text,area,position);}
        void RefreshScreen()
        {
            if(runtime==null)return;
            var work=runtime.Workflow;bool home=work.tile=="home"||work.tile=="none";
            bool ready=runtime.ReadyToConfirm(out var confirmationReason);
            screenFeedback=FeedbackStatus;
            bool resultVisible=screenFeedback=="success"||screenFeedback=="error";
            Color statusColor=screenFeedback=="success"?new Color(.19f,.48f,.20f):screenFeedback=="error"?new Color(.67f,.14f,.07f):screenFeedback=="scanning"?new Color(.67f,.40f,.10f):new Color(.10f,.20f,.17f);
            screenMaterial.color=statusColor;
            glowMaterial.color=screenFeedback=="success"?new Color(.40f,.86f,.26f):screenFeedback=="error"?new Color(1f,.22f,.08f):new Color(1f,.59f,.10f);
            paperMaterial.color=resultVisible?(feedbackSuccess?new Color(.76f,.88f,.65f):new Color(.96f,.73f,.60f)):new Color(.89f,.85f,.73f);
            WriteScreen(screenHeader,screenFeedback=="success"?"SCAN ACCEPTED":screenFeedback=="error"?"SCAN REJECTED":screenFeedback=="scanning"?"SCANNING...":"LATCHFORD WMS",new Vector2(.055f,.0055f),new Vector3(0,.061f,-.0101f));
            if(resultVisible)
            {
                homeScreen.gameObject.SetActive(false);screenBody.gameObject.SetActive(true);
                WriteScreen(screenTitle,feedbackSuccess?"READ OK":"CHECK SCAN",new Vector2(.058f,.014f),new Vector3(0,.043f,-.0101f));
                WriteScreen(screenBody,Wrap(feedbackMessage,23,6),new Vector2(.058f,.071f),new Vector3(0,-.003f,-.0101f));
                screenNotice.color=new Color(.21f,.25f,.16f);
                WriteScreen(screenNotice,Wrap(string.IsNullOrEmpty(LastResult.code)?"No barcode accepted":LastResult.code,27,2),new Vector2(.058f,.013f),new Vector3(0,-.048f,-.0101f));
                WriteScreen(screenFooter,feedbackSuccess?(ready?"ENTER Confirm / RIGHT Inspect":"RIGHT Inspect next step"):"RIGHT Inspect / RELEASE to retry",new Vector2(.057f,.005f),new Vector3(0,-.060f,-.0101f));
                return;
            }
            homeScreen.gameObject.SetActive(home);screenBody.gameObject.SetActive(!home);
            string title=home?"Floor operations":work.title;
            if(!home)
            {
                var body=new StringBuilder();
                if(work.tile=="lookup")title=AppendLookup(body);
                else
                {
                    if(!string.IsNullOrEmpty(work.orderId))
                    {
                        int completed=0,total=0;var purchase=runtime.Ledger.FindPurchase(work.orderId);var sales=runtime.Ledger.FindSales(work.orderId);
                        if(purchase!=null)foreach(var line in purchase.lines){completed+=line.received;total+=line.ordered;}
                        else if(sales!=null)foreach(var line in sales.lines){completed+=work.tile=="ship"?line.loaded:line.picked;total+=line.ordered;}
                        body.Append(work.orderId).Append("  ").Append(completed).Append('/').Append(total).Append(" CTN\n\n");
                    }
                    string instruction=work.step=="depart"?(ready?"Van is clear. Press Enter to ship.":confirmationReason):work.instruction;
                    body.Append(Wrap(instruction,24,5));
                    if(!string.IsNullOrEmpty(work.cartonId))body.Append("\n\n").Append(work.cartonId);
                    if(!string.IsNullOrEmpty(work.sourceBin))body.Append("\nFROM ").Append(work.sourceBin);
                    if(!string.IsNullOrEmpty(work.destinationBin))body.Append("\nTO   ").Append(work.destinationBin);
                }
                WriteScreen(screenBody,body.ToString(),new Vector2(.058f,.071f),new Vector3(0,-.003f,-.0101f));
            }
            WriteScreen(screenTitle,Wrap(title,23,2),new Vector2(.058f,.014f),new Vector3(0,.043f,-.0101f));
            string notice=runtime.Severity=="error"?runtime.Message:runtime.ScanResult.status=="success"&&!string.IsNullOrEmpty(runtime.ScanResult.code)?"READ OK  "+runtime.ScanResult.code:runtime.Message;
            screenNotice.color=runtime.Severity=="error"?new Color(.58f,.16f,.10f):new Color(.24f,.36f,.22f);
            WriteScreen(screenNotice,Wrap(notice,27,2),new Vector2(.058f,.013f),new Vector3(0,-.048f,-.0101f));
            WriteScreen(screenFooter,ready?"ENTER Confirm / RIGHT Inspect":"HOLD LEFT Scan / RIGHT Inspect",new Vector2(.057f,.005f),new Vector3(0,-.060f,-.0101f));
        }
        string AppendLookup(StringBuilder body)
        {
            string code=runtime.ScanResult.code??"";
            if(code.StartsWith("ITEM:"))
            {
                string id=code.Substring(5);var item=runtime.Ledger.FindItem(id);
                if(item!=null){body.Append("Item ").Append(WarehouseWmsVocabulary.ItemCode(id)).Append("\n\nCartons  ").Append(runtime.Ledger.OnHand(id)).Append("\nReady to pick  ").Append(runtime.Ledger.Available(id)).Append("\nReserved  ").Append(runtime.Ledger.Reserved(id));return item.name;}
            }
            else if(code.StartsWith("CARTON:"))
            {
                var carton=runtime.Ledger.FindCarton(code.Substring(7));
                if(carton!=null)
                {
                    var item=runtime.Ledger.FindItem(carton.itemId);
                    var location=runtime.Ledger.FindBin(carton.binId);
                    string status=carton.status==WarehouseWmsLedger.CartonStatus.Expected?"Awaiting receipt":carton.status==WarehouseWmsLedger.CartonStatus.Available?(location!=null&&location.enabled&&location.canPick?"Ready to pick":"Awaiting putaway"):carton.status==WarehouseWmsLedger.CartonStatus.Picked?"Staged for shipping":carton.status==WarehouseWmsLedger.CartonStatus.Loaded?"Loaded on van":carton.status.ToString();
                    body.Append("Item ").Append(WarehouseWmsVocabulary.ItemCode(carton.itemId)).Append("\nCarton ").Append(carton.id).Append("\n\n").Append(status).Append("\nLocation ").Append(string.IsNullOrEmpty(carton.binId)?"Not received":carton.binId);
                    return item!=null?item.name:"Carton details";
                }
            }
            else if(code.StartsWith("BIN:"))
            {
                var bin=runtime.Ledger.FindBin(code.Substring(4));
                if(bin!=null){body.Append(Wrap(WarehouseWmsVocabulary.BinName(bin.id),24,3)).Append("\n\nCartons  ").Append(runtime.Ledger.BinUsed(bin.id)).Append(" / ").Append(bin.capacity).Append("\n").Append(bin.canPick?"Pick from here":"Not a picking location");return bin.id;}
            }
            body.Append("Aim at an item, carton\nor location barcode.\n\nHOLD LEFT to scan\nRIGHT CLICK inspects");return "Item lookup";
        }
        static string Wrap(string value,int columns,int maximumLines)
        {
            if(string.IsNullOrEmpty(value))return "";
            var result=new StringBuilder();int column=0,lines=1;
            foreach(string word in value.Replace('\n',' ').Split(' '))
            {
                if(word.Length==0)continue;
                if(column>0&&column+word.Length+1>columns)
                {if(lines++>=maximumLines){result.Append("...");break;}result.Append('\n');column=0;}
                if(column>0){result.Append(' ');column++;}result.Append(word);column+=word.Length;
            }
            return result.ToString();
        }
        Transform RoundedPart(string name,Vector3 position,Vector3 size,float radius,Material material,Transform parent=null)
        {
            const int segments=5;const int count=4*(segments+1);
            radius=Mathf.Min(radius,Mathf.Min(size.x,size.y)*.5f);
            var ring=new Vector2[count];int index=0;
            for(int corner=0;corner<4;corner++)for(int step=0;step<=segments;step++)
            {
                float angle=(corner*90f+step*90f/segments)*Mathf.Deg2Rad;
                float x=corner==0||corner==3?size.x*.5f-radius:-size.x*.5f+radius;
                float y=corner<2?size.y*.5f-radius:-size.y*.5f+radius;
                ring[index++]=new Vector2(x+Mathf.Cos(angle)*radius,y+Mathf.Sin(angle)*radius);
            }
            var vertices=new Vector3[count*4+2];var triangles=new int[count*12];int triangle=0;
            vertices[count*4]=new Vector3(0,0,-size.z*.5f);vertices[count*4+1]=new Vector3(0,0,size.z*.5f);
            for(int i=0;i<count;i++)
            {
                int next=(i+1)%count;
                vertices[i]=vertices[count*2+i]=new Vector3(ring[i].x,ring[i].y,-size.z*.5f);
                vertices[count+i]=vertices[count*3+i]=new Vector3(ring[i].x,ring[i].y,size.z*.5f);
                triangles[triangle++]=count*4;triangles[triangle++]=next;triangles[triangle++]=i;
                triangles[triangle++]=count*4+1;triangles[triangle++]=count+i;triangles[triangle++]=count+next;
                triangles[triangle++]=count*2+i;triangles[triangle++]=count*2+next;triangles[triangle++]=count*3+i;
                triangles[triangle++]=count*2+next;triangles[triangle++]=count*3+next;triangles[triangle++]=count*3+i;
            }
            var mesh=new Mesh{name=name+" mesh",vertices=vertices,triangles=triangles};mesh.RecalculateNormals();mesh.RecalculateBounds();deviceMeshes.Add(mesh);
            var item=new GameObject(name);item.transform.SetParent(parent!=null?parent:device,false);item.transform.localPosition=position;
            item.AddComponent<MeshFilter>().sharedMesh=mesh;var renderer=item.AddComponent<MeshRenderer>();renderer.sharedMaterial=material;
            renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;return item.transform;
        }
        static AudioClip Tone(string name,float first,float second,float seconds)
        {
            const int rate=22050;var samples=new float[Mathf.CeilToInt(rate*seconds)];
            for(int i=0;i<samples.Length;i++){float t=(float)i/rate,envelope=Mathf.Sin(Mathf.PI*i/(samples.Length-1));samples[i]=Mathf.Sin(2*Mathf.PI*Mathf.Lerp(first,second,t/seconds)*t)*envelope*.35f;}
            var clip=AudioClip.Create(name,samples.Length,1,rate,false);clip.SetData(samples,0);return clip;
        }
        void OnDestroy()
        {
            if(device!=null)WarehouseCourierVisuals.Remove(device.gameObject);
            if(aimRenderer!=null)WarehouseCourierVisuals.Remove(aimRenderer.gameObject);if(aimMesh!=null)WarehouseCourierVisuals.Remove(aimMesh);
            if(sound!=null)WarehouseCourierVisuals.Remove(sound);
            foreach(var material in new[]{bodyMaterial,bumperMaterial,trimMaterial,screenMaterial,glowMaterial,paperMaterial,tileMaterial,laserMaterial,lensMaterial,metalMaterial})if(material!=null)WarehouseCourierVisuals.Remove(material);
            foreach(var mesh in deviceMeshes)if(mesh!=null)WarehouseCourierVisuals.Remove(mesh);
            if(goodBeep!=null)WarehouseCourierVisuals.Remove(goodBeep);if(badBeep!=null)WarehouseCourierVisuals.Remove(badBeep);
        }
    }
}
