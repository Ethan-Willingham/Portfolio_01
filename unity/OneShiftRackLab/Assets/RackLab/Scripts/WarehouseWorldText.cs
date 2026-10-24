using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace OneShift.RackLab
{
    // TextMesh normally shares the GUI font material, which ignores scene
    // depth. Give world labels their own materials without changing IMGUI.
    public sealed class WarehouseWorldText : MonoBehaviour
    {
        readonly Dictionary<Font, Material> fontMaterials = new Dictionary<Font, Material>();
        readonly List<Binding> bindings = new List<Binding>();

        struct Binding
        {
            public Renderer renderer;
            public Material original;
            public Material replacement;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Install()
        {
            SceneManager.sceneLoaded -= SceneLoaded;
            SceneManager.sceneLoaded += SceneLoaded;
            for (int i = 0; i < SceneManager.sceneCount; i++) InstallScene(SceneManager.GetSceneAt(i));
        }

        static void SceneLoaded(Scene scene, LoadSceneMode mode) { InstallScene(scene); }

        static void InstallScene(Scene scene)
        {
            if (!scene.IsValid() || !scene.isLoaded) return;
            foreach (var root in scene.GetRootGameObjects())
                if (root.GetComponentInChildren<WarehouseWorldText>(true) != null) return;
            var node = new GameObject("World text depth materials") { hideFlags = HideFlags.DontSave };
            SceneManager.MoveGameObjectToScene(node, scene);
            node.AddComponent<WarehouseWorldText>().Apply(scene);
        }

        void OnEnable() { Font.textureRebuilt += RefreshAtlas; }
        void OnDisable() { Font.textureRebuilt -= RefreshAtlas; }

        void Apply(Scene scene)
        {
            var shader = Resources.Load<Shader>("WarehouseWorldText");
            if (shader == null)
            {
                Debug.LogError("Warehouse world text shader is missing from Resources.");
                return;
            }
            foreach (var root in scene.GetRootGameObjects())
            foreach (var text in root.GetComponentsInChildren<TextMesh>(true))
            {
                var font = text.font;
                var renderer = text.GetComponent<Renderer>();
                if (font == null || renderer == null) continue;
                if (!fontMaterials.TryGetValue(font, out var material))
                {
                    material = new Material(shader)
                    {
                        name = font.name + " world text",
                        hideFlags = HideFlags.DontSave,
                        mainTexture = font.material.mainTexture
                    };
                    fontMaterials.Add(font, material);
                }
                bindings.Add(new Binding { renderer = renderer, original = renderer.sharedMaterial, replacement = material });
                renderer.sharedMaterial = material;
            }
        }

        void RefreshAtlas(Font font)
        {
            if (font != null && fontMaterials.TryGetValue(font, out var material))
                material.mainTexture = font.material.mainTexture;
        }

        void OnDestroy()
        {
            Font.textureRebuilt -= RefreshAtlas;
            foreach (var binding in bindings)
                if (binding.renderer != null && binding.renderer.sharedMaterial == binding.replacement)
                    binding.renderer.sharedMaterial = binding.original;
            foreach (var material in fontMaterials.Values)
            {
                if (Application.isPlaying) Destroy(material);
                else DestroyImmediate(material);
            }
            bindings.Clear();
            fontMaterials.Clear();
        }
    }
}
