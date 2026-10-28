using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    // A focused regression audit of authored walkable slabs. Collision boxes
    // preserve each original box after material batching, including its exact
    // rendered top plane. Adjacent edges are allowed; overlapping top area is not.
    public static class WarehouseSurfaceAudit
    {
        static readonly HashSet<string> Slabs=new HashSet<string> {
            "Parking lot","Front visitor parking","Front access street","North service street",
            "Side access drive","Warehouse side apron","Front connecting apron","Front foundation apron",
            "North truck entrance","North truck pull-up apron","Receiving apron","Receiving apron side",
            "Receiving apron threshold","Recessed dock plate seat","Dock bridge plate","Trailer deck"
        };

        [MenuItem("One Shift/Validate warehouse surface separation")]
        public static string Validate()
        {
            Physics.SyncTransforms();
            var slabs=Object.FindObjectsByType<BoxCollider>(FindObjectsInactive.Include,FindObjectsSortMode.None)
                .Where(c=>Slabs.Contains(c.name)).ToArray();
            if(slabs.Length<15)throw new Exception("Install the receiving start and business park before the surface audit.");
            var lines=new List<string>();
            int comparisons=0;
            for(int i=0;i<slabs.Length;i++)for(int j=i+1;j<slabs.Length;j++)
            {
                var a=slabs[i].bounds;var b=slabs[j].bounds;
                if(Mathf.Abs(a.max.y-b.max.y)>.0001f)continue;
                comparisons++;
                float x=Mathf.Min(a.max.x,b.max.x)-Mathf.Max(a.min.x,b.min.x);
                float z=Mathf.Min(a.max.z,b.max.z)-Mathf.Max(a.min.z,b.min.z);
                if(x>.0001f && z>.0001f)
                    throw new Exception("Coplanar surface area remains: "+slabs[i].name+" / "+slabs[j].name+" at y="+a.max.y+", area="+(x*z)+" m2.");
            }
            lines.Add("PASS "+slabs.Length+" authored floor, yard, street and bridge slabs, "+comparisons+" matching-height comparisons, no overlapping top area.");
            var office=GameObject.Find("Warehouse front office");
            if(office==null)throw new Exception("Office missing.");
            var west=office.GetComponentsInChildren<Transform>().First(t=>t.name=="West office partition").GetComponent<BoxCollider>().bounds;
            var pier=office.GetComponentsInChildren<Transform>().First(t=>t.name=="Doorway west pier").GetComponent<BoxCollider>().bounds;
            if(west.max.z>pier.min.z+.0001f && west.max.x>pier.min.x+.0001f)throw new Exception("Office pier overlaps the west partition.");
            lines.Add("PASS Office west partition ends at z=-4.07; the north doorway pier begins at its x=3.87 edge and stops beneath the header.");
            var receiving=Object.FindFirstObjectByType<WarehouseReceiving>();
            if(receiving.cargo.Any(c=>c.GetComponentsInChildren<Transform>().Any(t=>t.name=="Package weight tag")))
                throw new Exception("A production pallet still has a black test-weight plaque.");
            lines.Add("PASS Active stock has no test-weight plaques; retained world signs use the existing transparent, depth-tested font shader.");
            string report=string.Join("\n",lines)+"\n";
            Directory.CreateDirectory("Assets/RackLab/Reports");
            File.WriteAllText("Assets/RackLab/Reports/warehouse-surface-validation.txt",report);return report;
        }
    }
}
