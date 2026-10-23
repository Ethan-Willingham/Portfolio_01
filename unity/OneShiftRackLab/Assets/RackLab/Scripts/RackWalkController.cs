using UnityEngine;

namespace OneShift.RackLab
{
    [RequireComponent(typeof(CharacterController))]
    public sealed class RackWalkController : MonoBehaviour
    {
        public const float StandingHeight = 1.78f;
        public const float StandingEyeHeight = 1.65f;
        public const float BodyRadius = .25f;
        public const float HorizontalFieldOfView = 90f;
        public Camera eyes;
        public Vector3 spawnPosition;
        public float walkSpeed = 1.5f;
        public float runSpeed = 4.2f;
        public float sensitivity = 1.8f;
        CharacterController motor;
        float pitch, verticalSpeed;
        bool captured;
        bool hadFocus = true;
        GUIStyle title, instructions, small;
        RackWearVariant target;

        void Awake()
        {
            motor = GetComponent<CharacterController>();
            spawnPosition = transform.position;
            Application.targetFrameRate = 120;
            RefreshPerspective();
        }

        public void RefreshPerspective()
        {
            // Keep wide Editor windows from stretching the view and making the room feel tiny.
            eyes.fieldOfView = Mathf.Min(65f, Camera.HorizontalToVerticalFieldOfView(HorizontalFieldOfView, eyes.aspect));
        }

        void LateUpdate() { RefreshPerspective(); }

        void OnDisable() { Capture(false); }
        void OnApplicationFocus(bool focus)
        {
            hadFocus = focus;
            if (!focus) Capture(false);
        }

        void Capture(bool value)
        {
            captured = value;
            Cursor.lockState = value ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !value;
        }

        void Update()
        {
            if (Input.GetKeyDown(KeyCode.Escape)) Capture(false);
            if (hadFocus && Input.GetMouseButtonDown(0)) Capture(true);
            if (captured && hadFocus)
            {
                transform.Rotate(0, Input.GetAxisRaw("Mouse X") * sensitivity, 0);
                pitch = Mathf.Clamp(pitch - Input.GetAxisRaw("Mouse Y") * sensitivity, -85, 85);
                eyes.transform.localRotation = Quaternion.Euler(pitch, 0, 0);
                var input = Vector2.ClampMagnitude(new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical")), 1);
                var speed = Input.GetKey(KeyCode.LeftShift) ? runSpeed : walkSpeed;
                var move = (transform.right * input.x + transform.forward * input.y) * speed;
                if (motor.isGrounded && verticalSpeed < 0) verticalSpeed = -2;
                if (motor.isGrounded && Input.GetKeyDown(KeyCode.Space)) verticalSpeed = 4.8f;
                verticalSpeed += Physics.gravity.y * Time.deltaTime;
                motor.Move((move + Vector3.up * verticalSpeed) * Time.deltaTime);
                if (Input.GetKeyDown(KeyCode.R)) ResetPosition();
                if (Input.GetKeyDown(KeyCode.E) && target != null) target.Cycle();
            }
            else if (!motor.isGrounded)
            {
                verticalSpeed += Physics.gravity.y * Time.deltaTime;
                motor.Move(Vector3.up * verticalSpeed * Time.deltaTime);
            }
            if (transform.position.y < -10) ResetPosition();
            target = null;
            if (Physics.Raycast(eyes.transform.position, eyes.transform.forward, out var hit, 5f))
                target = hit.collider.GetComponentInParent<RackWearVariant>();
        }

        public void ResetPosition()
        {
            motor.enabled = false;
            transform.SetPositionAndRotation(spawnPosition, Quaternion.identity);
            motor.enabled = true;
            pitch = verticalSpeed = 0;
            eyes.transform.localRotation = Quaternion.identity;
        }

        void OnGUI()
        {
            if (title == null)
            {
                title = new GUIStyle(GUI.skin.label) { fontSize = 19, fontStyle = FontStyle.Bold };
                instructions = new GUIStyle(GUI.skin.label) { fontSize = 15 };
                small = new GUIStyle(GUI.skin.label) { fontSize = 13 };
                var font = Resources.Load<Font>("RackLabFont");
                if (font != null) title.font = instructions.font = small.font = font;
                title.normal.textColor = instructions.normal.textColor = small.normal.textColor = new Color(.94f, .91f, .83f);
            }
            GUI.color = new Color(.08f, .10f, .09f, .88f);
            GUI.DrawTexture(new Rect(18, 18, 362, 71), Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(18, Screen.height - 72, 690, 52), Texture2D.whiteTexture);
            GUI.color = Color.white;
            GUI.Label(new Rect(32, 26, 340, 28), "ONE SHIFT / RACK FLOOR", title);
            GUI.Label(new Rect(32, 55, 340, 25), "Pallet storage   /   Floor + two beam levels", small);
            GUI.Label(new Rect(32, Screen.height - 67, 670, 25), "WASD move   |   Mouse look   |   Shift run   |   Space jump   |   Esc cursor", small);
            GUI.Label(new Rect(32, Screen.height - 44, 660, 24), captured ? (target != null ? "E: change this rack's wear   |   R: return to entrance" : "Walk up to a rack to inspect its finish.   R: return to entrance") : "Click inside the game to walk around.", small);
            if (captured)
            {
                GUI.color = new Color(.94f,.91f,.83f,.75f);
                GUI.DrawTexture(new Rect(Screen.width/2f - 2, Screen.height/2f - 2, 4, 4), Texture2D.whiteTexture);
                GUI.color = Color.white;
            }
        }
    }
}
