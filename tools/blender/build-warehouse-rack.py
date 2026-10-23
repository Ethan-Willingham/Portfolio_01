"""Build a single realistic pallet-rack bay in Blender 4.0 or newer.

Run: blender --background --python tools/blender/build-warehouse-rack.py
The native asset is independent of the current One Shift browser game.
Visual construction reference: https://www.unarcorack.com/pallet-rack-warehouse-storage/interchangeable/
"""

import bpy
import bmesh
import math
import random
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "one-shift" / "models"
OUT.mkdir(parents=True, exist_ok=True)
random.seed(21)

# This builder runs in its own background process, never in the user's scene.
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "Warehouse rack | single bay"
scene.unit_settings.system = 'METRIC'

def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c

frames = collection("01 Upright frames")
beams = collection("02 Step beams and connectors")
decks = collection("03 Removable wire decks")
hardware = collection("04 Anchors and protection")
labels = collection("05 Bay labels")
studio = collection("STUDIO | hide for asset export")

def material(name, color, metal=0.0, rough=0.5, texture=False):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if texture:
        n = nt.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = 210
        n.inputs['Detail'].default_value = 2
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = 0.15
        bump.inputs['Distance'].default_value = 0.00022
        nt.links.new(n.outputs['Fac'], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m

green = material('Powder coat | industrial green', (0.042, 0.19, 0.105), .48, .34, True)
orange = material('Powder coat | beam orange', (.72, .125, .022), .38, .34, True)
zinc = material('Galvanized steel | wire and fasteners', (.42, .47, .48), .8, .43, True)
steel = material('Dark steel | safety pins', (.12, .14, .13), .75, .42)
yellow = material('Safety yellow | upright protectors', (.8, .48, .035), .4, .38, True)
cream = material('Off-white adhesive labels', (.83, .81, .72), 0, .7)
ink = material('Label ink', (.022, .028, .025), 0, .7)
rubber = material('Protector base gasket', (.035, .036, .031), 0, .82)
concrete = material('Concrete | studio floor', (.24, .25, .23), 0, .88, True)

def mesh_object(name, verts, faces, mat, coll):
    m = bpy.data.meshes.new(name)
    m.from_pydata(verts, [], faces)
    m.update()
    bm = bmesh.new()
    bm.from_mesh(m)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(m)
    bm.free()
    if hasattr(m, 'use_auto_smooth'):
        m.use_auto_smooth = True
    ob = bpy.data.objects.new(name, m)
    coll.objects.link(ob)
    if mat:
        m.materials.append(mat)
    return ob

def bevel(ob, width=.001, segments=2):
    mod = ob.modifiers.new('Small manufactured edge radius', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    normal = ob.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    normal.keep_sharp = True
    normal.weight = 50
    return ob

def box(name, loc, size, mat, coll, edge=.001):
    x,y,z = (s/2 for s in size)
    v = [(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),
         (-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
    f = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    ob = mesh_object(name,v,f,mat,coll)
    ob.location = loc
    if edge:
        bevel(ob,edge)
    return ob

def prism(name, polygon, length, axis, mat, coll):
    # Polygon is the section in XY (axis Z) or YZ (axis X).
    n = len(polygon)
    if axis == 'Z':
        v = [(a,b,c) for c in (0,length) for a,b in polygon]
    else:
        v = [(c,a,b) for c in (-length/2,length/2) for a,b in polygon]
    f = [tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh_object(name,v,f,mat,coll)

class MeshParts:
    def __init__(self):
        self.v = []
        self.f = []

    def rod(self, a, b, radius, sides=8):
        a,b = Vector(a),Vector(b)
        direction = (b-a).normalized()
        ref = Vector((0,0,1)) if abs(direction.z)<.9 else Vector((0,1,0))
        u = direction.cross(ref).normalized()*radius
        w = direction.cross(u).normalized()*radius
        start = len(self.v)
        for p in (a,b):
            for i in range(sides):
                t=2*math.pi*i/sides
                self.v.append(tuple(p+u*math.cos(t)+w*math.sin(t)))
        self.f += [tuple(start+i for i in range(sides-1,-1,-1)),
                   tuple(start+sides+i for i in range(sides))]
        for i in range(sides):
            j=(i+1)%sides
            self.f.append((start+i,start+j,start+sides+j,start+sides+i))

    def object(self,name,mat,coll):
        return mesh_object(name,self.v,self.f,mat,coll)

def rod(name,a,b,r,mat,coll,sides=12):
    parts=MeshParts()
    parts.rod(a,b,r,sides)
    ob=parts.object(name,mat,coll)
    for p in ob.data.polygons:
        p.use_smooth = len(p.vertices)==4
    return ob

def anchor(x,y,z=.012):
    rod('Anchor washer',(x,y,z),(x,y,z+.003),.014,zinc,hardware,20)
    bevel(rod('Hex anchor nut',(x,y,z+.003),(x,y,z+.014),.01,zinc,hardware,6),.0006,1)
    rod('Exposed anchor thread',(x,y,z+.014),(x,y,z+.02),.0053,steel,hardware,12)

# 96 inch clear bay, 42 inch frame depth, roughly 12 foot uprights.
POST_X = 1.265
POST_Y = .495
HEIGHT = 3.66
LEVELS = (1.12,2.24,3.36)
profile = [(-.045,-.04),(.045,-.04),(.045,.04),(.026,.04),
           (.026,.0375),(.0425,.0375),(.0425,-.0375),(-.0425,-.0375),
           (-.0425,.0375),(-.026,.0375),(-.026,.04),(-.045,.04)]
master = prism('Upright | roll-formed lipped channel',profile,HEIGHT-.012,'Z',green,frames)

# Real through-holes, one boolean against a disconnected cutter mesh.
hole = [(-.0035,-.012),(.0035,-.012),(.0035,-.004),(.0065,-.001),
        (.008,.003),(.007,.007),(.004,.010),(0,.011),(-.004,.010),
        (-.007,.007),(-.008,.003),(-.0065,-.001),(-.0035,-.004)]
verts=[]
faces=[]
for row in range(70):
    z=.065+row*.0508
    for x in (-.022,.022):
        start=len(verts)
        n=len(hole)
        verts += [(x+hx,y,z+hz) for y in (-.052,-.027) for hx,hz in hole]
        faces += [tuple(start+i for i in range(n-1,-1,-1)),tuple(start+n+i for i in range(n))]
        faces += [(start+i,start+(i+1)%n,start+(i+1)%n+n,start+i+n) for i in range(n)]
cutter=mesh_object('Temporary punch tooling',verts,faces,None,frames)
bpy.context.view_layer.objects.active=master
mod=master.modifiers.new('Teardrop connector holes','BOOLEAN')
mod.operation='DIFFERENCE'
mod.solver='EXACT'
mod.object=cutter
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.data.objects.remove(cutter,do_unlink=True)
bevel(master,.0006,2)

for xi,x in enumerate((-POST_X,POST_X)):
    for yi,y in enumerate((-POST_Y,POST_Y)):
        if xi==0 and yi==0:
            post=master
        else:
            post=master.copy()
            post.data=master.data
            frames.objects.link(post)
        post.name=f"{'Left' if x<0 else 'Right'} {'front' if y<0 else 'rear'} | punched upright"
        post.location=(x,y,.012)
        if y>0:
            post.rotation_euler.z=math.pi
        box('Welded footplate',(x,y,.006),(.18,.16,.012),green,hardware,.002)
        for dx,dy in ((-.064,-.052),(.064,.052)):
            anchor(x+dx,y+dy)
        # Small welds at post-to-foot junction.
        rod('Foot weld',(x-.047,y-.041,.015),(x+.047,y-.041,.015),.0024,green,frames)

    # Frame truss is in the end plane, leaving the loading face unobstructed.
    zs=(.24,.86,1.48,2.10,2.72,3.40)
    for j,z in enumerate(zs):
        bar=box('Frame horizontal tie',(x,0,z),(.035,.93,.03),green,frames,.0015)
    for j in range(len(zs)-1):
        ya,yb=(-.451,.451) if j%2==0 else (.451,-.451)
        a,b=Vector((x,ya,zs[j])),Vector((x,yb,zs[j+1]))
        bar=box('Frame diagonal brace',(a+b)/2,(.032,.028,(b-a).length),green,frames,.0014)
        bar.rotation_mode='QUATERNION'
        bar.rotation_quaternion=(b-a).to_track_quat('Z','Y')
        for pt in (a,b):
            # Welded flattened ends, visible through the open channel.
            box('Brace welded end',pt,(.039,.042,.045),green,frames,.001)

for level,top in enumerate(LEVELS,1):
    for y in (-POST_Y,POST_Y):
        side=-1 if y<0 else 1
        # Top step supports deck channels; tall vertical outer face faces aisle.
        section=[(-.035,-.13),(.035,-.13),(.035,-.04),(.005,-.04),(.005,0),(-.035,0)]
        if side>0:
            section=[(-a,b) for a,b in reversed(section)]
        beam=prism(f'Level {level} | {"front" if side<0 else "rear"} step beam',section,2.44,'X',orange,beams)
        beam.location=(0,y,top)
        bevel(beam,.0018,3)
        for x in (-POST_X,POST_X):
            # End plate wraps the upright face and connects to the beam end.
            box('Three-stud beam connector',(x,y+side*.045,top-.062),(.082,.009,.19),orange,beams,.0015)
            toward=1 if x<0 else -1
            box('Connector return flange',(x+toward*.043,y+side*.015,top-.062),(.008,.07,.19),orange,beams,.001)
            for dz in (-.01,-.061,-.112):
                rod('Connector stud head',(x,y+side*.051,top+dz),(x,y+side*.056,top+dz),.0062,orange,beams,12)
            px=x-toward*.022
            rod('Beam safety locking pin',(px,y+side*.052,top+.015),(px,y+side*.064,top+.015),.004,zinc,hardware,10)
            rod('Safety pin retaining tab',(px,y+side*.065,top+.015),(px,y+side*.065,top-.009),.0023,zinc,hardware,8)

    # Two removable waterfall wire decks per level.
    for panel,cx in enumerate((-.61,.61),1):
        parts=MeshParts()
        lo,hi=cx-.597,cx+.597
        z=top+.004
        for k in range(25):
            x=lo+(hi-lo)*k/24
            parts.rod((x,-.539,z),(x,.539,z),.0024,8)
            parts.rod((x,-.539,z),(x,-.539,z-.034),.0024,8)
            parts.rod((x,.539,z),(x,.539,z-.034),.0024,8)
        for k in range(12):
            y=-.532+k*1.064/11
            parts.rod((lo,y,z+.0047),(hi,y,z+.0047),.0023,8)
        deck=parts.object(f'Level {level} | deck {panel} | welded wire mesh',zinc,decks)
        for p in deck.data.polygons:
            p.use_smooth = len(p.vertices)==4
        # Three formed channels bridge the depth and bear on the beam steps.
        for dx in (-.40,0,.40):
            x=cx+dx
            box('Deck support channel web',(x,0,top+.0005),(.038,.962,.003),zinc,decks,.0006)
            for sx in (-.018,.018):
                box('Deck support channel fold',(x+sx,0,top-.020),(.002,.962,.040),zinc,decks,.0005)

# Independently anchored front-post protectors, with clearance from the steel.
for x in (-POST_X,POST_X):
    box('Protector sole front',(x,-.66,.007),(.315,.060,.014),yellow,hardware,.003)
    box('Protector front',(x,-.638,.178),(.22,.009,.33),yellow,hardware,.004)
    for dx in (-.105,.105):
        box('Protector side return',(x+dx,-.553,.178),(.009,.17,.33),yellow,hardware,.003)
    for dx in (-.1325,.1325):
        box('Protector sole side',(x+dx,-.515,.007),(.05,.29,.014),yellow,hardware,.003)
        for y in (-.65,-.40):
            anchor(x+dx,y,.014)
    # Small exposed metal scuffs where handling equipment might touch.
    for j in range(5):
        length=random.uniform(.016,.055)
        ob=box('Protector contact scuff',(x+random.uniform(-.055,.055),-.643,.06+j*.034),(length,.0004,.0017),steel,hardware,0)
        ob.rotation_euler.y=random.uniform(-.15,.15)

# Small location labels on the front beams, sized for real viewing distances.
font_path=ROOT/'assets'/'fonts'/'CommitMono-400-Regular.woff2'
font_candidates=list((ROOT/'assets'/'fonts').rglob('*.ttf'))+list((ROOT/'assets'/'fonts').rglob('*.otf'))
font=None
for path in font_candidates:
    if 'commit' in path.name.lower() or 'segoe' in path.name.lower():
        font=bpy.data.fonts.load(str(path))
        break

def text_label(body,x,y,z,size,mat):
    curve=bpy.data.curves.new(body,'FONT')
    curve.body=body
    curve.size=size
    curve.align_x='CENTER'
    curve.align_y='CENTER'
    if font:
        curve.font=font
    ob=bpy.data.objects.new(body,curve)
    labels.objects.link(ob)
    ob.location=(x,y,z)
    ob.rotation_euler=(math.pi/2,0,0)
    curve.materials.append(mat)
    return ob

for i,top in enumerate(LEVELS,1):
    for cx in (-.61,.61):
        box('Adhesive rack location',(cx,-.531,top-.083),(.16,.001,.043),cream,labels,.001)
        text_label(f'A01-{i:02d}{"L" if cx<0 else "R"}',cx,-.532,top-.08,.022,ink)

# Restrained paint rubs along the lowest beam, all separate and removable.
for j in range(20):
    x=random.uniform(-1.17,1.17)
    z=LEVELS[0]-random.uniform(.108,.125)
    box('Beam paint wear',(x,-.5304,z),(random.uniform(.007,.035),.00035,.0011),steel,labels,0)

asset_objects=[o for c in (frames,beams,decks,hardware,labels) for o in c.objects]
root=bpy.data.objects.new('PALLET RACK | single bay',None)
scene.collection.objects.link(root)
root.empty_display_type='PLAIN_AXES'
root.empty_display_size=.15
root['description']='Empty selective pallet rack, two pallet positions per level, three elevated wire decks, open ground position.'
root['approx_dimensions_m']='2.85 wide x 1.27 deep x 3.66 high, including guards'
root['construction']='Punched roll-formed uprights, welded end frames, step beams, locking pins, waterfall wire decking, anchors and separate guards.'
for ob in asset_objects:
    ob.parent=root

floor=box('Studio concrete floor',(0,0,-.065),(200,200,.12),concrete,studio,.005)

def aim(ob,target):
    ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()

def area(name,loc,power,size,color):
    data=bpy.data.lights.new(name,'AREA')
    data.energy=power
    data.shape='DISK'
    data.size=size
    data.color=color
    ob=bpy.data.objects.new(name,data)
    studio.objects.link(ob)
    ob.location=loc
    aim(ob,(0,0,1.7))

area('Large softbox | key',(-3,-4,7),1500,5,(1,.93,.84))
area('Broad fill',(4,-1,4.8),1000,4,(.83,.9,1))
area('Top rear rim',(0,4,6),1800,3,(1,1,.95))
camdata=bpy.data.cameras.new('Rack overview camera')
cam=bpy.data.objects.new('Rack overview camera',camdata)
studio.objects.link(cam)
cam.location=(5.6,-8.4,4.8)
aim(cam,(0,0,1.8))
camdata.type='ORTHO'
camdata.ortho_scale=5.65
camdata.lens=55
scene.camera=cam
world=bpy.data.worlds.new('Neutral workshop ambience')
world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.23,.26,.29,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.4
scene.world=world
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=1500
scene.render.resolution_y=1500
scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(OUT/'warehouse-rack-preview.png')

# Open in an uncluttered, colored model view, with the rack ready to orbit.
for screen in bpy.data.screens:
    for area_ui in screen.areas:
        if area_ui.type=='VIEW_3D':
            space=area_ui.spaces.active
            space.shading.type='MATERIAL'
            space.shading.studiolight_rotate_z=.5
            space.overlay.show_floor=False
            space.overlay.show_axis_x=False
            space.overlay.show_axis_y=False
            space.overlay.show_extras=False
            space.clip_end=500
            space.region_3d.view_distance=6.8
            space.region_3d.view_location=(0,0,1.8)
            space.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
            space.region_3d.view_perspective='PERSP'
            space.lens=50

for ob in scene.objects:
    ob.select_set(False)
root.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'warehouse-rack.blend'),compress=True)

# A portable mesh export is useful when choosing a 3D engine later.
for ob in scene.objects:
    ob.select_set(False)
for ob in asset_objects:
    if ob.type=='FONT':
        bpy.context.view_layer.objects.active=ob
        ob.select_set(True)
        bpy.ops.object.convert(target='MESH')
        ob.select_set(False)
for ob in asset_objects:
    ob.select_set(True)
root.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(OUT/'warehouse-rack.glb'),export_format='GLB',use_selection=True,export_apply=True)
report={'objects':len(asset_objects),'mesh_vertices':sum(len(o.data.vertices) for o in asset_objects if o.type=='MESH'),'levels':list(LEVELS),'native':'warehouse-rack.blend','portable':'warehouse-rack.glb'}
(OUT/'warehouse-rack-build.json').write_text(json.dumps(report,indent=2)+'\n')
print('RACK_BUILD_COMPLETE',json.dumps(report),flush=True)
bpy.ops.render.render(write_still=True)
print('RACK_RENDER_COMPLETE',flush=True)
