"""Build the One Shift electric forklift asset and its studio previews in Blender.

Metres. Blender +Y is forward, +Z is up. No driving or lifting logic is installed.
Run with Blender 5.2 --background --python tools/blender/build-warehouse-forklift.py.
"""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/one-shift/models'
UNITY = ROOT / 'unity/OneShiftRackLab/Assets/RackLab/Models'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1

def mat(name, color, metal=0, rough=.5):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m

orange = mat('Forklift | baked orange enamel', (.72,.19,.035), .35, .34)
dark = mat('Forklift | graphite powdercoat', (.035,.046,.05), .55, .38)
steel = mat('Forklift | worked steel', (.23,.27,.29), .8, .31)
chrome = mat('Forklift | hydraulic chrome', (.55,.62,.65), .95, .19)
rubber = mat('Forklift | solid rubber', (.018,.022,.024), 0, .82)
vinyl = mat('Forklift | ribbed seat vinyl', (.031,.037,.04), 0, .66)
cream = mat('Forklift | warm white markings', (.84,.81,.69), .1, .5)
yellow = mat('Forklift | amber lenses', (.95,.39,.025), .1, .22)
red = mat('Forklift | tail lenses', (.5,.022,.015), .15, .23)
lamp = mat('Forklift | work light lenses', (.83,.9,.92), .15, .18)

def empty(name, loc=(0,0,0), parent=None):
    o = bpy.data.objects.new(name, None)
    scene.collection.objects.link(o)
    o.location = loc
    o.parent = parent
    o.empty_display_size = .15
    return o

root = empty('OneShift_Forklift')
root['description'] = 'Original compact four-wheel electric counterbalance forklift; unbranded.'
root['units'] = 'metres; Blender +Y forward; Unity +Z forward'
root['asset_only'] = 'Separate pivots, no driving, physics or lifting scripts.'
root['design_lift_travel_m'] = 3.8
body = empty('Chassis', parent=root)

def finish(o, name, material, parent, bevel=0):
    o.name = name
    o.parent = parent
    o.data.materials.append(material)
    if bevel:
        b = o.modifiers.new('Manufactured edge radii', 'BEVEL')
        b.width = bevel
        b.segments = 2
        b.affect = 'EDGES'
        n = o.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
        n.keep_sharp = True
    return o

def box(name, loc, size, material=dark, parent=body, bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, material, parent, bevel)

def cyl(name, loc, radius, depth, material=steel, parent=body, axis='Z', vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    o = bpy.context.object
    if axis == 'X': o.rotation_euler.y = math.pi/2
    if axis == 'Y': o.rotation_euler.x = math.pi/2
    for p in o.data.polygons: p.use_smooth = len(p.vertices) == 4
    return finish(o, name, material, parent, .003)

def beam(name, a, b, radius=.015, material=steel, parent=body):
    a,b = Vector(a),Vector(b)
    o = cyl(name, (a+b)/2, radius, (b-a).length, material, parent)
    o.rotation_euler = (b-a).to_track_quat('Z','Y').to_euler()
    return o

def hose(name, points, radius=.009, material=rubber, parent=body):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    sp = curve.splines.new('BEZIER')
    sp.bezier_points.add(len(points)-1)
    for p, co in zip(sp.bezier_points, points):
        p.co = co
        p.handle_left_type = 'AUTO'
        p.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(o)
    o.parent = parent
    o.data.materials.append(material)
    return o

def text(name, content, loc, size, rotation, parent=body):
    bpy.ops.object.text_add(location=loc, rotation=rotation)
    o = bpy.context.object
    o.name = name
    o.data.body = content
    o.data.size = size
    o.data.extrude = .0004
    o.data.align_x = 'CENTER'
    o.data.materials.append(cream)
    o.parent = parent
    return o

# Low battery chassis, shaped rear counterweight and independently removable panels.
box('Battery chassis', (0,-.08,.43), (1.03,1.86,.43), orange, bevel=.09)
box('Lower rub rail', (0,-.06,.235), (1.06,1.91,.13), dark, bevel=.035)
box('Rear counterweight', (0,-.91,.64), (1.12,.52,.71), orange, bevel=.17)
box('Rear bumper', (0,-1.13,.31), (1.07,.1,.16), dark, bevel=.04)
box('Battery hood', (0,-.44,.88), (.94,.95,.18), orange, bevel=.055)
box('Hood seam', (0,-.44,.785), (.95,.96,.012), dark, bevel=.004)
box('Operator floor', (0,.31,.51), (.86,.65,.065), dark)
box('Floor rubber mat', (0,.32,.551), (.74,.55,.018), rubber, bevel=.012)
for x in [-.535,.535]:
    box('Open access step', (x,.16,.32), (.22,.55,.055), steel)
    for y in [-.03,.07,.17,.27,.37]:
        box('Step traction rib', (x,y,.353), (.18,.018,.009), rubber, bevel=.002)
    box('Front wheel fender', (x,.63,.755), (.23,.65,.065), orange, bevel=.025)
    for y in [-.76,-.68,-.60,-.52,-.44]:
        box('Battery cooling vent', (x*.89,y,.72), (.012,.025,.1), dark, bevel=.004)
    cyl('Battery cover latch', (x*.89,-.24,.84), .025,.012,steel,axis='X')
box('Rear ventilation recess', (0,-1.178,.7), (.65,.012,.22), dark)
for z in [.62,.66,.70,.74,.78]:
    box('Counterweight grille bar', (0,-1.189,z), (.6,.018,.015), steel, bevel=.003)
cyl('Rear towing eye', (0,-1.19,.34), .075,.055,steel,axis='Y')
cyl('Tow pin', (0,-1.22,.34), .025,.06,dark,axis='Y')

# Four solid tyres. Front wheels are larger; rear wheels have steering pivots.
for axle,y,r,w,z in [('Front',.63,.335,.205,.335),('Rear',-.78,.255,.17,.255)]:
    for side in [-1,1]:
        x = side*.507
        pivot = empty(f'{axle}Wheel_{"L" if side<0 else "R"}_Pivot', (x,y,z),root)
        tyre = cyl('Solid tyre', (0,0,0),r,w,rubber,pivot,'X',48)
        for face in [-1,1]:
            cyl('Recessed wheel disc', (face*(w/2+.002),0,0),r*.61,.018,orange,pivot,'X')
            cyl('Wheel centre hub', (face*(w/2+.016),0,0),r*.28,.03,steel,pivot,'X')
            for j in range(6):
                a=j*math.tau/6
                cyl('Wheel lug', (face*(w/2+.03),math.sin(a)*r*.4,math.cos(a)*r*.4),.013,.018,chrome,pivot,'X',6)
        for j in range(36):
            a=j*math.tau/36
            for half in [-1,1]:
                tread=box('Moulded tyre tread',(half*w*.24, math.sin(a)*(r-.001),math.cos(a)*(r-.001)),(w*.45,.025,.012),rubber,pivot,.003)
                tread.rotation_euler.x = -a

# Open cab, comfortable seat, belt and the visible mechanical controls.
box('Seat pedestal', (0,-.4,1.02),(.49,.46,.21),dark,bevel=.025)
box('Seat cushion', (0,-.29,1.16),(.55,.5,.14),vinyl,bevel=.065)
back=box('Seat back', (0,-.55,1.43),(.56,.13,.48),vinyl,bevel=.055)
back.rotation_euler.x = math.radians(-10)
for x in [-.19,-.095,0,.095,.19]:
    box('Seat cushion stitched channel', (x,-.27,1.231),(.012,.32,.006),dark,bevel=.002)
    rib=box('Seat back stitched channel', (x,-.476,1.44),(.012,.01,.31),dark,bevel=.003)
    rib.rotation_euler.x = math.radians(-10)
for x in [-.29,.29]:
    beam('Armrest support',(x,-.44,1.15),(x,-.44,1.38),.018)
    box('Padded armrest',(x,-.32,1.4),(.075,.33,.065),vinyl,bevel=.025)
box('Seat belt buckle',(.245,-.26,1.245),(.048,.07,.033),red,bevel=.008)
hose('Retracted seat belt',[(-.24,-.53,1.42),(-.27,-.43,1.25),(-.24,-.15,1.23)],.019)
beam('Steering column',(-.16,.42,.62),(-.16,.29,1.18),.04,dark)
steer = empty('SteeringWheel_Pivot',(-.16,.29,1.18),root)
steer.rotation_euler.x = math.radians(22)
bpy.ops.mesh.primitive_torus_add(major_radius=.17,minor_radius=.018,major_segments=40,minor_segments=8)
finish(bpy.context.object,'Steering wheel rim',rubber,steer)
cyl('Steering centre',(0,0,0),.052,.035,dark,steer)
for j in range(3):
    a=j*math.tau/3
    beam('Steering wheel spoke',(0,0,0),(.153*math.cos(a),.153*math.sin(a),0),.011,steel,steer)
box('Dashboard',(0,.57,1.08),(.72,.17,.2),dark,bevel=.035)
box('Instrument screen',(-.1,.473,1.12),(.18,.018,.09),rubber)
text('Battery display','84%',(-.1,.460,1.115),.04,(math.pi/2,0,0))
for x in [.07,.13,.19]: cyl('Dash indicator',(x,.472,1.12),.012,.012,yellow,axis='Y',vertices=16)
for x,z in [(-.19,.6),(.12,.6)]:
    p=box('Pedal',(x,.48,z),(.12,.2,.035),rubber,bevel=.01)
    p.rotation_euler.x=math.radians(18)
for i in range(3):
    x=.23+i*.073
    beam('Hydraulic control lever',(x,.2,.82),(x,.15,1.12),.009,steel)
    cyl('Lever grip',(x,.15,1.14),.024,.065,rubber)
box('Lever console',(.32,.19,.82),(.27,.32,.13),dark,bevel=.025)
cyl('Parking brake',(-.35,-.06,.93),.022,.24,rubber)

# Protective roof frame, open slats and lights. Nothing blocks the operator entrance.
for x in [-.46,.46]:
    for y in [-.69,.59]:
        box('Overhead guard upright',(x,y,1.48),(.058,.065,1.25),dark,bevel=.012)
    box('Overhead guard side rail',(x,-.04,2.13),(.075,1.45,.095),dark,bevel=.018)
for y in [-.74,.66]: box('Overhead guard cross rail',(0,y,2.13),(.98,.075,.095),dark,bevel=.018)
for x in [-.33,-.165,0,.165,.33]: box('Overhead guard roof slat',(x,-.04,2.142),(.038,1.33,.055),dark)
for x in [-.38,.38]:
    box('Work light housing',(x,.7,1.98),(.15,.11,.11),dark,bevel=.025)
    box('Work light lens',(x,.76,1.98),(.119,.015,.074),lamp,bevel=.012)
    box('Rear lamp housing',(x,-1.137,.93),(.16,.05,.095),dark,bevel=.02)
    box('Rear red lens',(x,-1.169,.93),(.092,.015,.06),red,bevel=.009)
    box('Rear turn lens',(x+(.059 if x<0 else -.059),-1.169,.93),(.032,.015,.06),yellow,bevel=.006)
cyl('Beacon base',(.35,-.55,2.21),.065,.04,dark)
cyl('Amber beacon',(.35,-.55,2.28),.052,.11,yellow)
beam('Mirror arm',(-.46,.57,1.91),(-.61,.54,1.95),.012,dark)
box('Mirror housing',(-.61,.51,1.95),(.13,.055,.16),dark,bevel=.02)
box('Mirror face',(-.61,.478,1.95),(.107,.009,.135),chrome,bevel=.012)
box('Safety plate',(.465,-.67,1.64),(.012,.11,.21),cream)
for z in [1.59,1.63,1.67]: box('Safety plate line',(.474,-.67,z),(.009,.075,.009),dark,bevel=.001)

# Duplex mast, nested channel section, chrome lift ram, chains and free-lift carriage.
mast = empty('MastTilt_Pivot',(0,.91,.37),root)
mast['rotation_axis'] = 'local X, tilt about base'
for x in [-.39,.39]:
    box('Outer mast channel web',(x,0,.82),(.085,.07,1.98),dark,mast)
    for y in [-.052,.052]: box('Outer mast channel flange',(x,y,.82),(.14,.035,1.98),dark,mast)
    cyl('Mast tilt pin',(x,0,0),.068,.18,steel,mast,'X')
    beam('Tilt ram barrel',(x,.24,.49),(x,.69,.65),.045,dark)
    beam('Tilt ram rod',(x,.69,.65),(x,.92,.73),.022,chrome)
for z in [-.1,1.76]: box('Outer mast tie',(0,0,z),(.87,.12,.1),dark,mast)
inner = empty('InnerMast_Lift',parent=mast)
for x in [-.285,.285]:
    box('Inner mast web',(x,.065,.86),(.065,.055,1.88),steel,inner)
    for y in [.022,.108]: box('Inner mast channel lip',(x,y,.86),(.1,.028,1.88),dark,inner)
box('Inner mast header',(0,.065,1.81),(.68,.14,.1),dark,inner)
cyl('Lift cylinder',(0,-.06,.45),.062,1.05,dark,mast)
cyl('Polished lift piston',(0,-.06,1.23),.034,.6,chrome,mast)
beam('Cylinder top crosshead',(-.21,-.06,1.54),(.21,-.06,1.54),.032,steel,mast)
for x in [-.19,.19]:
    cyl('Chain sheave',(x,-.06,1.54),.068,.04,steel,mast,'X')
    for z in [i*.034+.04 for i in range(44)]:
        box('Lift chain link',(x,.017,z),(.029,.018,.025),steel,mast,.003)
    hose('Hydraulic supply hose',[(x,-.12,.05),(x,-.17,.5),(x,-.17,1.44),(x,-.10,1.62),(x,.04,1.44)],.011,rubber,mast)
carriage=empty('ForkCarriage_Lift',(0,.15,0),mast)
for z in [.16,.58]: box('Fork carriage crossbar',(0,0,z),(1.03,.085,.1),steel,carriage)
for x in [-.43,.43]:
    box('Carriage side plate',(x,.015,.36),(.085,.08,.48),dark,carriage)
    for z in [.18,.55]: cyl('Carriage roller',(x,-.08,z),.065,.06,steel,carriage,'X')
# Forks: 1.07 m blades, 100 mm wide, 40 mm heel, tapered 12 mm tips.
for x in [-.275,.275]:
    fork=empty('Fork_Left' if x<0 else 'Fork_Right',(x,0,0),carriage)
    box('Forged fork upright',(0,.065,.32),(.1,.045,.6),steel,fork,.012)
    verts=[(-.05,.045,-.27),(.05,.045,-.27),(.05,1.115,-.242),(-.05,1.115,-.242),
           (-.05,.045,-.23),(.05,.045,-.23),(.045,1.115,-.23),(-.045,1.115,-.23)]
    mesh=bpy.data.meshes.new('Tapered forged blade')
    mesh.from_pydata(verts,[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    o=bpy.data.objects.new('Tapered fork blade',mesh)
    scene.collection.objects.link(o)
    finish(o,o.name,steel,fork,.004)
    box('Fork carriage hook',(0,.015,.61),(.12,.09,.055),dark,fork)
    cyl('Fork locking pin',(0,.018,.66),.016,.06,chrome,fork)
box('Load backrest lower rail',(0,.018,.72),(1.04,.055,.055),dark,carriage)
box('Load backrest top rail',(0,.018,1.16),(1.04,.055,.055),dark,carriage)
for x in [-.49,-.326,-.163,0,.163,.326,.49]: box('Load backrest vertical',(x,.018,.94),(.025,.04,.44),dark,carriage,.004)

empty('OperatorEye',(0,-.3,1.73),root)
empty('OperatorSeat',(0,-.29,1.23),root)
empty('ForkTips',(0,1.115,-.23),carriage)
empty('LoadCentre',(0,.66,-.21),carriage)

# Bake modifiers and curves in the export copy. Keep the native source editable.
asset_objects=[root]+list(root.children_recursive)
for o in asset_objects:
    if o.type=='MESH':
        o.data.validate()
        o.data.update()

studio=bpy.data.collections.new('STUDIO | excluded from export')
scene.collection.children.link(studio)
def to_studio(o):
    for c in list(o.users_collection): c.objects.unlink(o)
    studio.objects.link(o)
    return o
floor=box('Studio floor',(0,0,-.04),(200,200,.06),mat('Studio | warm concrete',(.21,.235,.22)),None,.0)
to_studio(floor)
world=scene.world or bpy.data.worlds.new('Studio world')
scene.world=world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.21,.24,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.45
for name,loc,power,size in [('Key',(1,4,6),1700,5),('Fill',(-4,1,3),1100,4),('Rim',(2,-4,5),2000,3)]:
    data=bpy.data.lights.new(name,'AREA')
    data.energy=power
    data.shape='DISK'
    data.size=size
    o=bpy.data.objects.new(name,data)
    studio.objects.link(o)
    o.location=loc
    o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(4.2,6.1,3.5))
camera=to_studio(bpy.context.object)
camera.name='Preview camera'
camera.rotation_euler=(Vector((0,.35,1))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=4.65
scene.camera=camera
scene.render.engine='CYCLES'
scene.cycles.samples=40
scene.cycles.use_denoising=True
scene.render.resolution_x=1500
scene.render.resolution_y=1300
scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG'
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=5
        area.spaces.active.region_3d.view_location=(0,.25,1)
        area.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
        area.spaces.active.clip_end=500
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'warehouse-forklift.blend'))

# Conversion only happens after saving the native, non-destructive source.
bpy.ops.object.select_all(action='DESELECT')
for o in asset_objects: o.select_set(True)
for o in list(bpy.context.selected_objects):
    if o.type in {'CURVE','FONT','MESH'}:
        bpy.context.view_layer.objects.active=o
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.ops.object.convert(target='MESH')
        for modifier in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=modifier.name)
        if not o.data.uv_layers:
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project(island_margin=.02)
            bpy.ops.object.mode_set(mode='OBJECT')
asset_objects=[root]+list(root.children_recursive)
# Keep animation pivots, combine static meshes with matching parent and material.
groups={}
for o in asset_objects:
    if o.type=='MESH': groups.setdefault((o.parent,o.data.materials[0]),[]).append(o)
for (parent,material),objects in groups.items():
    if len(objects)<2: continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    objects[0].name=parent.name+' | '+material.name.split('|')[-1].strip()
asset_objects=[root]+list(root.children_recursive)
bpy.ops.object.select_all(action='DESELECT')
for o in asset_objects:o.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.fbx(filepath=str(UNITY/'warehouse-forklift.fbx'),use_selection=True,
                        object_types={'MESH','EMPTY'},axis_forward='-Z',axis_up='Y',
                        apply_unit_scale=True,add_leaf_bones=False,bake_anim=False,
                        use_mesh_modifiers=True,mesh_smooth_type='FACE')
meshes=[o for o in asset_objects if o.type=='MESH']
points=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
mins=[min(p[i] for p in points) for i in range(3)]
maxs=[max(p[i] for p in points) for i in range(3)]
triangles=0
for o in meshes:
    o.data.calc_loop_triangles()
    triangles+=len(o.data.loop_triangles)
assert .075 < mins[2] + .1 < .13, f'Wheel floor contact: {mins[2]}'
assert len([o for o in asset_objects if o.type=='EMPTY' and o.name.startswith(('FrontWheel_','RearWheel_'))])==4
report={'dimensions_m': [round(maxs[i]-mins[i],4) for i in range(3)],
        'bounds_min_m': mins,'bounds_max_m':maxs,'triangles':triangles,'mesh_objects':len(meshes),
        'materials':len({m.name for o in meshes for m in o.data.materials}),
        'blade_length_m':1.07,'fork_centres_m':.55,'blade_width_m':.1,'blade_heel_thickness_m':.04,
        'floor_clearance_under_forks_m':.1,'overhead_guard_height_m':2.1775,
        'status':'Art asset only. LODs, compound colliders and lifting gameplay are not installed.'}
(UNITY/'warehouse-forklift-report.json').write_text(json.dumps(report,indent=2)+'\n')
scene.render.filepath=str(OUT/'warehouse-forklift-preview.png')
bpy.ops.render.render(write_still=True)
camera.location=(-4,-5,3.3)
camera.rotation_euler=(Vector((0,.0,1))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(OUT/'warehouse-forklift-rear.png')
bpy.ops.render.render(write_still=True)
print(json.dumps(report,indent=2))
