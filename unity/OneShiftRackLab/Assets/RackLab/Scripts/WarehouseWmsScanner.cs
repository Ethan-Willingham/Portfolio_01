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
        public bool AimVisible => beam != null && beam.enabled;
        public bool AimHasSurface { get; private set; }
        public Vector3 AimPoint { get; private set; }
        public Vector3 EmitterPosition => emitter != null ? emitter.position : Vector3.zero;
        public Vector3 EmitterDirection => emitter != null ? emitter.up : Vector3.forward;
        public WarehouseWmsScanResult LastResult { get; private set; }
        public event Action<WarehouseWmsScanResult> Scanned;
        RackWalkController walking;
        PhysicsScene physics;
        readonly RaycastHit[] hits = new RaycastHit[128];
        Transform device, emitter;
        Transform homeScreen;
        LineRenderer beam, aimer;
        Material bodyMaterial, bumperMaterial, trimMaterial, screenMaterial, glowMaterial, paperMaterial, tileMaterial, laserMaterial, lensMaterial, metalMaterial;
        WarehouseWmsRuntime runtime;
        WarehouseGrabber grabber;
        TextMesh screenTitle, screenBody, screenNotice, screenFooter;
        readonly List<Mesh> deviceMeshes = new List<Mesh>();
        Renderer indicator;
        AudioSource sound;
        AudioClip goodBeep, badBeep;
        float flashUntil, nextScanAt, visibleAmount, nextScreenAt, scanAmount, singleShotUntil, candidateSince;
        string candidateCode = "", decodedCode = "";
        WarehouseWmsLabel aimedLabel;
        RaycastHit aimHit;
        bool applicationFocused = true, inspecting;

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
            if(beam!=null)beam.enabled=false;if(aimer!=null)aimer.enabled=false;
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
            TriggerHeld=held;candidateCode=decodedCode="";candidateSince=0;
        }

        void HideAim()
        {
            if(beam!=null)beam.enabled=false;if(aimer!=null)aimer.enabled=false;
            AimHasSurface=false;aimedLabel=null;
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
                var label=hit.collider.GetComponent<WarehouseWmsLabel>();
                if(hit.collider.isTrigger&&label==null)continue;
                if(hit.distance<nearest){nearest=hit.distance;first=hit;}
            }
            return first.collider!=null;
        }

        public void Feedback(bool success,string message)
        {
            var result=LastResult;result.message=message;LastResult=result;
            if(glowMaterial==null)return;
            glowMaterial.color=success?new Color(.39f,.72f,.35f):new Color(.84f,.24f,.12f);
            flashUntil=Time.unscaledTime+.16f;
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
            if(Time.unscaledTime>=nextScreenAt){nextScreenAt=Time.unscaledTime+.2f;RefreshScreen();}
            bool flashing=Time.unscaledTime<flashUntil;
            if(indicator!=null)indicator.enabled=flashing;
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
                beam.enabled=true;beam.SetPosition(0,emitter.position);beam.SetPosition(1,AimPoint);
                aimer.enabled=AimHasSurface;
                if(AimHasSurface)
                {
                    Vector3 point=AimPoint+aimHit.normal*.0015f;
                    Vector3 across=Vector3.ProjectOnPlane(view.right,aimHit.normal).normalized*.0007f;
                    aimer.widthMultiplier=Mathf.Clamp(aimHit.distance*.003f,.004f,.009f);
                    aimer.SetPosition(0,point-across);aimer.SetPosition(1,point+across);
                }
                if(TriggerHeld)AcquireLabel();
            }
            else HideAim();
        }

        void AcquireLabel()
        {
            string code=aimedLabel!=null&&aimHit.distance>=MinimumDistance&&Vector3.Dot(aimedLabel.Normal,-emitter.up)>=MinimumFacingDot?aimedLabel.Code:"";
            if(code!=candidateCode){candidateCode=code;candidateSince=Time.unscaledTime;}
            if(code.Length==0||code==decodedCode||scanAmount<.98f||Time.unscaledTime-candidateSince<.06f||Time.unscaledTime<nextScanAt)return;
            // Holding on the same label never repeats a receipt or task step.
            // Moving onto a different label arms one new decode, without a
            // stream of failure beeps while crossing blank cardboard or walls.
            decodedCode=code;
            if(runtime!=null)runtime.Scan();else TryScan();
        }
        void OnApplicationFocus(bool value){applicationFocused=value;if(!value){SetTriggerHeld(false);singleShotUntil=0;HideAim();if(sound!=null)sound.Stop();}}
        void OnApplicationPause(bool value){if(value){SetTriggerHeld(false);singleShotUntil=0;HideAim();}}
        void OnDisable(){SetEquipped(false);if(device!=null)device.gameObject.SetActive(false);}

        void BuildDevice()
        {
            // Original geometry follows the TC22's 165 x 76.3 x 12.5 mm body,
            // top exit window, side scan keys and lower speaker/contact chin.
            // SE4710 uses a red-dot aimer; the SE55's green pattern is different.
            bodyMaterial=WarehouseCareer.Material("TC22 charcoal housing",new Color(.13f,.145f,.135f));
            bumperMaterial=WarehouseCareer.Material("TC22 edge protection",new Color(.035f,.043f,.038f));
            trimMaterial=WarehouseCareer.Material("TC22 scan key",new Color(.22f,.245f,.23f));
            metalMaterial=WarehouseCareer.Material("TC22 cradle contacts",new Color(.52f,.43f,.26f));
            lensMaterial=WarehouseCareer.Material("TC22 imager optics",new Color(.055f,.008f,.007f),true);
            screenMaterial=WarehouseCareer.Material("TC22 display header",new Color(.10f,.20f,.17f),true);
            paperMaterial=WarehouseCareer.Material("TC22 display paper",new Color(.89f,.85f,.73f),true);
            tileMaterial=WarehouseCareer.Material("TC22 display tiles",new Color(.77f,.76f,.64f),true);
            glowMaterial=WarehouseCareer.Material("TC22 read indicator",new Color(.39f,.72f,.35f),true);
            laserMaterial=WarehouseCareer.Material("SE4710 red aiming illumination",new Color(1f,.018f,.008f),true);
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
            ScreenText("Application header","LATCHFORD WMS",new Vector2(.055f,.0055f),new Vector3(0,.061f,-.0101f),new Color(.92f,.88f,.74f));
            screenTitle=ScreenText("Live task title","Floor operations",new Vector2(.058f,.014f),new Vector3(0,.043f,-.0101f),new Color(.13f,.20f,.16f));
            screenBody=ScreenText("Live task instruction","",new Vector2(.058f,.071f),new Vector3(0,-.003f,-.0101f),new Color(.16f,.21f,.17f));
            screenNotice=ScreenText("Live scan response","Ready to scan",new Vector2(.058f,.013f),new Vector3(0,-.048f,-.0101f),new Color(.28f,.37f,.24f));
            screenFooter=ScreenText("Device controls","HOLD LEFT Scan / RIGHT Inspect",new Vector2(.057f,.0045f),new Vector3(0,-.060f,-.0101f),new Color(.27f,.31f,.24f));
            ScreenText("Device identification","ZEBRA",new Vector2(.018f,.0035f),new Vector3(-.023f,-.074f,-.0084f),new Color(.70f,.72f,.67f));
            ScreenText("Model identification","TC22",new Vector2(.014f,.0035f),new Vector3(.024f,-.074f,-.0084f),new Color(.70f,.72f,.67f));
            homeScreen=new GameObject("Live WMS home tiles").transform;homeScreen.SetParent(device,false);
            string[] titles={"TRANSFER","PICK","ITEM LOOKUP","SHIP","RECEIVE"};
            for(int i=0;i<titles.Length;i++)
            {
                float x=i==4?0:(i%2==0?-.016f:.016f),y=i<4?.021f-(i/2)*.029f:-.032f;
                Vector3 size=new Vector3(i==4?.058f:.027f,i==4?.016f:.023f,.0004f);
                RoundedPart(titles[i]+" tile",new Vector3(x,y,-.0092f),size,.002f,tileMaterial,homeScreen);
                ScreenText(titles[i]+" tile label",titles[i],new Vector2(size.x*.88f,.006f),new Vector3(x,y,-.0101f),new Color(.13f,.20f,.16f),homeScreen);
            }
            emitter=new GameObject("SE4710 exit axis").transform;emitter.SetParent(device,false);emitter.localPosition=new Vector3(0,.085f,0);
            beam=Line("Red aiming beam",2,.00065f);aimer=Line("Red aiming dot",2,.006f);aimer.numCapVertices=6;
            sound=gameObject.AddComponent<AudioSource>();sound.playOnAwake=false;sound.spatialBlend=0;sound.volume=.10f;
            goodBeep=Tone("TC22 decode",1700,2200,.09f);badBeep=Tone("TC22 rejected",280,240,.13f);
            device.gameObject.SetActive(false);
        }
        TextMesh ScreenText(string name,string value,Vector2 area,Vector3 position,Color color,Transform parent=null)
        {
            var text=new GameObject(name).AddComponent<TextMesh>();text.transform.SetParent(parent!=null?parent:device,false);
            WarehouseCareer.UseWarehouseFont(text);text.fontSize=48;text.anchor=TextAnchor.MiddleCenter;text.alignment=TextAlignment.Left;text.color=color;
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
            homeScreen.gameObject.SetActive(home);screenBody.gameObject.SetActive(!home);
            WriteScreen(screenTitle,Wrap(home?"Floor operations":work.title,23,2),new Vector2(.058f,.014f),new Vector3(0,.043f,-.0101f));
            if(!home)
            {
                var body=new StringBuilder();
                if(work.tile=="lookup")AppendLookup(body);
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
            string notice=runtime.Severity=="error"?runtime.Message:runtime.ScanResult.status=="success"&&!string.IsNullOrEmpty(runtime.ScanResult.code)?"READ OK  "+runtime.ScanResult.code:runtime.Message;
            screenNotice.color=runtime.Severity=="error"?new Color(.58f,.16f,.10f):new Color(.24f,.36f,.22f);
            WriteScreen(screenNotice,Wrap(notice,27,2),new Vector2(.058f,.013f),new Vector3(0,-.048f,-.0101f));
            WriteScreen(screenFooter,ready?"ENTER Confirm / RIGHT Inspect":"HOLD LEFT Scan / RIGHT Inspect",new Vector2(.057f,.005f),new Vector3(0,-.060f,-.0101f));
        }
        void AppendLookup(StringBuilder body)
        {
            string code=runtime.ScanResult.code??"";
            if(code.StartsWith("ITEM:"))
            {
                string id=code.Substring(5);var item=runtime.Ledger.FindItem(id);
                if(item!=null){body.Append(Wrap(item.description,24,2)).Append("\n\nON HAND  ").Append(runtime.Ledger.OnHand(id)).Append(" CTN\nAVAILABLE  ").Append(runtime.Ledger.Available(id)).Append(" CTN\nALLOCATED  ").Append(runtime.Ledger.Reserved(id)).Append(" CTN");return;}
            }
            else if(code.StartsWith("CARTON:"))
            {
                var carton=runtime.Ledger.FindCarton(code.Substring(7));
                if(carton!=null){body.Append(carton.id).Append("\n1 CTN  ").Append(carton.status).Append("\n\nBIN  ").Append(string.IsNullOrEmpty(carton.binId)?"Not received":carton.binId).Append("\nPO   ").Append(carton.purchaseOrderId);return;}
            }
            else if(code.StartsWith("BIN:"))
            {
                var bin=runtime.Ledger.FindBin(code.Substring(4));
                if(bin!=null){body.Append(bin.id).Append("\n").Append(bin.kind).Append("\n\nSTOCK  ").Append(runtime.Ledger.BinUsed(bin.id)).Append(" CTN\nCAPACITY  ").Append(bin.capacity).Append(" CTN\nPICKING  ").Append(bin.canPick?"Yes":"No");return;}
            }
            body.Append("Aim at an item, carton\nor bin barcode.\n\nHOLD LEFT to scan\nRIGHT CLICK inspects");
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
        LineRenderer Line(string name,int points,float width)
        {
            var line=new GameObject(name).AddComponent<LineRenderer>();line.transform.SetParent(transform,false);line.sharedMaterial=laserMaterial;
            line.positionCount=points;line.widthMultiplier=width;line.useWorldSpace=true;line.shadowCastingMode=ShadowCastingMode.Off;line.receiveShadows=false;line.enabled=false;return line;
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
            if(beam!=null)WarehouseCourierVisuals.Remove(beam.gameObject);if(aimer!=null)WarehouseCourierVisuals.Remove(aimer.gameObject);
            if(sound!=null)WarehouseCourierVisuals.Remove(sound);
            foreach(var material in new[]{bodyMaterial,bumperMaterial,trimMaterial,screenMaterial,glowMaterial,paperMaterial,tileMaterial,laserMaterial,lensMaterial,metalMaterial})if(material!=null)WarehouseCourierVisuals.Remove(material);
            foreach(var mesh in deviceMeshes)if(mesh!=null)WarehouseCourierVisuals.Remove(mesh);
            if(goodBeep!=null)WarehouseCourierVisuals.Remove(goodBeep);if(badBeep!=null)WarehouseCourierVisuals.Remove(badBeep);
        }
    }
}
