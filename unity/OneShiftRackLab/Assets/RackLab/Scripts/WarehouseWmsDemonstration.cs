using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using L = OneShift.RackLab.WarehouseWmsLedger;

namespace OneShift.RackLab
{
    public sealed partial class WarehouseWmsRuntime
    {
        [Serializable] public sealed class DemonstrationState
        {
            public string id,title,summary,phase,step,stepTitle,instruction,action;
            public string targetCode="",targetLabel="",documentId="",cartonId="",sourceBin="",destinationBin="",tile="";
            public int completed,total,cartonTotal,expected,received,transferred,picked,loaded,shipped;
            public bool complete,targetVisible;
            public float targetDistance;
            public float[] targetPosition=Array.Empty<float>(),targetViewport=Array.Empty<float>();
        }
        public string DemonstrationId { get; private set; }="";
        public bool DemonstrationActive=>!string.IsNullOrEmpty(DemonstrationId);
        readonly List<string> demoCartons=new List<string>();
        readonly Dictionary<string,string> demoDestinations=new Dictionary<string,string>();
        string demoDocument="";

        static string NormalizeDemonstration(string id)
        {return id=="receive"||id=="transfer"||id=="pick-ship"?id:"";}

        // These are authored opening conditions, just like the Sandbox seed.
        // The guide never moves freight or posts a receipt, transfer, pick or load.
        void SeedDemonstration()
        {
            ForkliftOwned=false;if(forklift!=null)forklift.SetActive(false);
            if(DemonstrationId=="receive")
            {
                demoDocument=AddPurchase("tape",2);
                AddDemoCarton("tape","REC-02",0,"C03-01-01",demoDocument);
                AddDemoCarton("tape","REC-02",1,"C03-01-02",demoDocument);
                Walking.SetSpawnPose(new Vector3(-3.9f,.025f,7.8f),Quaternion.identity);
                Notice("Two supplier cartons are waiting in REC-02. Your guided receiving demonstration is ready.",true);
            }
            else if(DemonstrationId=="transfer")
            {
                AddDemoCarton("towels","C01-01-01",0,"C01-01-02","");
                SpawnAtDemoBin("C01-01-01");
                Notice("Move one carton between two labelled pick locations. Every confirmation updates the same office ledger.",true);
            }
            else
            {
                AddDemoCarton("tape","C03-01-01",0,"STAGE-01","");
                demoDocument=AddSales("Miller Motor Works",new L.OrderLine("tape",1));
                if(!Ledger.ReleaseSalesOrder(demoDocument))throw new InvalidOperationException(Ledger.LastMessage);
                collectionOrder=demoDocument;dispatchAuthorization="";
                foreach(var door in FindLocalAll<WarehouseOfficeDoor>())if(!door.IsOpen)door.Toggle();
                SpawnAtDemoBin("C03-01-01");
                Notice(demoDocument+" is allocated for Miller Motor Works. Pick its carton, load the carrier and confirm departure.",true);
            }
        }
        void AddDemoCarton(string sku,string binId,int index,string destination,string purchase)
        {
            var bin=World.FindBin(binId);string id=NewCarton();
            if(bin==null)throw new InvalidOperationException("Demonstration bin missing: "+binId);
            var position=bin.PlacementPosition(index,WarehouseWmsWorld.CartonSize(Array.IndexOf(Sku,sku)));
            var body=MakeCarton(id,sku,position);body.rotation=bin.PlacementRotation;body.transform.SetPositionAndRotation(position,bin.PlacementRotation);
            bool posted=string.IsNullOrEmpty(purchase)?Ledger.SeedCarton(id,sku,binId):Ledger.ExpectCarton(id,sku,purchase);
            if(!posted)throw new InvalidOperationException(Ledger.LastMessage);
            if(!string.IsNullOrEmpty(purchase))World.SetCartonDocument(body,purchase);
            demoCartons.Add(id);demoDestinations.Add(id,destination);
        }
        void SpawnAtDemoBin(string id)
        {
            var bin=World.FindBin(id);var normal=bin.Label.Normal;normal.y=0;normal.Normalize();
            Vector3 position=bin.Label.ScanPoint+normal*1.35f;position.y=.025f;
            Walking.SetSpawnPose(position,Quaternion.LookRotation(-normal));
        }

        public DemonstrationState CaptureDemonstration()
        {
            if(!DemonstrationActive)return null;
            var d=new DemonstrationState{id=DemonstrationId,documentId=demoDocument,cartonTotal=demoCartons.Count};
            var cartons=demoCartons.Select(Ledger.FindCarton).Where(c=>c!=null).ToArray();
            d.expected=cartons.Count(c=>c.status==L.CartonStatus.Expected);
            d.received=DemonstrationId=="receive"?cartons.Length-d.expected:0;
            d.transferred=cartons.Count(c=>c.status==L.CartonStatus.Available&&c.binId==demoDestinations[c.id]);
            var order=Ledger.FindSales(demoDocument);
            if(order!=null){d.picked=order.lines.Sum(l=>l.picked);d.loaded=order.lines.Sum(l=>l.loaded);d.shipped=order.lines.Sum(l=>l.shipped);}
            if(DemonstrationId=="receive")
            {
                d.title="Receive and put away";d.summary="Match a delivery to its purchase order, then make received stock available in storage.";
                d.total=4;d.completed=d.received+d.transferred;d.phase=d.expected>0?"Receiving":"Putaway";
                if(d.expected>0)GuideDemoReceipt(d,PreferredDemoCarton(cartons,c=>c.status==L.CartonStatus.Expected));
                else
                {
                    var carton=PreferredDemoCarton(cartons,c=>c.binId!=demoDestinations[c.id]||!IsInBin(c.id,c.binId,out _));
                    if(carton==null)FinishDemo(d,"Both cartons received and put away","The PO is fully received. Two cartons are available in their confirmed storage bins.");
                    else GuideDemoMovement(d,carton,"transfer",demoDestinations[carton.id]);
                }
            }
            else if(DemonstrationId=="transfer")
            {
                d.title="Transfer inventory";d.summary="Move stock between labelled bins without changing the warehouse quantity.";
                d.total=1;d.completed=d.transferred;d.phase="Transfer";
                var carton=cartons[0];
                if(carton.binId==demoDestinations[carton.id]&&IsInBin(carton.id,carton.binId,out _))
                    FinishDemo(d,"Transfer confirmed","The carton is in its new bin, the audit trail records the move, and total stock is unchanged.");
                else GuideDemoMovement(d,carton,"transfer",demoDestinations[carton.id]);
            }
            else
            {
                d.title="Pick and ship";d.summary="Follow an allocated customer order from its pick face through an actual carrier collection.";
                d.total=3;d.completed=d.picked+d.loaded+d.shipped;d.phase=d.picked==0?"Picking":d.loaded==0?"Loading":"Dispatch";
                var carton=cartons[0];
                if(order.status==L.SalesStatus.Shipped)FinishDemo(d,"Customer shipment complete","Miller Motor Works' carton left with the carrier. Stock and payment posted once, after departure.");
                else if(carton.status==L.CartonStatus.Reserved)GuideDemoMovement(d,carton,"pick","STAGE-01");
                else if(carton.status==L.CartonStatus.Picked)GuideDemoMovement(d,carton,"ship","DISPATCH-01");
                else GuideDemoDeparture(d);
            }
            return d;
        }
        L.Carton PreferredDemoCarton(L.Carton[] cartons,Func<L.Carton,bool> predicate)
        {return cartons.FirstOrDefault(c=>c.id==Workflow.cartonId&&predicate(c))??cartons.FirstOrDefault(predicate);}
        void FinishDemo(DemonstrationState d,string title,string instruction)
        {d.complete=true;d.completed=d.total;d.phase="Complete";SetDemoStep(d,"complete",title,instruction,"Choose another demonstration");}
        void SetDemoStep(DemonstrationState d,string step,string title,string instruction,string action)
        {d.step=step;d.stepTitle=title;d.instruction=instruction;d.action=action;}
        bool DemoWorkflow(DemonstrationState d,string tile,string document="")
        {
            d.tile=tile;
            if(Workflow.tile!=tile)
            {
                string name=tile=="receive"?"Receive":tile=="transfer"?"Transfer":tile=="pick"?"Pick":"Ship";
                SetDemoStep(d,"open-task","Open "+name+" on the TC22","Right click to inspect the screen, then choose "+name+". Return to the floor to scan.","Right click / "+name);return false;
            }
            if(!string.IsNullOrEmpty(document)&&Workflow.orderId!=document)
            {
                SetDemoStep(d,"choose-document","Select "+document,"Inspect the TC22 and choose the prepared "+(tile=="receive"?"purchase":"sales")+" order, "+document+".","Right click / "+document);return false;
            }
            return true;
        }
        void GuideDemoReceipt(DemonstrationState d,L.Carton carton)
        {
            d.cartonId=carton.id;d.sourceBin=d.destinationBin="REC-02";
            if(!DemoWorkflow(d,"receive",demoDocument))return;
            if(Workflow.sourceBin!="REC-02"||Workflow.step=="source")
            {
                if(Workflow.step!="source")
                {SetDemoStep(d,"restart-source","Choose the receiving location","The demonstration delivery is in REC-02. Choose Receive and this PO again to correct the source.","Right click / Receive");return;}
                SetDemoStep(d,"source","Scan REC-02","Aim at the receiving location's barcode. Hold the left mouse button until it reads.","Hold left mouse");DemoTarget(d,"BIN:REC-02");return;
            }
            if(!IsInBin(carton.id,"REC-02",out _))
            {
                SetDemoStep(d,"restore-receiving","Keep the delivery in receiving","Place this carton fully inside REC-02 and release it before recording its receipt.",DemoIsHeld(carton)?"Release E / Set down":"Hold E / Carry");
                DemoTarget(d,DemoIsHeld(carton)?"BIN:REC-02":"CARTON:"+carton.id);return;
            }
            if(Workflow.step=="confirm"&&Workflow.cartonId==carton.id)
            {
                SetDemoStep(d,"confirm","Receive carton "+(d.received+1)+" of 2","Press Enter to post one carton against "+demoDocument+". A scan alone does not change stock.","Enter / Receive 1 CTN");DemoTarget(d,"CARTON:"+carton.id);return;
            }
            SetDemoStep(d,"carton","Scan carton "+(d.received+1)+" of 2","Read the carton handling label on "+carton.id+". The WMS checks its purchase-order reference.","Hold left mouse");DemoTarget(d,"CARTON:"+carton.id);
        }
        void GuideDemoMovement(DemonstrationState d,L.Carton carton,string tile,string destination)
        {
            d.cartonId=carton.id;d.sourceBin=carton.binId;d.destinationBin=destination;
            // If a confirmed box was moved again without a WMS transaction,
            // return it physically instead of asking for a same-bin transfer.
            if(tile=="transfer"&&carton.binId==destination)
            {
                SetDemoStep(d,"restore-placement","Restore the confirmed placement","The ledger already records "+destination+". Return the carton to that bin and release it.",DemoIsHeld(carton)?"Release E / Set down":"Hold E / Carry");
                DemoTarget(d,DemoIsHeld(carton)?"BIN:"+destination:"CARTON:"+carton.id);return;
            }
            if(!DemoWorkflow(d,tile,tile=="transfer"?"":demoDocument))return;
            if(Workflow.step=="source")
            {
                SetDemoStep(d,"source","Scan source "+carton.binId,"Read the location barcode for the carton being moved. This confirms where the stock is recorded.","Hold left mouse");DemoTarget(d,"BIN:"+carton.binId);return;
            }
            if(Workflow.sourceBin!=carton.binId)
            {SetDemoStep(d,"restart-source","Return to the correct source","Choose "+(tile=="transfer"?"Transfer":tile=="pick"?"Pick":"Ship")+" again and scan "+carton.binId+" for this carton.","Right click / Choose task");return;}
            if(Workflow.step=="carton")
            {
                SetDemoStep(d,"carton","Scan "+carton.id,"Read the carton handling label. The item barcode only looks up the product.","Hold left mouse");DemoTarget(d,"CARTON:"+carton.id);return;
            }
            if(Workflow.cartonId!=carton.id)
            {SetDemoStep(d,"restart-carton","Select the demonstration carton","Choose the task again, then scan source "+carton.binId+" and carton "+carton.id+".","Right click / Choose task");return;}
            bool held=DemoIsHeld(carton),placed=IsInBin(carton.id,destination,out _);
            if(tile=="ship"&&!Courier.ReadyForLoading)
            {
                SetDemoStep(d,"wait-carrier","The collection van is arriving","Leave the carton in staging until the carrier has parked and opened its rear doors. Return to the floor so the visit can continue.","Wait on the warehouse floor");DemoTarget(d,"BIN:STAGE-01");return;
            }
            if(!placed)
            {
                SetDemoStep(d,held?"carry":"pickup",held?"Carry to "+destination:"Pick up "+carton.id,
                    held?"Keep E held while walking. Release the carton fully inside "+destination+"; the wheel adjusts reach.":"Aim at the box and hold E to carry it. Its orientation stays fixed until you deliberately rotate it.",held?"WASD / Keep E held":"Hold E / Carry");
                if(held)
                {
                    DemoTarget(d,"BIN:"+destination);
                    if(tile=="ship")DemoRouteToVan(d);
                    else if(destination.StartsWith("C")&&Walking.transform.position.x<-1&&Walking.transform.position.z>7)
                        DemoWaypoint(d,new Vector3(-.6f,.15f,8.05f),"Around row C","Go around the north end of row C to reach its pick face.");
                }
                else DemoTarget(d,"CARTON:"+carton.id);
                return;
            }
            if(Workflow.step=="destination")
            {
                SetDemoStep(d,"destination","Scan destination "+destination,"The carton is in place. Now read the destination label so the WMS can match the physical move.","Hold left mouse");DemoTarget(d,"BIN:"+destination);return;
            }
            if(Workflow.destinationBin!=destination)
            {
                SetDemoStep(d,"correct-destination","Correct the destination scan","Choose the task again and use "+destination+" as the destination. The carton stays where you placed it.","Right click / Choose task");return;
            }
            string verb=tile=="pick"?"pick":tile=="ship"?"load":"transfer";
            SetDemoStep(d,"confirm","Confirm the "+verb,"Press Enter to record the supported carton in "+destination+". The office console receives the same transaction.","Enter / Confirm "+verb);DemoTarget(d,"BIN:"+destination);
        }
        void GuideDemoDeparture(DemonstrationState d)
        {
            d.tile="ship";d.sourceBin="STAGE-01";d.destinationBin="DISPATCH-01";d.cartonId=demoCartons[0];
            if(Workflow.step=="departing"||Courier.CollectionDeparting||dispatchAuthorization==demoDocument)
            {SetDemoStep(d,"departing","Shipment is leaving","Keep the loading route clear. The carrier closes its doors, departs and completes the shipment offsite.","Wait clear of the van");return;}
            if(!DemoWorkflow(d,"ship",demoDocument))return;
            if(!ReadyToConfirm(out _))
            {
                SetDemoStep(d,"clear-ramp","Step clear of the van","Leave the cargo deck and ramp, then stand beside the pavement before authorizing departure.","WASD / Clear the loading route");
                DemoWaypoint(d,Walking.transform.position.z<-22.9f?new Vector3(3,-.22f,-22.65f):new Vector3(6.5f,-.22f,-22.65f),"Stand clear",d.instruction);return;
            }
            SetDemoStep(d,"confirm-shipment","Authorize the shipment","One carton is loaded and the route is clear. Press Enter to release the carrier; payment follows its departure.","Enter / Confirm shipment");
        }
        bool DemoIsHeld(L.Carton carton)=>grabber!=null&&bodies.TryGetValue(carton.id,out var body)&&grabber.HeldBody==body;
        void DemoRouteToVan(DemonstrationState d)
        {
            var p=Walking.transform.position;Vector3 next;string title,instruction;
            // Turn north of the office wall, with space for the held carton's
            // arc. Once aligned with the doorway, continue straight through.
            if(p.z>-2.28f&&p.x<5.15f){next=new Vector3(.65f,.15f,-2.5f);title="South cross-aisle";instruction="Carry down the central aisle. Keep the carton close and leave room to turn before the office wall.";}
            else if(p.x<5.15f&&p.z>-4.3f){next=new Vector3(5.37f,.15f,-2.5f);title="Office approach";instruction="Cross the open aisle and line up with the office doorway before turning toward it.";}
            else if(p.z>-6.7f){next=new Vector3(5.37f,.15f,-7);title="Through the office";instruction="Carry through the office doorway. Scroll down to bring the carton closer if needed.";}
            else if(p.z>-7.8f){next=new Vector3(6.5f,.15f,-8);title="Front door approach";instruction="Pass beside the workstation and line up with the front parcel door.";}
            else if(p.z>-10.8f){next=new Vector3(6.5f,.15f,-11.3f);title="Front parcel door";instruction="Carry through the open front door and onto the pedestrian ramp.";}
            else if(p.z>-22){next=new Vector3(6.5f,-.22f,-22.65f);title="Front pavement";instruction="Follow the front ramp to the pavement beside the carrier.";}
            else if(p.x>3.25f){next=new Vector3(3,-.22f,-22.65f);title="Van approach";instruction="Go around the waiting driver toward the van ramp.";}
            else if(p.z>-23.2f){next=new Vector3(3,-.22f,-23.4f);title="Loading ramp";instruction="Approach the rear ramp, then carry the carton onto the cargo deck.";}
            else return;
            DemoWaypoint(d,next,title,instruction);
        }
        void DemoTarget(DemonstrationState d,string code)
        {
            d.targetCode=code;d.targetLabel=code.Contains(":")?code.Substring(code.IndexOf(':')+1):code;
            WarehouseWmsLabel best=null;float score=float.NegativeInfinity;var eye=Walking.eyes.transform.position;
            foreach(var label in World.Labels)
            {
                if(label==null||label.Code!=code)continue;
                var toward=eye-label.ScanPoint;float candidate=Vector3.Dot(label.Normal,toward.normalized)*10-toward.magnitude*.05f;
                if(candidate>score){score=candidate;best=label;}
            }
            if(best!=null)DemoPoint(d,best.ScanPoint);
        }
        void DemoWaypoint(DemonstrationState d,Vector3 point,string label,string instruction)
        {d.targetCode="";d.targetLabel=label;d.instruction=instruction;DemoPoint(d,point);}
        void DemoPoint(DemonstrationState d,Vector3 point)
        {
            var viewport=Walking.eyes.WorldToViewportPoint(point);d.targetVisible=true;
            d.targetPosition=new[]{point.x,point.y,point.z};d.targetViewport=new[]{viewport.x,viewport.y,viewport.z};
            d.targetDistance=Vector3.Distance(Walking.eyes.transform.position,point);
        }
    }
}
