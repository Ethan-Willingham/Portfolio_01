"""Build a floor-plus-two selective pallet rack and a standard loaded pallet.

Run in Blender's background Python. The first rack study remains untouched.
Reference geometry: 96-inch beam span, 42-inch frame, 48 x 40-inch pallets.
"""
import bpy
import math
import json
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from rack_mesh import GameMesh

ASSETS = ROOT/'unity/OneShiftRackLab/Assets/RackLab'
MODELS = ASSETS/'Models'
HEIGHT = 4.8768
LEVELS = (1.8288, 3.6576)
PALLET_W, PALLET_D, PALLET_H, LOAD_H = 1.016, 1.2192, .144, 1.55
blue = (.025, .09, .19, .9)
orange = (.72, .155, .035, .9)
zinc = (.42, .47, .48, .3)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/one-shift/models/warehouse-rack.blend'))
source = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.parent and o.parent.name.startswith('PALLET RACK')]

def box(g, center, size, color):
    x,y,z = (s*.5 for s in size)
    c = Vector(center)
    v = [c+Vector(p) for p in ((-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),
                              (-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z))]
    for f in ((0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)):
        g.face([v[i] for i in f], color)

def label(g, x, y, z, w, h, color):
    g.face([(x-w/2,y,z-h/2),(x+w/2,y,z-h/2),(x+w/2,y,z+h/2),(x-w/2,y,z+h/2)],
           color, [(0,0),(1,0),(1,1),(0,1)], (w,h))

def rack(lod, part="full"):
    g=GameMesh()
    for ob in source:
        name=ob.name.lower()
        centre=ob.matrix_world @ (sum((Vector(p) for p in ob.bound_box),Vector())/8)
        if any(s in name for s in ('punched upright','welded wire mesh','paint wear','contact scuff','foot weld')):
            continue
        if lod>=1 and any(s in name for s in ('anchor washer','exposed anchor','connector stud','retaining tab','brace welded','channel fold')):
            continue
        if lod>=2 and any(s in name for s in ('hex anchor','locking pin','connector return','adhesive','protector sole','channel web')):
            continue
        level_part=any(s in name for s in ('step beam','beam connector','connector','locking pin','retaining tab','adhesive','deck support'))
        if part == 'frame' and (level_part or centre.x > 0): continue
        if part == 'bay' and not level_part: continue
        frame_part=any(s in name for s in ('frame horizontal','frame diagonal','brace welded'))
        delta=0
        if level_part:
            index=min(range(3), key=lambda i:abs(centre.z-(1.12,2.24,3.36)[i]))
            if index==2: continue
            delta=LEVELS[index]-(1.12,2.24)[index]
        mat=ob.data.materials[0]
        color=(*mat.diffuse_color[:3], .9 if 'Powder coat' in mat.name or 'Safety yellow' in mat.name else .3)
        if 'industrial green' in mat.name: color=blue
        if 'beam orange' in mat.name: color=orange
        if 'label' in mat.name.lower(): color=(.88,.87,.81,.01)
        for polygon in ob.data.polygons:
            points=[]
            for i in polygon.vertices:
                p=ob.matrix_world@ob.data.vertices[i].co
                p.z=p.z*HEIGHT/3.66 if frame_part else p.z+delta
                if part == 'frame': p.x += 1.265
                if part == 'bay' and any(s in name for s in ('connector','locking pin','retaining tab')):
                    post = -1.265 if centre.x < 0 else 1.265
                    # Adjacent bays each use one of the two upright connection columns.
                    p.x = post + (p.x-post)*.5 + (.022 if post < 0 else -.022)
                points.append(p)
            g.face(points,color)
    for x in (() if part == 'bay' else (0,) if part == 'frame' else (-1.265,1.265)):
        for y in (-.495,.495):
            sign=1 if y<0 else -1
            def p(dx,dy,z): return (x+dx,y+dy*sign,z)
            for xx in (-.045,.045):
                g.face([p(xx,-.04,.012),p(xx,.04,.012),p(xx,.04,HEIGHT),p(xx,-.04,HEIGHT)],blue)
                inner=.026 if xx>0 else -.026
                g.face([p(xx,.04,.012),p(inner,.04,.012),p(inner,.04,HEIGHT),p(xx,.04,HEIGHT)],blue)
            g.face([p(-.045,-.04,.012),p(.045,-.04,.012),p(.045,-.04,HEIGHT),p(-.045,-.04,HEIGHT)],
                   blue,[(0,0),(1,0),(1,(HEIGHT-.012)/.0508),(0,(HEIGHT-.012)/.0508)],(-1,0 if lod<2 else 1))
    for top in (() if part == 'frame' else LEVELS):
        z=top+.004
        for cx in (-.61,.61):
            lo,hi=cx-.597,cx+.597
            if lod==0:
                for k in range(25):
                    x=lo+(hi-lo)*k/24
                    g.rod((x,-.539,z),(x,.539,z),.0024,zinc)
                    for y in (-.539,.539): g.rod((x,y,z),(x,y,z-.034),.0024,zinc)
                for k in range(12):
                    y=-.532+k*1.064/11
                    g.rod((lo,y,z+.0047),(hi,y,z+.0047),.0023,zinc)
            else:
                g.face([(lo,-.539,z),(hi,-.539,z),(hi,.539,z),(lo,.539,z)],zinc,
                       [(0,0),(24,0),(24,11),(0,11)],(-2,0))
    return g.finish(lod, "Frame" if part == "frame" else "Bay" if part == "bay" else "Rack")

def pallet(lod, cargo_only=False):
    g=GameMesh()
    wood=(.39,.235,.11,.2)
    pale=(.47,.30,.15,.2)
    if not cargo_only:
        # 48-inch stringers run front to back; two notches give four-way fork access.
        for x in (-.466,0,.466):
            if lod<2:
                box(g,(x,0,.1005),(.038,PALLET_D,.051),wood)
                for a,b in ((-.6096,-.44),(-.18,.18),(.44,.6096)):
                    box(g,(x,(a+b)/2,.0465),(.038,b-a,.057),wood)
            else:
                box(g,(x,0,.072),(.038,PALLET_D,.108),wood)
        for y in (-.5396,0,.5396): box(g,(0,y,.009),(PALLET_W,.14,.018),wood)
        if lod<2:
            for j in range(7):
                y=-.5446+j*(1.0892/6)
                box(g,(0,y,.135),(PALLET_W,.13,.018),pale if j%3==0 else wood)
                if lod==0:
                    for x in (-.466,0,.466):
                        for dy in (-.025,.025):
                            box(g,(x,y+dy,.1443),(.003,.003,.0006),(.07,.065,.055,.8))
        else: box(g,(0,0,.135),(PALLET_W,PALLET_D,.018),wood)
    tier_h=(LOAD_H-PALLET_H)/4
    if lod==0:
        for tier in range(4):
            for column in range(2):
                for row in range(3):
                    x=(column-.5)*.488
                    y=(row-1)*.390
                    z=PALLET_H+(tier+.5)*tier_h
                    shade=((tier*7+column*3+row)%5)*.012
                    color=(.47+shade,.325+shade,.18+shade,.5)
                    box(g,(x,y,z),(.484,.386,tier_h-.004),color)
                    # Packing tape crossing the top flaps, folded down the carton ends.
                    box(g,(x,y,z+tier_h/2-.001),(.048,.386,.001),(.54,.39,.22,.72))
                    for face_y in (y-.1932,y+.1932):
                        box(g,(x,face_y,z+tier_h*.30),(.048,.0008,tier_h*.40),(.54,.39,.22,.72))
    else:
        for tier in range(4 if lod==1 else 1):
            h=tier_h if lod==1 else LOAD_H-PALLET_H
            z=PALLET_H+(tier+.5)*h
            box(g,(0,0,z),(.972,1.166,h-.004),(.49,.345,.20,.5))
    # Two tensioned straps retain this example unit load without closing the fork pockets.
    for x in (-.30,.30):
        for y in (-.585,.585): box(g,(x,y,(PALLET_H+LOAD_H)*.5),(.018,.002,LOAD_H-PALLET_H),(.035,.038,.031,.8))
        box(g,(x,0,LOAD_H+.001),(.018,1.172,.002),(.035,.038,.031,.8))
    label(g,.04,-.587,.98,.25,.16,(.9,.89,.83,.01))
    if cargo_only:
        delta = .144-.12065
        for v in g.vertices: v.z -= delta
    return g.finish(lod,'Cargo' if cargo_only else 'Pallet')

def material(name, organic=False):
    mat=bpy.data.materials.new(name)
    mat.use_nodes=True
    nodes=mat.node_tree.nodes
    attr=nodes.new('ShaderNodeVertexColor');attr.layer_name='Finish'
    bsdf=nodes.get('Principled BSDF')
    mat.node_tree.links.new(attr.outputs['Color'],bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value=0 if organic else .4
    bsdf.inputs['Roughness'].default_value=.72 if organic else .38
    return mat

rack_objects=[rack(i) for i in range(3)]
pallet_objects=[pallet(i) for i in range(3)]
steel=material('Selective rack powder coating')
cargo=material('Wood pallet and corrugated cartons',True)
modules=[rack(i, part) for part in ('frame','bay') for i in range(3)]
cartons=[pallet(i,True) for i in range(3)]
for ob in modules: ob.data.materials.append(steel)
for ob in cartons: ob.data.materials.append(cargo)
for ob in rack_objects: ob.data.materials.append(steel)
for ob in pallet_objects: ob.data.materials.append(cargo)

def export(objects, filename):
    for ob in bpy.context.scene.objects: ob.select_set(False)
    for ob in objects: ob.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.export_scene.fbx(filepath=str(MODELS/filename),use_selection=True,
        object_types={'MESH'},use_mesh_modifiers=False,add_leaf_bones=False,bake_anim=False,
        axis_forward='-Z',axis_up='Y',apply_unit_scale=True,bake_space_transform=True,
        mesh_smooth_type='FACE',colors_type='LINEAR',path_mode='AUTO')
export(modules,'connected-rack-modules.fbx')
export(cartons,'carton-load-lods.fbx')
export(rack_objects,'forklift-pallet-rack-lods.fbx')
export(pallet_objects,'standard-loaded-pallet-lods.fbx')
for ob in list(bpy.data.objects):
    if ob not in rack_objects+pallet_objects+modules+cartons: bpy.data.objects.remove(ob,do_unlink=True)
for ob in modules+cartons: ob.hide_set(True);ob.hide_render=True
for objects in (rack_objects,pallet_objects):
    for i,ob in enumerate(objects): ob.hide_set(i!=0);ob.hide_render=i!=0
pallet_objects[0].location.x=3.5
bpy.context.scene.unit_settings.system='METRIC'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/one-shift/models/forklift-pallet-rack.blend'),compress=True)
report={'rackHeightM':HEIGHT,'beamTopsM':LEVELS,'floorStorage':True,'palletWidthM':PALLET_W,
        'palletDepthM':PALLET_D,'palletHeightM':PALLET_H,'loadedPalletHeightM':LOAD_H,
        'palletPositionsPerBay':6,'rackLODs':[],'palletLODs':[],'modules':[],'cargoLODs':[]}
for key,objects in (('rackLODs',rack_objects),('palletLODs',pallet_objects),('modules',modules),('cargoLODs',cartons)):
    for ob in objects:
        ob.data.calc_loop_triangles()
        report[key].append({'name':ob.name,'triangles':len(ob.data.loop_triangles),'renderers':1,'materials':1})
(MODELS/'forklift-rack-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('FORKLIFT_RACK_COMPLETE',json.dumps(report),flush=True)
