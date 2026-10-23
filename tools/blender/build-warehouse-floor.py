"""Author the One Shift concrete floor in Blender and export its Unity assets.

Run: blender --background --python tools/blender/build-warehouse-floor.py
No downloads or add-ons. Seeded numpy painting makes the PBR maps reproducible.
Coordinates in the paint functions are Unity metres (X/Z); Blender uses -X/-Y.
"""
import bpy
import math
import json
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'unity/OneShiftRackLab/Assets/RackLab'
SOURCE = ROOT / 'assets/one-shift/models'
TEX = DEST / 'Textures/WarehouseFloor'
TEX.mkdir(parents=True, exist_ok=True)
N = 4096
WIDTH, DEPTH = 23., 22.
XMIN, ZMIN = -11.5, -10.
rng = np.random.default_rng(230619)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'


def noise(size, cells):
    """Periodic smooth value noise, including across the tile boundary."""
    grid = rng.random((cells, cells), dtype=np.float32)
    coord = np.arange(size, dtype=np.float32) * cells / size
    low = coord.astype(np.int32)
    t = coord-low
    t = t*t*(3-2*t)
    row = grid[low[:, None] % cells, low[None, :] % cells]*(1-t)[None, :]
    row += grid[low[:, None] % cells, (low[None, :]+1) % cells]*t[None, :]
    row2 = grid[(low[:, None]+1) % cells, low[None, :] % cells]*(1-t)[None, :]
    row2 += grid[(low[:, None]+1) % cells, (low[None, :]+1) % cells]*t[None, :]
    return row*(1-t)[:, None]+row2*t[:, None]


def image(name, rgb, alpha=None, data=False):
    h, w = rgb.shape[:2]
    out = bpy.data.images.new(name, width=w, height=h, alpha=True)
    out.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
    rgba = np.ones((h,w,4), dtype=np.float32)
    rgba[:,:,:3] = rgb
    if alpha is not None: rgba[:,:,3] = alpha
    out.pixels.foreach_set(rgba.ravel())
    out.filepath_raw = str(TEX / (name+'.png'))
    out.file_format = 'PNG'
    out.save()
    return out


xx = XMIN+(np.arange(N, dtype=np.float32)+.5)*WIDTH/N
zz = ZMIN+(np.arange(N, dtype=np.float32)+.5)*DEPTH/N
X, Z = xx[None,:], zz[:,None]
print('Painting concrete at 4096 pixels', flush=True)
broad = noise(N, 11)
cloud = noise(N, 63)
grain = noise(N, 530)
fine = rng.random((N,N), dtype=np.float32)
value = .488+(broad-.5)*.065+(cloud-.5)*.045+(grain-.5)*.025+(fine-.5)*.022
# Slabs vary gently, without a checkerboard treatment.
xj = [-7.5,-3.5,.5,4.5,8.5]
zj = [-6,-2,2,6,10]
slab_colors = rng.uniform(-.014,.014,(6,6)).astype(np.float32)
value += slab_colors[np.searchsorted(zj,zz)[:,None],np.searchsorted(xj,xx)[None,:]]
# Burnished traffic lanes and faint overlapping power-trowel sweeps.
traffic = np.exp(-((X/6)**4))*np.exp(-((Z+2)/7)**4)
value += traffic*.013
for cx,cz in [(-6,-4),(-2,-5),(3,-3),(5,5),(-4,7),(8,-6)]:
    r = np.sqrt((X-cx)**2+(Z-cz)**2)
    value += np.sin(r*31+cloud*3)*.0025*np.exp(-(r/2.3)**4)
rgb = np.stack([value*1.014, value, value*.951],axis=-1)
smooth = np.clip(.23+traffic*.12+(broad-.5)*.10+(grain-.5)*.08,.12,.47)


def roi(x0,z0,x1,z1,pad=.1):
    ix0=max(0,int((min(x0,x1)-pad-XMIN)*N/WIDTH))
    ix1=min(N,int((max(x0,x1)+pad-XMIN)*N/WIDTH)+2)
    iz0=max(0,int((min(z0,z1)-pad-ZMIN)*N/DEPTH))
    iz1=min(N,int((max(z0,z1)+pad-ZMIN)*N/DEPTH)+2)
    return np.s_[iz0:iz1,ix0:ix1], xx[None,ix0:ix1], zz[iz0:iz1,None]


def stroke(target,a,b,width,strength=1,soft=.006):
    x0,z0=a; x1,z1=b
    sl,x,z=roi(x0,z0,x1,z1,width+soft*3)
    dx,dz=x1-x0,z1-z0
    t=np.clip(((x-x0)*dx+(z-z0)*dz)/max(dx*dx+dz*dz,1e-8),0,1)
    distance=np.sqrt((x-x0-t*dx)**2+(z-z0-t*dz)**2)
    mask=np.clip((width*.5+soft-distance)/max(soft,1e-6),0,1)*strength
    np.maximum(target[sl],mask,out=target[sl])


def rect(target,x0,z0,x1,z1,strength=1):
    sl,x,z=roi(x0,z0,x1,z1,0)
    target[sl]=np.maximum(target[sl],((x>=x0)&(x<=x1)&(z>=z0)&(z<=z1))*strength)


def blend(mask,color,amount=1):
    a=np.clip(mask*amount,0,1)
    for channel in range(3):
        rgb[:,:,channel]*=1-a
        rgb[:,:,channel]+=a*color[channel]


# Accumulated rubber from narrow solid forklift tires. Partial arcs and paired
# approaches, with softly rubbed edges, not identical painted black circles.
rubber=np.zeros((N,N),dtype=np.float32)
for cx,cz,radius,start,end,amount in [
    (-3.7,-3.4,2.3,-1.7,.6,.18),(1.7,-1.4,2.8,2.7,4.8,.15),
    (5.2,-5.8,1.8,-.4,1.65,.12),(-6.1,4.7,1.9,.7,2.6,.1)]:
    for offset in [-.48,.48]:
        angles=np.linspace(start,end,75)
        points=[(cx+(radius+offset)*math.cos(t),cz+(radius+offset)*math.sin(t)) for t in angles]
        for a,b in zip(points,points[1:]): stroke(rubber,a,b,.14,amount,.04)
for cx in [-4.2,0,4.2]:
    for offset in [-.48,.48]:
        stroke(rubber,(cx+offset,-3.8),(cx+offset,.25),.13,.10,.035)
for _ in range(38):
    x=float(rng.uniform(-7.8,7.8)); z=float(rng.uniform(-7,7))
    stroke(rubber,(x,z),(x+rng.uniform(-.35,.35),z+rng.uniform(.15,.65)),.018,float(rng.uniform(.04,.15)),.009)
rubber*=np.clip(.55+grain+cloud*.3,0,1)
blend(rubber,(.13,.135,.127))
smooth+=rubber*.22

# A few old, soaked-in fluid marks, with ringed edges and irregular outlines.
for cx,cz,rx,rz,opacity in [(6.1,1.15,.38,.26,.17),(-5.4,2.4,.23,.3,.13),
                           (3.9,-5.6,.18,.31,.11),(-8,6.9,.6,.3,.10)]:
    sl,x,z=roi(cx-rx*2,cz-rz*2,cx+rx*2,cz+rz*2)
    d=np.sqrt(((x-cx)/rx)**2+((z-cz)/rz)**2)
    m=np.clip((1.2+cloud[sl]*.6-d)*2,0,1)*opacity
    m+=np.exp(-((d-1.15-cloud[sl]*.2)/.11)**2)*opacity*.3
    for c,v in enumerate((.19,.173,.14)): rgb[sl][...,c]=rgb[sl][...,c]*(1-m)+v*m
    smooth[sl]+=m*.35

# Two squared-off maintenance patches, flush with the surrounding slab.
for x0,z0,x1,z1 in [(3.5,-6.5,4.42,-5.75),(-7.4,5.2,-6.6,5.8)]:
    sl,x,z=roi(x0,z0,x1,z1,.025)
    edge=np.minimum(np.minimum(x-x0,x1-x),np.minimum(z-z0,z1-z))
    m=np.clip((edge+(grain[sl]-.5)*.012)/.009,0,1)*.75
    for c,v in enumerate((.39,.389,.367)): rgb[sl][...,c]=rgb[sl][...,c]*(1-m)+(v+(grain[sl]-.5)*.05)*m
    smooth[sl]*=1-m*.25

# Fine shrinkage cracks are sparse and branch from existing cuts.
cracks=np.zeros((N,N),dtype=np.float32)
for points in [[(-3.5,-6),(-3.18,-5.7),(-3.08,-5.39),(-2.81,-5.16),(-2.75,-4.92)],
               [(4.5,2),(4.79,1.76),(4.98,1.39),(5.24,1.27)],
               [(-7.5,6),(-7.83,6.26),(-8.02,6.7),(-8.41,6.92)],
               [(-3.08,-5.39),(-2.77,-5.41),(-2.56,-5.55)]]:
    for a,b in zip(points,points[1:]): stroke(cracks,a,b,.008,.4,.007)
blend(cracks,(.20,.20,.185))

# Safety paint is part of the surface, with physical abrasion rather than
# floating decal cards. Side pedestrian lanes and a small keep-clear hatch.
paint=np.zeros((N,N),dtype=np.float32)
for x in [-8.8,8.8]: stroke(paint,(x,-8.8),(x,9.5),.10)
for cx in [-4.2,0,4.2]:
    stroke(paint,(cx-1.62,.65),(cx+1.62,.65),.08)
    for x in [cx-1.62,cx+1.62]: stroke(paint,(x,.65),(x,3),.08)
for a,b in [((-8.75,-7.5),(-6.4,-7.5)),((-6.4,-7.5),(-6.4,-5.4)),((-6.4,-5.4),(-8.75,-5.4))]:
    stroke(paint,a,b,.08)
for shift in np.arange(-1.7,2.3,.48):
    # Clip diagonal hatch to its small rectangular zone.
    xa=max(-8.7,-8.7+shift); za=-7.45+max(0,-shift)
    length=min(-6.45-xa,-5.45-za)
    if length>0: stroke(paint,(xa,za),(xa+length,za+length),.075,.85)

glyphs={
 '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],
 '2':['111','001','111','100','111'],'3':['111','001','111','001','111'],
 'K':['101','110','100','110','101'],'E':['111','100','110','100','111'],
 'P':['110','101','110','100','100'],'C':['111','100','100','100','111'],
 'L':['100','100','100','100','111'],'A':['010','101','111','101','101'],
 'R':['110','101','110','110','101'],' ':['000']*5}


def stencil(text,cx,z,cell):
    left=cx-(len(text)*4-1)*cell/2
    for i,ch in enumerate(text):
        for row,line in enumerate(glyphs[ch]):
            for col,v in enumerate(line):
                if v=='1':
                    x0=left+(i*4+col)*cell
                    z0=z+(4-row)*cell
                    rect(paint,x0,z0,x0+cell*.88,z0+cell*.88)


for i,cx in enumerate([-4.2,0,4.2]): stencil('0'+str(i+1),cx,-.25,.085)
stencil('KEEP CLEAR',-7.6,-8.12,.052)
# Worn edges and patchy islands of old yellow are driven by two scales.
wear=np.clip((grain*.6+fine*.4-.23)*2.5,0,1)
wear*=1-np.clip((cloud-.6)*2.2,0,.75)*traffic
paint*=wear
paint*=1-rubber*1.7
blend(paint,(.75,.565,.19),.88)
smooth=smooth*(1-paint*.45)+paint*.16

# Saw-cut sealant remains dark after paint; subtle stained shoulders avoid a
# perfect CAD grid. The mesh carries a 6 mm recess at the same locations.
distance=np.minimum(np.min(np.abs(X-np.array(xj,dtype=np.float32)[:,None,None]),axis=0),
                    np.min(np.abs(Z-np.array(zj,dtype=np.float32)[:,None,None]),axis=0))
shoulder=np.exp(-distance/.035)*(.045+cloud*.04)
blend(shoulder,(.26,.25,.22))
joint=np.clip((.013-distance)/.008,0,1)*.78
blend(joint,(.16,.16,.145))
smooth*=1-joint*.5
albedo=image('warehouse-floor-albedo',np.clip(rgb,0,1))
del rgb,value,rubber,paint,wear,traffic

# URP's metallic workflow: RGB zero (concrete is dielectric), A smoothness.
mask=image('warehouse-floor-metal-smooth',np.zeros((N//2,N//2,3),np.float32),smooth[::2,::2],True)
# Large-map normals include very shallow repaired/cracked/joint edges.
height=(cloud*.00035+grain*.00012-cracks*.002-joint*.003)[::2,::2]
dz,dx=np.gradient(height,DEPTH/(N//2),WIDTH/(N//2))
normal=np.stack([-dx,-dz,np.ones_like(dx)],axis=-1)
normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
normal_image=image('warehouse-floor-normal',normal*.5+.5,data=True)
del broad,cloud,grain,fine,smooth,distance,shoulder,joint,cracks,height,normal,dx,dz

# A separate, seamless 1.5 m detail normal retains grain at standing distance.
d=1024
micro=noise(d,170)*.00017+noise(d,470)*.000045
micro-=np.maximum(noise(d,340)-.79,0)*.003
dx=(np.roll(micro,-1,1)-np.roll(micro,1,1))/(3/d)
dy=(np.roll(micro,-1,0)-np.roll(micro,1,0))/(3/d)
normal=np.stack([-dx,-dy,np.ones_like(dx)],axis=-1)
normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
detail=image('warehouse-floor-detail-normal',normal*.5+.5,data=True)

print('Building editable slab geometry',flush=True)
mat=bpy.data.materials.new('Sealed industrial concrete with worn safety paint')
mat.use_nodes=True
nodes=mat.node_tree.nodes; links=mat.node_tree.links
bsdf=nodes.get('Principled BSDF')
bsdf.inputs['Metallic'].default_value=0
base=nodes.new('ShaderNodeTexImage');base.image=albedo;base.location=(-700,260)
links.new(base.outputs['Color'],bsdf.inputs['Base Color'])
packed=nodes.new('ShaderNodeTexImage');packed.image=mask;packed.location=(-700,-30)
invert=nodes.new('ShaderNodeMath');invert.operation='SUBTRACT';invert.inputs[0].default_value=1
links.new(packed.outputs['Alpha'],invert.inputs[1]);links.new(invert.outputs[0],bsdf.inputs['Roughness'])
norm=nodes.new('ShaderNodeTexImage');norm.image=normal_image;norm.location=(-700,-310)
normalmap=nodes.new('ShaderNodeNormalMap');links.new(norm.outputs['Color'],normalmap.inputs['Color'])
links.new(normalmap.outputs[0],bsdf.inputs['Normal'])
mat.diffuse_color=(.49,.48,.45,1)

vertices=[]; faces=[]


def face(coords):
    start=len(vertices);vertices.extend(coords);faces.append(tuple(reversed(range(start,start+len(coords)))))


# FBX's handedness conversion negates X as well as mapping -Y to Unity Z.
# Reverse polygon winding with X so upper faces still point upward.
def point(x,z,h): return (-x,-z,h)


def slab(x0,z0,x1,z1):
    bevel=.0025
    corners=[(x0,z1),(x1,z1),(x1,z0),(x0,z0)]
    inner=[(x0+bevel,z1-bevel),(x1-bevel,z1-bevel),
           (x1-bevel,z0+bevel),(x0+bevel,z0+bevel)]
    face([point(x,z,0) for x,z in inner])
    for i in range(4):
        j=(i+1)%4
        face([point(*inner[i],0),point(*corners[i],-bevel),point(*corners[j],-bevel),point(*inner[j],0)])
        face([point(*corners[i],-bevel),point(*corners[i],-.24),point(*corners[j],-.24),point(*corners[j],-bevel)])


xb=[XMIN]+xj+[XMIN+WIDTH];zb=[ZMIN]+zj+[ZMIN+DEPTH]
for ix in range(len(xb)-1):
    for iz in range(len(zb)-1):
        slab(xb[ix]+(.004 if ix else 0),zb[iz]+(.004 if iz else 0),
             xb[ix+1]-(.004 if ix<len(xb)-2 else 0),zb[iz+1]-(.004 if iz<len(zb)-2 else 0))
# A recessed continuous sealant backing fills every cut, all in the same mesh.
face([point(XMIN,ZMIN+DEPTH,-.006),point(XMIN+WIDTH,ZMIN+DEPTH,-.006),
      point(XMIN+WIDTH,ZMIN,-.006),point(XMIN,ZMIN,-.006)])
mesh=bpy.data.meshes.new('Warehouse floor / shallow saw cuts')
mesh.from_pydata(vertices,[],faces);mesh.update();mesh.materials.append(mat)
uv=mesh.uv_layers.new(name='Floor plan metres')
detailuv=mesh.uv_layers.new(name='Detail metres')
for p in mesh.polygons:
    for li in p.loop_indices:
        v=mesh.vertices[mesh.loops[li].vertex_index].co
        uv.data[li].uv=((-v.x-XMIN)/WIDTH,(-v.y-ZMIN)/DEPTH)
        detailuv.data[li].uv=(-v.x/1.5,-v.y/1.5)
ob=bpy.data.objects.new('WarehouseFloor',mesh);bpy.context.collection.objects.link(ob)
ob['dimensions_metres']='23 x 22 x 0.24; walking surface at Unity Y=0'
ob['finish']='Sealed power-trowelled concrete, recessed joints, worn yellow paint'
ob['collision']='One continuous Unity BoxCollider; cosmetic joints cannot snag wheels'
ob['source_seed']=230619
bpy.context.view_layer.objects.active=ob;ob.select_set(True)
bpy.ops.export_scene.fbx(filepath=str(DEST/'Models/warehouse-floor.fbx'),use_selection=True,
    object_types={'MESH'},add_leaf_bones=False,bake_anim=False,axis_forward='-Z',axis_up='Y',
    apply_unit_scale=True,bake_space_transform=True,mesh_smooth_type='FACE',path_mode='STRIP')

# Inspection lighting and camera stay in the native .blend, not in the FBX.
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.world=bpy.data.worlds.new('Warehouse ambient');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.60,.65,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
for name,loc,power,size in [('Soft overhead',(-3,3,7),1800,8),('Cool fill',(7,-5,5),900,6)]:
    light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size
    item=bpy.data.objects.new(name,light);bpy.context.collection.objects.link(item);item.location=loc
camera=bpy.data.cameras.new('Floor inspection');cam=bpy.data.objects.new('Floor inspection',camera)
bpy.context.collection.objects.link(cam);cam.location=(-12,15,16)
direction=Vector((0,-.5,0))-cam.location;cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
camera.type='ORTHO';camera.ortho_scale=30;scene.camera=cam
scene.render.resolution_x=1500;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(SOURCE/'warehouse-floor-preview.png')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=28
            area.spaces.active.region_3d.view_location=(0,-1,0)
            area.spaces.active.shading.type='MATERIAL'
# Pack maps so the editable Blender source travels without missing textures.
for img in [albedo,mask,normal_image,detail]: img.pack()
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'warehouse-floor.blend'),compress=True)
mesh.calc_loop_triangles()
report={'seed':230619,'dimensions_metres':[23,.24,22],
        'triangles':len(mesh.loop_triangles),'renderers':1,'materials':1,
        'slabs':36,'joint_width_mm':8,'joint_depth_mm':6,
        'albedo_resolution':4096,'normal_and_mask_resolution':2048,'detail_normal_resolution':1024,
        'detail_tile_metres':1.5,'collision':'One continuous box supplied by Unity',
        'blender_source':'assets/one-shift/models/warehouse-floor.blend'}
(DEST/'Models/warehouse-floor-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report),flush=True)
bpy.ops.render.render(write_still=True)
