using System.Collections.Generic;
using UnityEngine;

namespace OneShift.RackLab
{
    // Route geometry follows the trailer tandem centre. The kingpin's tangent
    // supplies the tractor heading, so both axle groups roll through the turns.
    // Quintic bends have zero curvature at their ends: articulation and front
    // steering enter and leave a bend without snapping at a waypoint.
    public static class WarehouseTruckRoute
    {
        public const float AxleFromRear = 2.7871f;
        public const float KingpinFromRear = 15.3094f;
        const float Wheelbase = KingpinFromRear - AxleFromRear;
        const float DockRearZ = 13.05f;

        public struct Pose
        {
            public Vector3 position;
            public Quaternion rotation;
            public float articulation, steering;
            public bool reversing;
        }

        struct Sample
        {
            public Vector3 axle, forward;
            public float speed;
        }
        struct TimedPose { public float time; public Pose pose; }
        static readonly List<TimedPose> arrival = BuildArrival();
        static readonly List<TimedPose> departure = BuildDeparture();
        public static float ArrivalDuration => arrival[arrival.Count - 1].time;
        public static float DepartureDuration => departure[departure.Count - 1].time;

        public static Pose Arrival(float progress, Vector3 dock) => Evaluate(arrival, progress, dock);
        public static Pose Departure(float progress, Vector3 dock) => Evaluate(departure, progress, dock);

        static List<TimedPose> BuildArrival()
        {
            var path = new List<Sample>();
            Line(path, P(92,68), P(47,68), 6.5f);
            Bend(path, P(47,68), Vector3.left, P(26,47), Vector3.back, 6, 4.5f);
            Line(path, P(26,47), P(26,46), 4.5f);
            // Keep the articulated tractor's inside front tyre north of the
            // pedestrian ramp, which finishes at z=24. The tyre envelope is
            // wider than the trailer-tandem centreline at this tight yard turn.
            Bend(path, P(26,46), Vector3.back, P(13,33), Vector3.left, 3.75f, 3.8f);
            Bend(path, P(13,33), Vector3.left, P(0,46), Vector3.forward, 3.75f, 3.8f);
            Line(path, P(0,46), P(0,60), 4.5f);
            var result = new List<TimedPose>();
            Append(result, path, false);
            var held = result[result.Count - 1]; held.time += 1.2f; result.Add(held);
            path.Clear();
            Line(path, P(0,60), P(0,DockRearZ + AxleFromRear), 3.1f);
            Append(result, path, true);
            return result;
        }

        static List<TimedPose> BuildDeparture()
        {
            var path = new List<Sample>();
            Line(path, P(0,DockRearZ + AxleFromRear), P(0,48), 4.8f);
            Bend(path, P(0,48), Vector3.forward, P(-20,68), Vector3.left, 5.8f, 4.5f);
            Line(path, P(-20,68), P(-100,68), 7);
            var result = new List<TimedPose>();
            Append(result, path, false);
            return result;
        }

        static Vector3 P(float x, float z) => new Vector3(x,0,z);
        static void Line(List<Sample> path, Vector3 from, Vector3 to, float speed)
        {
            int steps = Mathf.Max(2, Mathf.CeilToInt(Vector3.Distance(from,to) / .22f));
            for (int i=0;i<=steps;i++)
                Add(path, Vector3.Lerp(from,to,i/(float)steps), (to-from).normalized, speed);
        }
        static void Bend(List<Sample> path, Vector3 from, Vector3 startDirection, Vector3 to, Vector3 endDirection, float handle, float speed)
        {
            var p = new[] { from, from+startDirection*handle, from+startDirection*handle*2,
                to-endDirection*handle*2, to-endDirection*handle, to };
            for(int i=0;i<=180;i++)
            {
                float t=i/180f, s=1-t;
                Vector3 point=p[0]*(s*s*s*s*s)+p[1]*(5*s*s*s*s*t)+p[2]*(10*s*s*s*t*t)
                    +p[3]*(10*s*s*t*t*t)+p[4]*(5*s*t*t*t*t)+p[5]*(t*t*t*t*t);
                Vector3 tangent=(p[1]-p[0])*(5*s*s*s*s)+(p[2]-p[1])*(20*s*s*s*t)
                    +(p[3]-p[2])*(30*s*s*t*t)+(p[4]-p[3])*(20*s*t*t*t)+(p[5]-p[4])*(5*t*t*t*t);
                Add(path,point,tangent.normalized,speed);
            }
        }
        static void Add(List<Sample> path, Vector3 point, Vector3 forward, float speed)
        {
            if(path.Count>0 && (path[path.Count-1].axle-point).sqrMagnitude<.000001f) return;
            path.Add(new Sample { axle=point, forward=forward, speed=speed });
        }

        static void Append(List<TimedPose> result, List<Sample> path, bool reversing)
        {
            var hitch=new Vector3[path.Count];
            var headings=new float[path.Count];
            for(int i=0;i<path.Count;i++) hitch[i]=path[i].axle+path[i].forward*(reversing?-Wheelbase:Wheelbase);
            for(int i=0;i<path.Count;i++)
            {
                Vector3 tangent=(hitch[Mathf.Min(i+1,path.Count-1)]-hitch[Mathf.Max(0,i-1)])*(reversing?-1:1);
                headings[i]=Mathf.Atan2(tangent.x,tangent.z)*Mathf.Rad2Deg;
            }
            float time=result.Count==0?0:result[result.Count-1].time;
            for(int i=0;i<path.Count;i++)
            {
                if(i>0) time+=Vector3.Distance(path[i-1].axle,path[i].axle)/((path[i-1].speed+path[i].speed)*.5f);
                Vector3 forward=path[i].forward*(reversing?-1:1);
                float yaw=Mathf.Atan2(forward.x,forward.z)*Mathf.Rad2Deg;
                int previous=Mathf.Max(0,i-1), next=Mathf.Min(path.Count-1,i+1);
                float distance=Vector3.Distance(hitch[previous],hitch[next]);
                float curvature=distance>.001f?Mathf.DeltaAngle(headings[previous],headings[next])*Mathf.Deg2Rad/distance:0;
                result.Add(new TimedPose { time=time, pose=new Pose {
                    position=path[i].axle-forward*AxleFromRear,
                    rotation=Quaternion.Euler(0,yaw,0),
                    articulation=Mathf.DeltaAngle(yaw,headings[i]),
                    steering=Mathf.Clamp(Mathf.Atan(curvature*6.605f)*Mathf.Rad2Deg,-38,38),
                    reversing=reversing } });
            }
        }

        static Pose Evaluate(List<TimedPose> route, float progress, Vector3 dock)
        {
            float time=Mathf.Clamp01(progress)*route[route.Count-1].time;
            int lo=0,hi=route.Count-1;
            while(lo+1<hi) { int mid=(lo+hi)/2; if(route[mid].time<=time)lo=mid;else hi=mid; }
            var a=route[lo];var b=route[hi];float t=b.time>a.time?(time-a.time)/(b.time-a.time):1;
            return new Pose {
                position=Vector3.Lerp(a.pose.position,b.pose.position,t)+dock-new Vector3(0,0,DockRearZ),
                rotation=Quaternion.Slerp(a.pose.rotation,b.pose.rotation,t),
                articulation=Mathf.LerpAngle(a.pose.articulation,b.pose.articulation,t),
                steering=Mathf.Lerp(a.pose.steering,b.pose.steering,t),
                reversing=t<1?a.pose.reversing:b.pose.reversing
            };
        }
    }
}
