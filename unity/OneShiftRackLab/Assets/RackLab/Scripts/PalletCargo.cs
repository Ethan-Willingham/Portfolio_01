using UnityEngine;

namespace OneShift.RackLab
{
    // A strapped load and its pallet are one physical package. Fork contact is
    // ordinary collision: this component never attaches a package to a truck.
    [DisallowMultipleComponent, RequireComponent(typeof(Rigidbody))]
    public sealed class PalletCargo : MonoBehaviour
    {
        public string description = "Empty pallet";
        [Min(1)] public float palletMass = 25;
        [Min(0)] public float cargoMass;
        public Vector3 cargoCentre = new Vector3(0, .82365f, 0);
        public Vector3 cargoDimensions = new Vector3(.972f, 1.406f, 1.172f);
        public float TotalMass => palletMass + cargoMass;
        public Rigidbody Body { get; private set; }

        void Awake() { ApplyMassProperties(); }

        public void ApplyMassProperties()
        {
            Body = GetComponent<Rigidbody>();
            palletMass = Mathf.Max(1, palletMass);
            cargoMass = Mathf.Max(0, cargoMass);
            Vector3 palletCentre = new Vector3(0, PalletRackBay.PalletHeight * .5f, 0);
            Vector3 centre = (palletCentre * palletMass + cargoCentre * cargoMass) / TotalMass;
            Body.mass = TotalMass;
            Body.centerOfMass = centre;
            Body.isKinematic = false;
            Body.useGravity = true;
            Body.constraints = RigidbodyConstraints.None;
            Body.interpolation = RigidbodyInterpolation.Interpolate;
            Body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            Body.linearDamping = .015f;
            Body.angularDamping = .04f;
            Body.maxAngularVelocity = 10;
            Body.maxDepenetrationVelocity = 1.5f;
            Body.solverIterations = 16;
            Body.solverVelocityIterations = 8;

            // Weight the wood and the packaged cargo separately. A large light
            // carton must not outweigh a small dense payload merely by volume.
            Matrix4x4 inertia = Matrix4x4.zero;
            inertia.m33 = 1;
            AddBoxInertia(ref inertia, palletMass, palletCentre - centre,
                new Vector3(PalletRackBay.PalletWidth, PalletRackBay.PalletHeight, PalletRackBay.PalletDepth));
            AddBoxInertia(ref inertia, cargoMass, cargoCentre - centre, cargoDimensions);
            Diagonalize(inertia, out var moments, out var rotation);
            Body.inertiaTensorRotation = rotation;
            Body.inertiaTensor = moments;
        }

        static void AddBoxInertia(ref Matrix4x4 tensor, float mass, Vector3 d, Vector3 size)
        {
            if (mass <= 0) return;
            tensor.m00 += mass * ((size.y * size.y + size.z * size.z) / 12 + d.y * d.y + d.z * d.z);
            tensor.m11 += mass * ((size.x * size.x + size.z * size.z) / 12 + d.x * d.x + d.z * d.z);
            tensor.m22 += mass * ((size.x * size.x + size.y * size.y) / 12 + d.x * d.x + d.y * d.y);
            tensor.m01 -= mass * d.x * d.y; tensor.m10 = tensor.m01;
            tensor.m02 -= mass * d.x * d.z; tensor.m20 = tensor.m02;
            tensor.m12 -= mass * d.y * d.z; tensor.m21 = tensor.m12;
        }

        static void Diagonalize(Matrix4x4 tensor, out Vector3 moments, out Quaternion rotation)
        {
            var axes = Matrix4x4.identity;
            for (int step = 0; step < 18; step++)
            {
                int p = 0, q = 1;
                if (Mathf.Abs(tensor[0, 2]) > Mathf.Abs(tensor[p, q])) { p = 0; q = 2; }
                if (Mathf.Abs(tensor[1, 2]) > Mathf.Abs(tensor[p, q])) { p = 1; q = 2; }
                if (Mathf.Abs(tensor[p, q]) < .00001f) break;
                float angle = .5f * Mathf.Atan2(2 * tensor[p, q], tensor[q, q] - tensor[p, p]);
                float c = Mathf.Cos(angle), s = Mathf.Sin(angle);
                var jacobi = Matrix4x4.identity;
                jacobi[p, p] = jacobi[q, q] = c;
                jacobi[p, q] = s; jacobi[q, p] = -s;
                tensor = jacobi.transpose * tensor * jacobi;
                axes = axes * jacobi;
            }
            moments = new Vector3(Mathf.Max(.001f, tensor.m00), Mathf.Max(.001f, tensor.m11), Mathf.Max(.001f, tensor.m22));
            rotation = Quaternion.LookRotation(axes.GetColumn(2), axes.GetColumn(1));
        }
    }
}
