using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    // Exercise the production interactions on an independent, temporary copy.
    // This does not advance the real delivery or change the saved warehouse.
    public static class WarehouseFrontOfficeValidation
    {
        const BindingFlags PrivateInstance = BindingFlags.Instance | BindingFlags.NonPublic;

        [MenuItem("One Shift/Validate front office interactions")]
        public static string ValidateAndSave()
        {
            var original = Object.FindFirstObjectByType<WarehouseOfficeDoor>();
            if (original == null) throw new InvalidOperationException("Install the front office first.");
            GameObject copy = null, obstruction = null;
            float originalScale = Time.timeScale;
            var lines = new List<string> { "Production office components on a temporary copy. Original office and stock unchanged." };
            void Require(bool value, string label)
            {
                if (!value) throw new InvalidOperationException("Office interaction validation failed: " + label);
                lines.Add("PASS " + label);
            }

            try
            {
                copy = Object.Instantiate(original.transform.root.gameObject);
                copy.name = "Temporary office interaction validation";
                copy.transform.position += new Vector3(1000, 0, 1000);
                var door = copy.GetComponentInChildren<WarehouseOfficeDoor>(true);
                var service = copy.GetComponentInChildren<WarehouseParcelService>(true);
                Require(service != null && service.parcels.Length == 3 && service.deskPlaces.Length == 3,
                    "Three independent small parcels and three receiving positions");
                Require(service.parcels.All(p => p != null && p.transform.IsChildOf(copy.transform) && p.service == service)
                    && service.deskPlaces.All(p => p != null && p.IsChildOf(copy.transform)),
                    "Validation references point only to copied office objects");

                var start = typeof(WarehouseParcelService).GetMethod("Start", PrivateInstance);
                var tick = typeof(WarehouseParcelService).GetMethod("Update", PrivateInstance);
                var timer = typeof(WarehouseParcelService).GetField("elapsed", PrivateInstance);
                Require(start != null && tick != null && timer != null, "Production parcel lifecycle methods available");
                start.Invoke(service, null);
                Require(!service.Arrived && service.ReceivedCount == 0 && service.parcels.All(p => !p.gameObject.activeSelf),
                    "No parcel exists visibly before the delivery");
                service.PickUp(service.parcels[0]);
                Require(service.Carried == null, "Cannot collect a parcel before its arrival");

                service.AdvanceDelivery(service.arrivalSeconds + 1, false);
                Require(!service.Arrived && (float)timer.GetValue(service) == 0,
                    "Inactive delivery ignores a full arrival interval");
                service.AdvanceDelivery(-1, true);
                Require((float)timer.GetValue(service) == 0, "Negative elapsed time cannot reverse the delivery clock");
                service.AdvanceDelivery(service.arrivalSeconds * .5f, true);
                Require(!service.Arrived, "Half of the active interval does not deliver early");
                Time.timeScale = 0;
                float pausedTimer = (float)timer.GetValue(service);
                tick.Invoke(service, null);
                Require(!service.Arrived && (float)timer.GetValue(service) == pausedTimer,
                    "The real Update gate freezes the delivery while time is paused");
                service.AdvanceDelivery(service.arrivalSeconds + 1, false);
                Require(!service.Arrived && (float)timer.GetValue(service) == pausedTimer,
                    "Inactive time does not consume the remaining delivery interval");
                Time.timeScale = 1;
                if (!Application.isFocused)
                {
                    tick.Invoke(service, null);
                    Require(!service.Arrived && (float)timer.GetValue(service) == pausedTimer,
                        "The real Update gate freezes delivery when the application is unfocused");
                }
                service.AdvanceDelivery(service.arrivalSeconds * .5f, true);
                Require(service.Arrived && service.parcels.All(p => p.gameObject.activeSelf),
                    "Completing the active interval reveals exactly the three parcels");
                float arrivalTimer = (float)timer.GetValue(service);
                service.AdvanceDelivery(service.arrivalSeconds * 10, true);
                Require((float)timer.GetValue(service) == arrivalTimer && service.ReceivedCount == 0,
                    "The bounded delivery fires once without automatically receiving stock");

                for (int i = 0; i < service.parcels.Length; i++)
                {
                    var parcel = service.parcels[i];
                    var colliders = parcel.GetComponentsInChildren<Collider>();
                    Require(colliders.Length > 0, "Parcel " + (i + 1) + " has an interaction collider");
                    service.PickUp(parcel);
                    Require(service.Carried == parcel && colliders.All(c => !c.enabled),
                        "Carried parcel " + (i + 1) + " cannot collide with the player");
                    service.PickUp(service.parcels[(i + 1) % service.parcels.Length]);
                    Require(service.Carried == parcel, "Only one parcel can be carried at once");
                    service.Receive();
                    Require(service.Carried == null && parcel.Received && service.ReceivedCount == i + 1
                        && Vector3.Distance(parcel.transform.position, service.deskPlaces[parcel.index].position) < .001f
                        && colliders.All(c => c.enabled), "Parcel " + (i + 1) + " rests on the desk and counts once");
                    service.Receive();
                    service.PickUp(parcel);
                    Require(service.ReceivedCount == i + 1 && service.Carried == null,
                        "Repeated use cannot duplicate or recollect a received parcel");
                }

                door.doorwayBlocker.enabled = true;
                door.leaf.localRotation = Quaternion.identity;
                Physics.SyncTransforms();
                door.Toggle();
                Require(door.IsOpen && !door.doorwayBlocker.enabled, "Opening clears the doorway blocker");
                obstruction = new GameObject("Temporary doorway occupant");
                obstruction.transform.position = door.doorwayBlocker.transform.TransformPoint(door.doorwayBlocker.center)
                    - Vector3.up * door.doorwayBlocker.size.y * .5f;
                var controller = obstruction.AddComponent<CharacterController>();
                controller.height = RackWalkController.StandingHeight;
                controller.radius = RackWalkController.BodyRadius;
                controller.center = Vector3.up * (controller.height * .5f);
                Physics.SyncTransforms();
                door.Toggle();
                Require(door.IsOpen && !door.doorwayBlocker.enabled, "Door refuses to close around a standing player");
                Object.DestroyImmediate(obstruction);
                obstruction = null;
                Physics.SyncTransforms();
                door.Toggle();
                Require(!door.IsOpen && door.doorwayBlocker.enabled, "A clear doorway can close again");
            }
            finally
            {
                Time.timeScale = originalScale;
                if (obstruction != null) Object.DestroyImmediate(obstruction);
                if (copy != null) Object.DestroyImmediate(copy);
                Physics.SyncTransforms();
            }

            string report = string.Join("\n", lines) + "\n";
            Directory.CreateDirectory("Assets/RackLab/Reports");
            File.WriteAllText("Assets/RackLab/Reports/warehouse-office-interaction-validation.txt", report);
            AssetDatabase.Refresh();
            Debug.Log(report);
            return report;
        }
    }
}
