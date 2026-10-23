using UnityEngine;

namespace OneShift.RackLab
{
    [ExecuteAlways]
    [RequireComponent(typeof(BoxCollider))]
    public sealed class WarehouseLightSwitch : MonoBehaviour
    {
        public WarehouseLightRow Row;
        public Transform Lever;
        public Renderer Indicator;
        public TextMesh StateLabel;
        public float OnAngle = -33f;
        public float OffAngle = 33f;
        public bool IsOn => Row != null && Row.IsOn;
        public string Prompt => Row == null ? "Lighting switch" :
            "Row " + Row.RowNumber + " / " + Row.RowLabel.ToLowerInvariant() +
            " lights " + (IsOn ? "ON" : "OFF") + ". Switch " + (IsOn ? "off" : "on");

        WarehouseLightRow subscribedRow;
        MaterialPropertyBlock properties;
        AudioSource mechanismAudio;
        AudioClip mechanismClip;

        void OnEnable()
        {
            Subscribe();
            Refresh(true);
        }

        void OnDisable()
        {
            if (subscribedRow != null) subscribedRow.StateChanged -= RowChanged;
            subscribedRow = null;
            if (mechanismAudio != null) mechanismAudio.Stop();
        }

        void OnValidate() => Refresh(true);

        void Subscribe()
        {
            if (subscribedRow == Row) return;
            if (subscribedRow != null) subscribedRow.StateChanged -= RowChanged;
            subscribedRow = Row;
            if (subscribedRow != null) subscribedRow.StateChanged += RowChanged;
        }

        void RowChanged(bool value) => Refresh(!Application.isPlaying);

        void Update()
        {
            if (!Application.isPlaying || !Application.isFocused) return;
            Subscribe();
            if (Lever != null)
                Lever.localRotation = Quaternion.RotateTowards(Lever.localRotation,
                    Quaternion.Euler(IsOn ? OnAngle : OffAngle, 0, 0), Time.deltaTime * 880f);
        }

        // The walk controller owns the reach/occlusion check before calling this.
        public void Toggle()
        {
            if (Row == null) return;
            Subscribe();
            Row.Toggle();
            Refresh(!Application.isPlaying);
            if (Application.isPlaying) PlayMechanism();
        }

        public void Refresh(bool snapLever = true)
        {
            Subscribe();
            if (Lever != null && snapLever)
                Lever.localRotation = Quaternion.Euler(IsOn ? OnAngle : OffAngle, 0, 0);
            if (StateLabel != null) StateLabel.text = IsOn ? "ON" : "OFF";
            if (Indicator == null) return;
            if (properties == null) properties = new MaterialPropertyBlock();
            Indicator.GetPropertyBlock(properties);
            properties.SetColor("_BaseColor", IsOn ? new Color(.20f, .47f, .21f) : new Color(.055f, .09f, .055f));
            properties.SetColor("_EmissionColor", IsOn ? new Color(.35f, 1.8f, .30f) : Color.black);
            Indicator.SetPropertyBlock(properties);
        }

        void PlayMechanism()
        {
            if (mechanismAudio == null)
            {
                mechanismAudio = gameObject.AddComponent<AudioSource>();
                mechanismAudio.playOnAwake = false;
                mechanismAudio.spatialBlend = 1;
                mechanismAudio.rolloffMode = AudioRolloffMode.Logarithmic;
                mechanismAudio.minDistance = .55f;
                mechanismAudio.maxDistance = 7;
                mechanismAudio.dopplerLevel = 0;
                mechanismAudio.volume = .30f;
            }
            if (mechanismClip == null)
            {
                // A short spring-contact click, synthesized locally without an asset dependency.
                const int rate = 44100;
                var samples = new float[(int)(rate * .065f)];
                uint noise = 1147;
                for (int i = 0; i < samples.Length; i++)
                {
                    float t = (float)i / rate;
                    noise = unchecked(noise * 1664525u + 1013904223u);
                    float random = (noise & 65535) / 32767.5f - 1;
                    float first = Mathf.Exp(-t * 235f);
                    float second = t < .014f ? 0 : Mathf.Exp(-(t - .014f) * 290f) * .55f;
                    samples[i] = (random * .44f + Mathf.Sin(t * 16400f) * .19f) * (first + second);
                }
                mechanismClip = AudioClip.Create("Industrial switch contact", samples.Length, 1, rate, false);
                mechanismClip.hideFlags = HideFlags.DontSave;
                mechanismClip.SetData(samples, 0);
            }
            mechanismAudio.pitch = IsOn ? 1 : .91f;
            mechanismAudio.PlayOneShot(mechanismClip);
        }

        void OnDestroy()
        {
            if (mechanismClip == null) return;
            if (Application.isPlaying) Destroy(mechanismClip);
            else DestroyImmediate(mechanismClip);
        }
    }
}
