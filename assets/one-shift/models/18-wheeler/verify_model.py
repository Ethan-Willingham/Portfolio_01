import bpy, math, json, os
from mathutils import Vector
from mathutils.bvhtree import BVHTree
OUT=os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,'18-wheeler.blend'))
asset=bpy.data.collections['18 WHEELER | export']
meshes=[o for o in asset.objects if o.type=='MESH']
wheels=[o for o in meshes if o.name.startswith('Wheel_')]
doors=[bpy.data.objects['Rear_Door_'+s] for s in ('L','R')]
report={'checks':[], 'failures':[]}
def check(cond,message):
    report['checks' if cond else 'failures'].append(message)
check(len(wheels)==18,'Exactly 18 separate wheel meshes')
check(len([w for w in wheels if 'Tractor' in w.name])==10,'Tractor has 2 steer tires and 8 drive tires')
check(len([w for w in wheels if 'Trailer' in w.name])==8,'Trailer has 8 tires on two tandem axles')
check(all(len(o.data.uv_layers)==1 for o in meshes),'Every asset mesh has UV coordinates')
check(all(all(len(p.vertices)==3 for p in o.data.polygons) for o in meshes),'All export faces are triangulated')
check(all(p.area>1e-10 for o in meshes for p in o.data.polygons),'No zero-area triangles')
report['zero_area']={o.name:sum(p.area<=1e-10 for p in o.data.polygons) for o in meshes if any(p.area<=1e-10 for p in o.data.polygons)}
check(all((o.scale-Vector((1,1,1))).length<1e-5 for o in asset.objects),'All asset object scales are 1')
original={o.name:tuple(o.matrix_world.translation) for o in asset.objects}
for w in wheels:
    center=w.matrix_world.translation.copy()
    check(abs(center.z-.505)<1e-5,w.name+' origin is at axle height')
    rs=[math.hypot(v.co.y,v.co.z) for v in w.data.vertices]
    check(abs(max(rs)-.505)<1e-4,w.name+' has a centered 0.505 m tire radius')
    w.rotation_euler.x=math.pi*.37;bpy.context.view_layer.update()
    check((w.matrix_world.translation-center).length<1e-5,w.name+' rotates without orbiting')
    w.rotation_euler.x=0
for s in ('L','R'):
    steer=bpy.data.objects['Steer_Tractor_Steer_'+s];w=bpy.data.objects['Wheel_Tractor_Steer_'+s]
    center=w.matrix_world.translation.copy();steer.rotation_euler.z=.35;bpy.context.view_layer.update()
    check((w.matrix_world.translation-center).length<1e-5,'Steering '+s+' preserves wheel center')
    steer.rotation_euler.z=0
bpy.context.view_layer.update()
shell=bpy.data.objects['Trailer_Shell_and_Cargo_Interior']
shell_bvh=BVHTree.FromPolygons([shell.matrix_world@v.co for v in shell.data.vertices],[list(p.vertices) for p in shell.data.polygons],all_triangles=True)
overlaps={}
for s,d in zip((-1,1),doors):
    fixed=d.matrix_world.translation.copy()
    for angle in (0,15,30,60,90,110,180,240,255,270):
        d.rotation_euler.z=math.radians(-s*angle);bpy.context.view_layer.update()
        check((d.matrix_world.translation-fixed).length<1e-5,d.name+' hinge stable at '+str(angle)+' degrees')
        dbvh=BVHTree.FromPolygons([d.matrix_world@v.co for v in d.data.vertices],[list(p.vertices) for p in d.data.polygons],all_triangles=True)
        contacts=dbvh.overlap(shell_bvh)
        overlaps[d.name+'_'+str(angle)]=len(contacts)
    d.rotation_euler.z=0
bpy.context.view_layer.update()
report['door_shell_intersections']=overlaps
check(all(n==0 for n in overlaps.values()),'Both rear doors clear the trailer shell through 270 degrees')
trailer=bpy.data.objects['Trailer_Coupling'];fixed=trailer.matrix_world.translation.copy()
before=bpy.data.objects['Wheel_Trailer_Axle1_L_Outer'].matrix_world.translation.copy()
trailer.rotation_euler.z=.2;bpy.context.view_layer.update()
after=bpy.data.objects['Wheel_Trailer_Axle1_L_Outer'].matrix_world.translation.copy()
check((fixed-trailer.matrix_world.translation).length<1e-5,'Trailer articulation pivot stays on kingpin')
check((after-before).length>1,'Trailer wheel assemblies follow trailer articulation')
trailer.rotation_euler.z=0;bpy.context.view_layer.update()
triangles=sum(len(o.data.polygons) for o in meshes)
check(triangles<70000,'Complete vehicle remains below 70,000 triangles')
report['triangles']=triangles
expected_names=set(o.name for o in asset.objects)
expected_positions={o.name:o.matrix_world.translation.copy() for o in asset.objects}
expected_polys={o.name:len(o.data.polygons) for o in meshes}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=os.path.join(OUT,'18-wheeler.fbx'))
check(set(o.name for o in bpy.context.scene.objects)==expected_names,'FBX round trip retains exact asset hierarchy without studio objects')
max_error=max((bpy.data.objects[n].matrix_world.translation-p).length for n,p in expected_positions.items())
check(max_error<.0001,'FBX round trip preserves positions and scale to 0.1 mm')
check(all(len(bpy.data.objects[n].data.polygons)==ct for n,ct in expected_polys.items()),'FBX round trip preserves all geometry')
check(all(bpy.data.objects['Rear_Door_'+s].parent.name=='Trailer_Coupling' for s in ('L','R')),'FBX retains rear doors under trailer articulation pivot')
check(all(bpy.data.objects['Wheel_Tractor_Steer_'+s].parent.name=='Steer_Tractor_Steer_'+s for s in ('L','R')),'FBX retains front wheel steering hierarchy')
report['fbx_position_error_m']=max_error
report['passed']=not report['failures']
with open(os.path.join(OUT,'validation.json'),'w') as f:json.dump(report,f,indent=2)
print(json.dumps(report,indent=2))
assert report['passed'],report['failures']
