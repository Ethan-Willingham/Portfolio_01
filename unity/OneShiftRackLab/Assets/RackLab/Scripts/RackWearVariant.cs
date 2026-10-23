using UnityEngine;

namespace OneShift.RackLab
{
    public sealed class RackWearVariant : MonoBehaviour
    {
        [Range(0,2)] public int condition;
        public Material[] finishes;
        public TextMesh conditionLabel;
        static readonly string[] Names = { "CLEAN", "USED", "WORN" };

        void Start() { Apply(); }
        public void Cycle() { condition = (condition + 1) % 3; Apply(); }
        public void Apply()
        {
            if (finishes == null || finishes.Length != 3) return;
            condition = Mathf.Clamp(condition, 0, 2);
            foreach (var r in GetComponentsInChildren<MeshRenderer>(true))
                if (r.gameObject.name.StartsWith("Rack_LOD")) r.sharedMaterial = finishes[condition];
            if (conditionLabel != null) conditionLabel.text = Names[condition];
        }
    }
}
