using UnityEngine;

namespace OneShift.RackLab
{
    public static class WarehouseCourierRoute
    {
        public const float Ground=-1.3325f;
        public static readonly Vector3 StreetStart=new Vector3(84,Ground,-39);
        public static readonly Vector3 Parked=new Vector3(3,Ground,-28.2f);
        public const float ArrivalDuration=18.4f, DepartureDuration=14.3f;

        // The driver passes the bay, changes gear, then reverses through one
        // seven metre quarter turn. The front street remains the approach road.
        public static void Sample(bool departure,float time,out Vector3 position,out Quaternion rotation,out float steering)
        {
            steering=0;
            if(!departure)
            {
                if(time<11){position=Vector3.Lerp(StreetStart,new Vector3(-4,Ground,-39),time/11);rotation=Quaternion.Euler(0,270,0);return;}
                if(time<11.8f){position=new Vector3(-4,Ground,-39);rotation=Quaternion.Euler(0,270,0);return;}
                if(time<16.6f)
                {
                    float a=Mathf.Clamp01((time-11.8f)/4.8f)*Mathf.PI*.5f;
                    position=new Vector3(-4+7*Mathf.Sin(a),Ground,-32-7*Mathf.Cos(a));
                    rotation=Quaternion.Euler(0,270-a*Mathf.Rad2Deg,0);steering=-27;return;
                }
                position=Vector3.Lerp(new Vector3(3,Ground,-32),Parked,Mathf.Clamp01((time-16.6f)/1.8f));rotation=Quaternion.Euler(0,180,0);return;
            }
            if(time<1.8f){position=Vector3.Lerp(Parked,new Vector3(3,Ground,-32),time/1.8f);rotation=Quaternion.Euler(0,180,0);return;}
            if(time<5.0f)
            {
                float a=Mathf.Clamp01((time-1.8f)/3.2f)*Mathf.PI*.5f;
                position=new Vector3(10-7*Mathf.Cos(a),Ground,-32-7*Mathf.Sin(a));
                rotation=Quaternion.Euler(0,180-a*Mathf.Rad2Deg,0);steering=-27;return;
            }
            position=Vector3.Lerp(new Vector3(10,Ground,-39),StreetStart,Mathf.Clamp01((time-5)/9.3f));rotation=Quaternion.Euler(0,90,0);
        }
    }
}
