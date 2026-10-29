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

    // Input belongs to the walking/browser lifecycle. This component performs
    // one physical scan per request and draws the original handheld model.
    [DisallowMultipleComponent]
    public sealed class WarehouseWmsScanner : MonoBehaviour
    {
        public const float MaximumDistance = 4.2f;
        public const float MinimumDistance = .12f;
        public const float MinimumFacingDot = .38f;
        public bool Equipped { get; private set; }
        public WarehouseWmsScanResult LastResult { get; private set; }
        public event Action<WarehouseWmsScanResult> Scanned;
        RackWalkController walking;
        PhysicsScene physics;
        readonly RaycastHit[] hits = new RaycastHit[128];
        Transform device, emitter;
        Transform homeScreen;
        LineRenderer beam, aimer;
        Material bodyMaterial, bumperMaterial, trimMaterial, screenMaterial, glowMaterial, paperMaterial, tileMaterial, skinMaterial, sleeveMaterial;
        WarehouseWmsRuntime runtime;
        WarehouseGrabber grabber;
        TextMesh screenTitle, screenBody, screenNotice, screenFooter;
        readonly List<Mesh> deviceMeshes = new List<Mesh>();
        Renderer indicator;
        AudioSource sound;
        AudioClip goodBeep, badBeep;
        float flashUntil, nextScanAt, visibleAmount, nextScreenAt;
        bool applicationFocused = true, inspecting;

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
            if(device!=null)device.gameObject.SetActive(false);
            if(beam!=null)beam.enabled=false;if(aimer!=null)aimer.enabled=false;
        }

        public void SetEquipped(bool value)
        {
            Equipped = value;
            if (!value) { flashUntil = 0; if (beam != null) beam.enabled = false; if (aimer != null) aimer.enabled = false; if (sound != null) sound.Stop(); }
        }

        public WarehouseWmsScanResult TryScan()
        {
            if (walking == null || walking.eyes == null || !Equipped || !walking.CanControl || !applicationFocused)
                return Fail("Return to floor control before scanning.", false);
            if (Time.unscaledTime < nextScanAt)
                return new WarehouseWmsScanResult { success=false,code="",kind="",id="",label="",message="Let the scan trigger reset, then scan again.",point=LastResult.point,distance=LastResult.distance };
            nextScanAt = Time.unscaledTime + .22f;
            var view = walking.eyes.transform;
            var result = Trace(physics, view.position, view.forward, walking.transform, hits);
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
            var result=new WarehouseWmsScanResult{success=false,code="",kind="",id="",label="",message="Aim at a carton or bin barcode, then left-click to scan.",point=origin+forward*MaximumDistance,distance=MaximumDistance};
            if(forward.sqrMagnitude<.5f||buffer==null||buffer.Length==0)return result;
            forward.Normalize();
            int count=physics.Raycast(origin,forward,buffer,MaximumDistance,~0,QueryTriggerInteraction.Collide);
            float nearest=float.PositiveInfinity;RaycastHit first=default;
            for(int i=0;i<count;i++)
            {
                var hit=buffer[i];if(hit.collider==null||(player!=null&&hit.collider.transform.IsChildOf(player)))continue;
                var label=hit.collider.GetComponent<WarehouseWmsLabel>();
                if(hit.collider.isTrigger&&label==null)continue;
                if(hit.distance<nearest){nearest=hit.distance;first=hit;}
            }
            if(first.collider==null)return result;
            result.point=first.point;result.distance=first.distance;
            var target=first.collider.GetComponent<WarehouseWmsLabel>();
            if(target==null){result.message="No readable barcode under the aimer.";return result;}
            if(first.distance<MinimumDistance){result.message="Move the scanner slightly back from the label.";return result;}
            if(Vector3.Dot(target.Normal,-forward)<MinimumFacingDot){result.message="Face the printed side of the label more directly.";return result;}
            if(!WarehouseCode128.TryEncode(target.Code,out var symbols)||!WarehouseCode128.TryDecode(symbols,out string decoded)||decoded!=target.Code)
            {result.message="This label could not be decoded.";return result;}
            result.success=true;result.code=decoded;result.kind=target.Kind;result.id=target.Id;result.label=target.Caption;result.message="Read "+target.Caption+".";return result;
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
            bool allowed=Equipped&&!inspecting&&walking!=null&&walking.eyes!=null&&walking.CanControl&&applicationFocused&&(grabber==null||!grabber.IsHolding);
            if(device==null)return;
            if(!allowed)
            {
                device.gameObject.SetActive(false);if(beam!=null)beam.enabled=false;if(aimer!=null)aimer.enabled=false;
                if(sound!=null&&sound.isPlaying)sound.Stop();visibleAmount=0;return;
            }
            device.gameObject.SetActive(true);visibleAmount=Mathf.MoveTowards(visibleAmount,1,Time.deltaTime*7);
            device.localPosition=new Vector3(.20f,Mathf.Lerp(-.36f,-.105f,visibleAmount),.43f);
            device.localRotation=Quaternion.Euler(-5,-10,8);
            if(Time.unscaledTime>=nextScreenAt){nextScreenAt=Time.unscaledTime+.2f;RefreshScreen();}
            bool flashing=Time.unscaledTime<flashUntil;
            beam.enabled=flashing;aimer.enabled=flashing;
            if(indicator!=null)indicator.enabled=flashing;
            if(flashing)
            {
                Vector3 end=LastResult.point;
                beam.SetPosition(0,emitter.position);beam.SetPosition(1,end);
                Vector3 right=walking.eyes.transform.right*.045f,up=walking.eyes.transform.up*.016f;
                aimer.SetPositions(new[]{end-right,end+right,end,end-up,end+up});
            }
        }
        void OnApplicationFocus(bool value){applicationFocused=value;if(!value&&sound!=null)sound.Stop();}
        void OnDisable(){SetEquipped(false);if(device!=null)device.gameObject.SetActive(false);}

        void BuildDevice()
        {
            // TC22 body: 165 x 76.3 x 12.5 mm, with a separate rugged bumper.
            // The first-person scale keeps its real proportions legible on screen.
            bodyMaterial=WarehouseCareer.Material("TC22 charcoal housing",new Color(.075f,.09f,.08f));
            bumperMaterial=WarehouseCareer.Material("TC22 rubber bumper",new Color(.035f,.045f,.038f));
            trimMaterial=WarehouseCareer.Material("TC22 side trigger",new Color(.62f,.46f,.19f));
            screenMaterial=WarehouseCareer.Material("TC22 display header",new Color(.10f,.20f,.17f),true);
            paperMaterial=WarehouseCareer.Material("TC22 display paper",new Color(.89f,.85f,.73f),true);
            tileMaterial=WarehouseCareer.Material("TC22 display tiles",new Color(.77f,.76f,.64f),true);
            skinMaterial=WarehouseCareer.Material("Scanner operator hand",new Color(.58f,.40f,.28f));
            sleeveMaterial=WarehouseCareer.Material("Scanner operator sleeve",new Color(.20f,.25f,.22f));
            glowMaterial=WarehouseCareer.Material("TC22 read indicator",new Color(.39f,.72f,.35f),true);
            device=new GameObject("Zebra TC22 handheld").transform;device.SetParent(walking.eyes.transform,false);device.localScale=Vector3.one*1.65f;
            RoundedPart("Protective bumper",Vector3.zero,new Vector3(.083f,.175f,.023f),.011f,bumperMaterial);
            RoundedPart("TC22 housing",new Vector3(0,0,-.008f),new Vector3(.0763f,.165f,.0125f),.009f,bodyMaterial);
            RoundedPart("Display glass surround",new Vector3(0,.001f,-.0148f),new Vector3(.069f,.143f,.002f),.005f,bumperMaterial);
            RoundedPart("Six inch live WMS display",new Vector3(0,.001f,-.0161f),new Vector3(.065f,.137f,.0007f),.004f,paperMaterial);
            RoundedPart("Screen header",new Vector3(0,.061f,-.0167f),new Vector3(.063f,.013f,.0005f),.002f,screenMaterial);
            RoundedPart("Top imager window",new Vector3(0,.086f,.001f),new Vector3(.034f,.010f,.018f),.004f,bodyMaterial);
            RoundedPart("Imager glass",new Vector3(0,.089f,-.005f),new Vector3(.024f,.003f,.006f),.001f,screenMaterial);
            RoundedPart("Left scan trigger",new Vector3(-.042f,.022f,0),new Vector3(.004f,.028f,.014f),.0018f,trimMaterial);
            RoundedPart("Right scan trigger",new Vector3(.042f,.022f,0),new Vector3(.004f,.028f,.014f),.0018f,trimMaterial);
            RoundedPart("Power key",new Vector3(.041f,.057f,0),new Vector3(.003f,.010f,.009f),.001f,bodyMaterial);
            RoundedPart("Top earpiece",new Vector3(0,.076f,-.015f),new Vector3(.020f,.002f,.001f),.001f,bumperMaterial);
            RoundedPart("Front camera",new Vector3(-.023f,.076f,-.015f),new Vector3(.0048f,.0048f,.001f),.0024f,screenMaterial);
            indicator=RoundedPart("Read LED",new Vector3(.025f,.076f,-.0155f),new Vector3(.002f,.002f,.001f),.001f,glowMaterial).GetComponent<Renderer>();
            ScreenText("Application header","LATCHFORD WMS",new Vector2(.055f,.006f),new Vector3(0,.061f,-.0178f),new Color(.92f,.88f,.74f));
            screenTitle=ScreenText("Live task title","Floor operations",new Vector2(.058f,.014f),new Vector3(0,.043f,-.0178f),new Color(.13f,.20f,.16f));
            screenBody=ScreenText("Live task instruction","",new Vector2(.058f,.071f),new Vector3(0,-.003f,-.0178f),new Color(.16f,.21f,.17f));
            screenNotice=ScreenText("Live scan response","Ready to scan",new Vector2(.058f,.013f),new Vector3(0,-.048f,-.0178f),new Color(.28f,.37f,.24f));
            screenFooter=ScreenText("Device controls","LEFT Scan / RIGHT Inspect",new Vector2(.057f,.005f),new Vector3(0,-.060f,-.0178f),new Color(.27f,.31f,.24f));
            ScreenText("Device identification","ZEBRA   TC22",new Vector2(.056f,.0045f),new Vector3(0,-.078f,-.016f),new Color(.62f,.64f,.57f));
            homeScreen=new GameObject("Live WMS home tiles").transform;homeScreen.SetParent(device,false);
            string[] titles={"TRANSFER","PICK","ITEM LOOKUP","SHIP","RECEIVE"};
            for(int i=0;i<titles.Length;i++)
            {
                float x=i==4?0:(i%2==0?-.016f:.016f),y=i<4?.021f-(i/2)*.029f:-.032f;
                Vector3 size=new Vector3(i==4?.058f:.027f,i==4?.016f:.023f,.0004f);
                RoundedPart(titles[i]+" tile",new Vector3(x,y,-.0169f),size,.002f,tileMaterial,homeScreen);
                ScreenText(titles[i]+" tile label",titles[i],new Vector2(size.x*.88f,.006f),new Vector3(x,y,-.0178f),new Color(.13f,.20f,.16f),homeScreen);
            }
            // A restrained first-person hand and work sleeve support the device.
            // These shapes are presentation only and introduce no colliders.
            RoundedPart("Right palm",new Vector3(.025f,-.048f,.018f),new Vector3(.047f,.067f,.034f),.013f,skinMaterial);
            for(int i=0;i<3;i++)RoundedPart("Curled finger "+i,new Vector3(.043f,-.026f-i*.016f,.001f),new Vector3(.017f,.014f,.030f),.006f,skinMaterial);
            var thumb=RoundedPart("Thumb on side grip",new Vector3(.035f,-.014f,-.009f),new Vector3(.014f,.036f,.018f),.006f,skinMaterial);thumb.localRotation=Quaternion.Euler(0,0,-20);
            var wrist=RoundedPart("Wrist",new Vector3(.040f,-.101f,.026f),new Vector3(.046f,.060f,.045f),.012f,skinMaterial);wrist.localRotation=Quaternion.Euler(-12,0,12);
            var sleeve=RoundedPart("Work shirt sleeve",new Vector3(.055f,-.177f,.045f),new Vector3(.061f,.137f,.062f),.014f,sleeveMaterial);sleeve.localRotation=Quaternion.Euler(-12,0,12);
            RoundedPart("Sleeve cuff",new Vector3(.045f,-.119f,.030f),new Vector3(.061f,.020f,.060f),.010f,sleeveMaterial);
            emitter=new GameObject("Imager aperture").transform;emitter.SetParent(device,false);emitter.localPosition=new Vector3(0,.09f,.01f);
            beam=Line("Scanner aiming ray",2,.0012f);aimer=Line("Scanner aiming cross",5,.002f);
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
            WriteScreen(screenTitle,Wrap(home?"Floor operations":work.title,23,2),new Vector2(.058f,.014f),new Vector3(0,.043f,-.0178f));
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
                WriteScreen(screenBody,body.ToString(),new Vector2(.058f,.071f),new Vector3(0,-.003f,-.0178f));
            }
            string notice=runtime.Severity=="error"?runtime.Message:runtime.ScanResult.status=="success"&&!string.IsNullOrEmpty(runtime.ScanResult.code)?"READ OK  "+runtime.ScanResult.code:runtime.Message;
            screenNotice.color=runtime.Severity=="error"?new Color(.58f,.16f,.10f):new Color(.24f,.36f,.22f);
            WriteScreen(screenNotice,Wrap(notice,27,2),new Vector2(.058f,.013f),new Vector3(0,-.048f,-.0178f));
            WriteScreen(screenFooter,ready?"ENTER Confirm / RIGHT Inspect":"LEFT Scan / RIGHT Inspect",new Vector2(.057f,.005f),new Vector3(0,-.060f,-.0178f));
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
            body.Append("Aim at an item, carton\nor bin barcode.\n\nLEFT CLICK scans\nRIGHT CLICK inspects");
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
            var line=new GameObject(name).AddComponent<LineRenderer>();line.transform.SetParent(transform,false);line.sharedMaterial=glowMaterial;
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
            foreach(var material in new[]{bodyMaterial,bumperMaterial,trimMaterial,screenMaterial,glowMaterial,paperMaterial,tileMaterial,skinMaterial,sleeveMaterial})if(material!=null)WarehouseCourierVisuals.Remove(material);
            foreach(var mesh in deviceMeshes)if(mesh!=null)WarehouseCourierVisuals.Remove(mesh);
            if(goodBeep!=null)WarehouseCourierVisuals.Remove(goodBeep);if(badBeep!=null)WarehouseCourierVisuals.Remove(badBeep);
        }
    }
}
