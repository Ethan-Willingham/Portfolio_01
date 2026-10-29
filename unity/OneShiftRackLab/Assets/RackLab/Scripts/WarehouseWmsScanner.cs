using System;
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
        LineRenderer beam, aimer;
        Material bodyMaterial, bumperMaterial, trimMaterial, screenMaterial, glowMaterial;
        Renderer indicator;
        AudioSource sound;
        AudioClip goodBeep, badBeep;
        float flashUntil, nextScanAt, visibleAmount;
        bool applicationFocused = true;

        public void Bind(RackWalkController owner)
        {
            walking = owner; physics = gameObject.scene.GetPhysicsScene();
            if (walking != null && walking.eyes != null && device == null) BuildDevice();
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
            var result=new WarehouseWmsScanResult{success=false,code="",kind="",id="",label="",message="Aim at a carton or bin barcode, then press F.",point=origin+forward*MaximumDistance,distance=MaximumDistance};
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
            bool allowed=Equipped&&walking!=null&&walking.eyes!=null&&walking.CanControl&&applicationFocused;
            if(device==null)return;
            if(!allowed)
            {
                device.gameObject.SetActive(false);if(beam!=null)beam.enabled=false;if(aimer!=null)aimer.enabled=false;
                if(sound!=null&&sound.isPlaying)sound.Stop();visibleAmount=0;return;
            }
            device.gameObject.SetActive(true);visibleAmount=Mathf.MoveTowards(visibleAmount,1,Time.deltaTime*7);
            device.localPosition=new Vector3(.235f,Mathf.Lerp(-.37f,-.205f,visibleAmount),.39f);
            device.localRotation=Quaternion.Euler(-9,-13,5);
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
            // TC22 body reference:165 x76.3 x12.5mm. The removable bumper and
            // slightly enlarged first-person presentation retain those proportions.
            bodyMaterial=WarehouseCareer.Material("TC22 charcoal housing",new Color(.075f,.09f,.08f));
            bumperMaterial=WarehouseCareer.Material("TC22 rubber bumper",new Color(.035f,.045f,.038f));
            trimMaterial=WarehouseCareer.Material("TC22 side trigger",new Color(.62f,.46f,.19f));
            screenMaterial=WarehouseCareer.Material("TC22 display",new Color(.10f,.20f,.17f),true);
            glowMaterial=WarehouseCareer.Material("TC22 read indicator",new Color(.39f,.72f,.35f),true);
            device=new GameObject("Zebra TC22 handheld").transform;device.SetParent(walking.eyes.transform,false);device.localScale=Vector3.one*1.38f;
            Part("Protective bumper",Vector3.zero,new Vector3(.083f,.175f,.023f),bumperMaterial);
            Part("TC22 housing",new Vector3(0,0,-.008f),new Vector3(.0763f,.165f,.0125f),bodyMaterial);
            Part("Six inch display",new Vector3(0,-.001f,-.0145f),new Vector3(.068f,.140f,.001f),screenMaterial);
            Part("Top imager window",new Vector3(0,.087f,-.001f),new Vector3(.034f,.009f,.017f),bodyMaterial);
            Part("Left scan trigger",new Vector3(-.042f,.025f,0),new Vector3(.004f,.029f,.014f),trimMaterial);
            Part("Right scan trigger",new Vector3(.042f,.025f,0),new Vector3(.004f,.029f,.014f),trimMaterial);
            Part("Top earpiece",new Vector3(0,.076f,-.015f),new Vector3(.020f,.002f,.001f),bumperMaterial);
            indicator=Part("Read LED",new Vector3(.025f,.076f,-.0155f),new Vector3(.002f,.002f,.001f),glowMaterial).GetComponent<Renderer>();
            for(int row=0;row<3;row++)for(int column=0;column<2;column++)
                Part("WMS application tile",new Vector3((column-.5f)*.030f,.032f-row*.032f,-.0153f),new Vector3(.026f,.026f,.0007f),row==2&&column==1?screenMaterial:bodyMaterial);
            var text=new GameObject("TC22 WMS screen legend").AddComponent<TextMesh>();text.transform.SetParent(device,false);text.transform.localPosition=new Vector3(0,.060f,-.016f);
            WarehouseCareer.UseWarehouseFont(text);text.fontSize=40;text.anchor=TextAnchor.MiddleCenter;text.alignment=TextAlignment.Center;
            text.text="LATCHFORD\nWMS";text.color=new Color(.84f,.80f,.65f);
            WarehouseWmsLabel.FitText(text,new Vector2(.058f,.017f),new Vector3(0,.059f,-.016f));
            var brand=new GameObject("Device identification").AddComponent<TextMesh>();brand.transform.SetParent(device,false);brand.transform.localPosition=new Vector3(0,-.078f,-.016f);
            WarehouseCareer.UseWarehouseFont(brand);brand.fontSize=32;brand.anchor=TextAnchor.MiddleCenter;brand.text="ZEBRA  TC22";brand.color=new Color(.62f,.64f,.57f);
            WarehouseWmsLabel.FitText(brand,new Vector2(.059f,.0055f),new Vector3(0,-.078f,-.016f));
            emitter=new GameObject("Imager aperture").transform;emitter.SetParent(device,false);emitter.localPosition=new Vector3(0,.09f,.01f);
            beam=Line("Scanner aiming ray",2,.0012f);aimer=Line("Scanner aiming cross",5,.002f);
            sound=gameObject.AddComponent<AudioSource>();sound.playOnAwake=false;sound.spatialBlend=0;sound.volume=.10f;
            goodBeep=Tone("TC22 decode",1700,2200,.09f);badBeep=Tone("TC22 rejected",280,240,.13f);
            device.gameObject.SetActive(false);
        }
        Transform Part(string name,Vector3 position,Vector3 size,Material material)
        {var item=WarehouseCareer.Cube(name,device,position,size,material);var renderer=item.GetComponent<Renderer>();renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;return item;}
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
            foreach(var material in new[]{bodyMaterial,bumperMaterial,trimMaterial,screenMaterial,glowMaterial})if(material!=null)WarehouseCourierVisuals.Remove(material);
            if(goodBeep!=null)WarehouseCourierVisuals.Remove(goodBeep);if(badBeep!=null)WarehouseCourierVisuals.Remove(badBeep);
        }
    }
}
