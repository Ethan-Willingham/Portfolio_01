"""Derive game meshes from the editable rack, preserving the detailed original.

blender --background --python tools/blender/build-warehouse-rack-game.py
Vertex color holds the original finish; UV1 holds face dimensions or cutout type.
Unity's RackSteel shader supplies deterministic, adjustable cosmetic wear.
"""
import bpy
import bmesh
import math
import json
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT/'unity'/'OneShiftRackLab'/'Assets'/'RackLab'
MODELS = ASSETS/'Models'
TEXTURES = ASSETS/'Textures'
MODELS.mkdir(parents=True, exist_ok=True)
TEXTURES.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/one-shift/models/warehouse-rack.blend'))
source = [o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent and o.parent.name.startswith('PALLET RACK')]
source_colors = {m.name: tuple(m.diffuse_color[:3]) for m in bpy.data.materials}
green=(.042,.19,.105,.9)
zinc=(.42,.47,.48,.3)

class GameMesh:
    def __init__(self):
        self.vertices=[]
        self.faces=[]
        self.colors=[]
        self.uv=[]
        self.surface=[]

    def face(self, coords, color, uv=None, surface=None):
        coords=[Vector(p) for p in coords]
        offset=len(self.vertices)
        self.vertices.extend(coords)
        self.faces.append(tuple(range(offset,offset+len(coords))))
        self.colors.extend([color]*len(coords))
        if uv is None:
            origin=coords[0]
            u=(coords[1]-origin).normalized()
            normal=(coords[1]-origin).cross(coords[2]-origin).normalized()
            v=normal.cross(u).normalized()
            planar=[((p-origin).dot(u),(p-origin).dot(v)) for p in coords]
            xs=[p[0] for p in planar]; ys=[p[1] for p in planar]
            dx=max(max(xs)-min(xs),.0001); dy=max(max(ys)-min(ys),.0001)
            uv=[((x-min(xs))/dx,(y-min(ys))/dy) for x,y in planar]
            surface=(dx,dy)
        self.uv.extend(uv)
        self.surface.extend([surface]*len(coords))

    def source(self,ob,lod):
        data=ob.data
        mat=data.materials[0] if data.materials else None
        name=mat.name if mat else ''
        color=tuple(mat.diffuse_color[:3]) if mat else (.2,.2,.2)
        code=.9 if 'Powder coat' in name or 'Safety yellow' in name else .3
        if 'label' in name.lower() or 'ink' in name.lower(): code=.01
        for p in data.polygons:
            self.face([ob.matrix_world@data.vertices[i].co for i in p.vertices],(*color,code))

    def rod(self,a,b,radius,color,sides=4):
        a,b=Vector(a),Vector(b)
        n=(b-a).normalized()
        ref=Vector((0,0,1)) if abs(n.z)<.9 else Vector((0,1,0))
        u=n.cross(ref).normalized()*radius
        v=n.cross(u).normalized()*radius
        ring=[u*math.cos(2*math.pi*i/sides)+v*math.sin(2*math.pi*i/sides) for i in range(sides)]
        for i in range(sides):
            j=(i+1)%sides
            self.face([a+ring[i],a+ring[j],b+ring[j],b+ring[i]],color)

    def finish(self,lod):
        mesh=bpy.data.meshes.new(f'Rack_LOD{lod}')
        mesh.from_pydata(self.vertices,[],self.faces)
        mesh.update()
        mesh.uv_layers.new(name='FaceUV')
        mesh.uv_layers.new(name='SurfaceData')
        mesh.color_attributes.new(name='Finish',type='FLOAT_COLOR',domain='CORNER')
        # Creating custom-data layers can invalidate earlier RNA layer handles.
        # Fetch each layer after all allocations, then populate it in one write.
        loop_vertices=[loop.vertex_index for loop in mesh.loops]
        mesh.uv_layers['FaceUV'].data.foreach_set('uv',np.array([self.uv[v] for v in loop_vertices],dtype=np.float32).ravel())
        mesh.uv_layers['SurfaceData'].data.foreach_set('uv',np.array([self.surface[v] for v in loop_vertices],dtype=np.float32).ravel())
        expected=np.array([self.colors[v] for v in loop_vertices],dtype=np.float32).ravel()
        mesh.color_attributes['Finish'].data.foreach_set('color',expected)
        actual=np.empty(len(expected),dtype=np.float32)
        mesh.color_attributes['Finish'].data.foreach_get('color',actual)
        assert np.allclose(actual,expected), 'Vertex finish attributes were corrupted'
        ob=bpy.data.objects.new(f'Rack_LOD{lod}',mesh)
        bpy.context.scene.collection.objects.link(ob)
        return ob

result=[]
reports=[]
for lod in range(3):
    g=GameMesh()
    for ob in source:
        n=ob.name
        if any(s in n for s in ('punched upright','welded wire mesh','paint wear','contact scuff','Foot weld')):
            continue
        if lod>=1 and any(s in n for s in ('Anchor washer','Exposed anchor','Connector stud','retaining tab','Brace welded','channel fold')):
            continue
        if lod>=2 and any(s in n for s in ('Hex anchor','locking pin','Connector return','Adhesive','Protector sole','channel web')):
            continue
        g.source(ob,lod)

    # Real channel silhouette; a two-sided alpha-test face replaces 560 cut holes.
    for x in (-1.265,1.265):
        for y in (-.495,.495):
            s=1 if y<0 else -1
            def p(dx,dy,z): return (x+dx,y+dy*s,z)
            for xx in (-.045,.045):
                g.face([p(xx,-.04,.012),p(xx,.04,.012),p(xx,.04,3.66),p(xx,-.04,3.66)],green)
                inner=.026 if xx>0 else -.026
                g.face([p(xx,.04,.012),p(inner,.04,.012),p(inner,.04,3.66),p(xx,.04,3.66)],green)
            g.face([p(-.045,-.04,.012),p(.045,-.04,.012),p(.045,-.04,3.66),p(-.045,-.04,3.66)],
                   green,[(0,0),(1,0),(1,3.648/.0508),(0,3.648/.0508)],(-1,0 if lod<2 else 1))

    for z in (1.124,2.244,3.364):
        for cx in (-.61,.61):
            lo,hi=cx-.597,cx+.597
            if lod==0:
                for k in range(25):
                    x=lo+(hi-lo)*k/24
                    g.rod((x,-.539,z),(x,.539,z),.0024,zinc)
                    g.rod((x,-.539,z),(x,-.539,z-.034),.0024,zinc)
                    g.rod((x,.539,z),(x,.539,z-.034),.0024,zinc)
                for k in range(12):
                    y=-.532+k*1.064/11
                    g.rod((lo,y,z+.0047),(hi,y,z+.0047),.0023,zinc)
            else:
                g.face([(lo,-.539,z),(hi,-.539,z),(hi,.539,z),(lo,.539,z)],zinc,
                       [(0,0),(24,0),(24,11),(0,11)],(-2,0))
                for y in (-.539,.539):
                    g.face([(lo,y,z-.034),(hi,y,z-.034),(hi,y,z),(lo,y,z)],zinc,
                           [(0,0),(24,0),(24,.34),(0,.34)],(-2,1))
    ob=g.finish(lod)
    ob.data.calc_loop_triangles()
    reports.append({'lod':lod,'triangles':len(ob.data.loop_triangles),'vertices':len(ob.data.vertices),'renderers':1,'materials':1})
    result.append(ob)

# One material and one renderer at each LOD. Wear versions reuse these meshes.
mat=bpy.data.materials.new('RackSteel')
mat.diffuse_color=(.3,.3,.3,1)
for ob in result:
    ob.data.materials.append(mat)
for ob in bpy.context.scene.objects: ob.select_set(False)
for ob in result: ob.select_set(True)
bpy.context.view_layer.objects.active=result[0]
bpy.ops.export_scene.fbx(filepath=str(MODELS/'warehouse-rack-lods.fbx'),use_selection=True,
    object_types={'MESH'},use_mesh_modifiers=False,add_leaf_bones=False,bake_anim=False,
    axis_forward='-Z',axis_up='Y',apply_unit_scale=True,bake_space_transform=True,
    mesh_smooth_type='FACE',colors_type='LINEAR',path_mode='AUTO')

# Save only the low-detail models in a separate native file, never overwrite source.
for ob in list(bpy.data.objects):
    if ob not in result: bpy.data.objects.remove(ob,do_unlink=True)
for i,ob in enumerate(result):
    ob.hide_set(i!=0)
    ob.hide_render=(i!=0)
    ob['unity_shader']='OneShift/Rack Steel'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/one-shift/models/warehouse-rack-game.blend'),compress=True)

# Compact shared wear noise. RGB = large chips / grain / directional scuffs.
size=512
rng=np.random.default_rng(19)
def noise(grid):
    cells=rng.random((grid+1,grid+1))
    yy,xx=np.mgrid[0:size,0:size]/size*grid
    ix=xx.astype(int); iy=yy.astype(int)
    fx=xx-ix; fy=yy-iy
    fx=fx*fx*(3-2*fx); fy=fy*fy*(3-2*fy)
    return (cells[iy,ix]*(1-fx)+cells[iy,ix+1]*fx)*(1-fy)+(cells[iy+1,ix]*(1-fx)+cells[iy+1,ix+1]*fx)*fy
red=noise(10)*.40+noise(34)*.30+noise(120)*.30
green_channel=noise(8)*.3+noise(70)*.35+rng.random((size,size))*.35
scratches=np.zeros((size,size))
for i in range(200):
    x,y=rng.integers(0,size,2)
    length=int(rng.integers(3,48))
    scratches[y:min(y+int(rng.integers(1,3)),size),x:min(x+length,size)]=rng.uniform(.45,1)
pixels=np.stack((red,green_channel,scratches,np.ones_like(red)),axis=2).astype(np.float32)
image=bpy.data.images.new('RackWearNoise',width=size,height=size,alpha=True)
image.colorspace_settings.name='Non-Color'
image.pixels.foreach_set(pixels.ravel())
image.filepath_raw=str(TEXTURES/'rack-wear-noise.png')
image.file_format='PNG'
image.save()
report={'sourceTriangles':226708,'sourceRenderers':306,'lods':reports,
        'wearStates':['Clean','Used','Worn'],'noiseResolution':[size,size],
        'notes':'One shared mesh per LOD. Finish colors and face data are vertex attributes. Punched faces and distant wire decks use alpha testing. Simple box colliders are authored in Unity.'}
(MODELS/'rack-mesh-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('GAME_RACK_COMPLETE',json.dumps(report),flush=True)
