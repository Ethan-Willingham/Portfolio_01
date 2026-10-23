using UnityEngine;

namespace OneShift.RackLab
{
    // Metres. Floor plus two beam levels, with two pallet locations on each level.
    public sealed class PalletRackBay : MonoBehaviour
    {
        public const float FrameHeight = 4.8768f;
        public const float BeamPitch = 1.8288f;
        public const float DeckAboveBeam = .011f;
        public const float PalletWidth = 1.016f;
        public const float PalletDepth = 1.2192f;
        public const float PalletHeight = .12065f;
        public const float LoadedHeight = 1.52865f;
        public const float PalletCenterOffset = .576f;
        public Transform[] palletPositions;
        public GameObject[] exampleLoads;
    }
}
