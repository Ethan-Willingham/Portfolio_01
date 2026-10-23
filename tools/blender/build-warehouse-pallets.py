"""Build four editable, metre-scale warehouse pallet studies in Blender 5.2.

Run in a separate Blender process:
  blender --background --python tools/blender/build-warehouse-pallets.py
Pass -- --quick for a smaller proof render; -- --no-render builds only.

Original geometry and generated pine PBR textures, no downloaded texture assets.
Construction reference: Mallard Manufacturing's Pallet Type & Quality sheet.
This script never writes to the Unity project or the existing rack asset.
"""

import bpy
import bmesh
import math
import random
import json
import sys
import struct
import zlib
from pathlib import Path
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/one-shift/models/pallets'
TEX = OUT / 'textures'
TEX.mkdir(parents=True, exist_ok=True)
QUICK = '--quick' in sys.argv
NO_RENDER = '--no-render' in sys.argv
INCH = .0254
WIDTH, LENGTH = 40*INCH, 48*INCH
THICK, RAIL_H, RAIL_W = .625*INCH, 3.5*INCH, 1.375*INCH
HEIGHT = 2*THICK + RAIL_H
RAILS = (-WIDTH/2+RAIL_W/2, 0, WIDTH/2-RAIL_W/2)
ATLAS = 2048
ROW = 128
GRAIN_W = 1536
VARIANTS = [
    ('01_Fresh_Pine', 'FRESH PINE', 'Pale sapwood / knots / saw marks', 0, (-.82,.90,0)),
    ('02_Working_Wear', 'WORKING WEAR', 'Dirty grain / fork rub / rounded edges', 1, (.82,.90,0)),
    ('03_Split_Battered', 'SPLIT & BATTERED', 'Open checks / chipped ends / torn fibres', 2, (-.82,-.90,0)),
    ('04_Repaired', 'REPAIRED', 'Old wood / one fresh replacement board', 3, (.82,-.90,0)),
]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'Warehouse pallets | four conditions'
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
scene.unit_settings.length_unit = 'METERS'


def png(path, pixels):
    """Write original 8-bit data, avoiding an implicit Blender display transform."""
    arr = np.uint8(np.clip(pixels, 0, 1)*255+.5)
    h,w,c = arr.shape
    def chunk(tag, data):
        return struct.pack('!I',len(data))+tag+data+struct.pack('!I',zlib.crc32(tag+data)&0xffffffff)
    # Atlas calculations use a bottom-left origin, PNG uses top-left.
    raw = b''.join(b'\x00'+row.tobytes() for row in arr[::-1])
    header = struct.pack('!2I5B',w,h,8,2 if c==3 else 6,0,0,0)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',header)+chunk(b'IDAT',zlib.compress(raw,7))+chunk(b'IEND',b''))


def noise(h,w,ny,nx,rng):
    a = rng.random((ny+1,nx+1)).astype(np.float32)
    xx = np.linspace(0,nx-.001,w,dtype=np.float32)
    yy = np.linspace(0,ny-.001,h,dtype=np.float32)
    xi,yi = xx.astype(int),yy.astype(int)
    xf,yf = xx-xi,yy-yi
    xf,yf = xf*xf*(3-2*xf),yf*yf*(3-2*yf)
    bottom = a[yi[:,None],xi]*(1-xf)+a[yi[:,None],xi+1]*xf
    top = a[yi[:,None]+1,xi]*(1-xf)+a[yi[:,None]+1,xi+1]*xf
    return bottom*(1-yf[:,None])+top*yf[:,None]


def wood_tile(condition,index):
    rng = np.random.default_rng(700+condition*131+index*17)
    h,w = ROW-8,GRAIN_W-8
    u = np.linspace(0,1,w,dtype=np.float32)[None,:]
    v = np.linspace(0,1,h,dtype=np.float32)[:,None]
    # Only the second top board on the repaired pallet is new timber.
    fresh = condition==0 or (condition==3 and index==1)
    age = 0 if fresh else (1 if condition==1 else 1.65)
    slow = noise(h,w,3,7,rng)-.5
    fibre = noise(h,w,85,13,rng)-.5
    fuzz = noise(h,w,110,240,rng)-.5
    curl = v + .045*np.sin(u*8+rng.uniform(0,6)) + .028*slow
    knots = []
    for k in range(int(rng.integers(1,4))):
        ku,kv = rng.uniform(.08,.92),rng.uniform(-.18,1.18)
        su,sv = rng.uniform(.014,.032),rng.uniform(.08,.18)
        du,dv = u-ku,v-kv
        curl += .075*np.tanh(dv*12)*np.exp(-((du/(su*3.6))**2+(dv/(sv*2.7))**2))
        knots.append((du,dv,su,sv))
    # Offset log centre produces imperfect cathedral grain rather than straight stripes.
    centre = rng.uniform(-1.4,-.35)
    radius = np.sqrt((curl-centre)**2+((u-rng.uniform(-.5,1.5))*.75)**2)
    phase = radius*rng.uniform(12,20)+.16*noise(h,w,8,5,rng)
    late = (.5+.5*np.sin(phase*math.tau))**13
    fine = (.5+.5*np.sin((curl*210+.5*slow)*math.tau))**8
    base = np.array((.79,.689,.516) if fresh else ((.61,.545,.435) if condition==1 else (.508,.471,.397)))
    base += rng.uniform(-.045,.045)*np.array((1,.94,.8))
    tint = rng.uniform(-.018,.018)
    base += np.array((tint,0,-tint))
    shade = -.072*late-.022*fine+.045*slow+.026*fibre+.024*fuzz
    # Rough-sawn transverse blade chatter is subtle, especially after repeated use.
    saw = (np.sin(u*math.tau*rng.uniform(110,170)+slow*9)*.5+.5)**14
    saw *= np.clip(noise(h,w,12,28,rng)-.2,0,1)
    shade -= saw*(.010 if fresh else .004)
    color = np.broadcast_to(base,(h,w,3)).copy()+shade[...,None]
    relief = -.00009*late + .000055*fibre + .000035*fuzz - saw*.000018
    for du,dv,su,sv in knots:
        rr = np.sqrt((du/su)**2+(dv/sv)**2)
        core = np.exp(-(rr*1.35)**4)
        ring = (.5+.5*np.sin(rr*16+slow*5))**5*np.exp(-rr*1.25)
        color -= core[...,None]*np.array((.29,.30,.25))
        color -= ring[...,None]*np.array((.10,.095,.075))
        relief -= core*.00018+ring*.00014
        # Resin bleeding into the adjoining fibres of cheap softwood.
        resin = np.exp(-((du/(su*2.3))**2+(dv/(sv*.65))**2))*(1-core)
        color += resin[...,None]*np.array((.024,-.012,-.035))
    if age:
        grime = np.maximum(0,noise(h,w,6,11,rng)-.43)
        edge = np.exp(-u*24)+np.exp(-(1-u)*24)
        rub = noise(h,w,15,19,rng)
        color -= (grime*age*.18+edge*rub*.048)[...,None]*np.array((.8,.85,.86))
        # Patchy compression marks, with long torn fibres inside each scraped patch.
        for k in range(5 if condition==1 else 9):
            cu = rng.choice([rng.uniform(.02,.18),rng.uniform(.82,.98),rng.uniform(.2,.8)])
            cv = rng.uniform(-.05,1.05)
            du,dv = u-cu,v-cv
            su,sv = rng.uniform(.04,.14),rng.uniform(.05,.26)
            mask = np.exp(-((du/su)**4+(dv/sv)**4))
            broken = np.clip((noise(h,w,75,38,rng)-.34)*2.5,0,1)
            scrape = mask*broken
            color += scrape[...,None]*np.array((.085,.067,.043))
            relief -= scrape*.00022
        # Fine directional gouges cluster near the ends where pallets are dragged.
        for k in range(16 if condition==1 else 28):
            cu = rng.choice([rng.uniform(0,.2),rng.uniform(.8,1)])
            cv = rng.uniform(0,1)
            length = rng.uniform(.025,.16)
            tilt = rng.uniform(-.25,.25)
            dy = v-cv-(u-cu)*tilt
            taper = np.maximum(0,1-((u-cu)/length)**2)
            line = np.exp(-(dy/(rng.uniform(.003,.008)*taper+1e-5))**2)*taper
            lip = np.exp(-((dy-.007)/.006)**2)*taper
            color -= line[...,None]*np.array((.14,.13,.105))
            color += lip[...,None]*np.array((.07,.055,.034))
            relief -= line*.00045
        if index in (0,5,6,7,12,13,14):
            # Fork contact and dragged lead edges: irregular charcoal-brown rubs.
            contact = np.exp(-((v-.04)/.20)**2)
            positions = np.exp(-((u-.24)/.10)**4)+np.exp(-((u-.73)/.08)**4)
            broken = np.clip((noise(h,w,20,35,rng)-.35)*2.8,0,1)
            bruise = np.minimum(1,positions)*contact*broken
            color -= bruise[...,None]*np.array((.19,.177,.15))*(.7 if condition==1 else 1)
            relief -= bruise*.00016
        # Ground-in nail staining; physical nail heads are separate meshes.
        if index<12:
            for nx in (.018,.5,.982):
                for ny in (.32,.68):
                    rr = ((u-nx)/.009)**2+((v-ny)/.075)**2
                    halo = np.exp(-rr*1.7)*age
                    color -= halo[...,None]*np.array((.048,.061,.062))
    rough = np.clip(.78+.1*fibre+.08*slow+age*.035,.58,.96)
    if age:
        rough = np.clip(rough-.10*grime,.56,.96)
    return np.clip(color,.05,.92),relief,rough


def atlas(condition,slug):
    colors = np.zeros((ATLAS,ATLAS,3),dtype=np.float32)
    normals = np.zeros_like(colors)
    normals[:,:,:] = (.5,.5,1)
    roughs = np.ones_like(colors)*.8
    for i in range(16):
        color,height,rough = wood_tile(condition,i)
        # Correct physical scale for normal derivatives on a deck board.
        dy,dx = np.gradient(height,.14/height.shape[0],WIDTH/height.shape[1])
        n = np.stack((-dx,-dy,np.ones_like(dx)),axis=-1)
        n /= np.linalg.norm(n,axis=-1,keepdims=True)
        normal = n*.5+.5
        region = slice(i*ROW,(i+1)*ROW)
        colors[region,:GRAIN_W] = np.pad(color,((4,4),(4,4),(0,0)),mode='edge')
        normals[region,:GRAIN_W] = np.pad(normal,((4,4),(4,4),(0,0)),mode='edge')
        roughs[region,:GRAIN_W] = np.pad(np.repeat(rough[:,:,None],3,axis=2),((4,4),(4,4),(0,0)),mode='edge')
        # End grain: growth rings cross the thickness, never run down the board.
        eh,ew = ROW-8,ATLAS-GRAIN_W-8
        xx = np.linspace(-1,1,ew)[None,:]
        yy = np.linspace(0,.42,eh)[:,None]
        rr = np.sqrt((xx*.75+.18)**2+(yy+.5)**2)
        rng = np.random.default_rng(2100+condition*40+i)
        bands = (.5+.5*np.sin(rr*130+noise(eh,ew,8,9,rng)*.6))**9
        mean = np.mean(color,axis=(0,1))*.93
        end = mean + (noise(eh,ew,45,130,rng)[...,None]-.5)*.055-bands[...,None]*.055
        colors[region,GRAIN_W:] = np.pad(end,((4,4),(4,4),(0,0)),mode='edge')
    paths = {}
    for kind,data in [('BaseColor',colors),('Normal',normals),('Roughness',roughs)]:
        path = TEX/f'{slug}_{kind}.png'
        png(path,data)
        paths[kind] = path
    mat = bpy.data.materials.new(slug+' | pine PBR')
    mat.use_nodes = True
    mat.diffuse_color = (*colors[64,700],1)
    nt = mat.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Specular IOR Level'].default_value = .23
    p.location = (340,40)
    for i,(kind,path) in enumerate(paths.items()):
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(str(path))
        tex.image.colorspace_settings.name = 'sRGB' if kind=='BaseColor' else 'Non-Color'
        tex.image.pack()
        tex.label = kind+' | original generated atlas'
        tex.location = (-500,280-i*300)
        tex.interpolation = 'Linear'
        if kind=='Normal':
            normal = nt.nodes.new('ShaderNodeNormalMap')
            normal.location = (70,-180)
            normal.inputs['Strength'].default_value = .8
            nt.links.new(tex.outputs['Color'],normal.inputs['Color'])
            nt.links.new(normal.outputs['Normal'],p.inputs['Normal'])
        else:
            nt.links.new(tex.outputs['Color'],p.inputs['Base Color' if kind=='BaseColor' else 'Roughness'])
    print('PALLET_ATLAS_READY',slug,flush=True)
    return mat


def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c


def solid(name,color,rough=.7,metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color,1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color,1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    return m


def mesh(name,verts,faces,mat,coll):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts,[],faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    ob = bpy.data.objects.new(name,data)
    coll.objects.link(ob)
    data.materials.append(mat)
    return ob


def bevel(ob,width=.0007):
    m = ob.modifiers.new('Small bruised timber edges','BEVEL')
    m.width = width
    m.segments = 2
    m.limit_method = 'ANGLE'
    m.angle_limit = .45
    m = ob.modifiers.new('Board corner normals','WEIGHTED_NORMAL')
    m.keep_sharp = True
    m.weight = 40


def board_uv(ob,index,length,width,height):
    data = ob.data
    uv = data.uv_layers.new(name='PineAtlasUV')
    for poly in data.polygons:
        axis = max(range(3),key=lambda a:abs(poly.normal[a]))
        for li in poly.loop_indices:
            x,y,z = data.vertices[data.loops[li].vertex_index].co
            if axis==0:
                s,t = y/width+.5,z/height+.5
                u = (GRAIN_W+4+np.clip(s,0,1)*(ATLAS-GRAIN_W-8))/ATLAS
            else:
                s = x/length+.5
                t = y/width+.5 if axis==2 else z/height+.5
                u = (4+np.clip(s,0,1)*(GRAIN_W-8))/ATLAS
            v = (index*ROW+4+np.clip(t,0,1)*(ROW-8))/ATLAS
            uv.data[li].uv = (float(u),float(v))


def extrude_xy(name,poly,thick,mat,coll,warp=0):
    n = len(poly)
    verts = [(x,y,z+warp*math.sin(x*5)*y) for z in (-thick/2,thick/2) for x,y in poly]
    faces = [tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,verts,faces,mat,coll)


def deck_outline(length,width,rng,wear,split=False,chip=False):
    l,w = length/2,width/2
    rough = (.00035,.0012,.0021,.0017)[wear]
    xs = np.linspace(-l,l,17)
    bottom = []
    top = []
    for x in xs:
        dent = rng.uniform(0,rough)
        if wear and x>l-.18:
            dent += rng.uniform(0,.003 if wear==1 else .007)
        if chip and x>l-.13:
            dent += (x-(l-.13))/.13 * (.038 if wear==2 else .015)
        bottom.append((x,-w+dent))
        top.append((x,w-rng.uniform(0,rough)))
    right = []
    if split:
        yc = width*.12
        gap = .005 if wear==2 else .0025
        depth = .25 if wear==2 else .115
        right = [(l,yc-gap), (l-.045,yc-.003), (l-.09,yc-.004),
                 (l-depth*.72,yc+.001), (l-depth,yc-.003),
                 (l-depth*.70,yc+.004), (l-.092,yc+.002),
                 (l-.043,yc+.004),(l,yc+gap)]
    return bottom+right+top[::-1]


def stringer(name,mat,coll,index,rng,condition):
    l,h = LENGTH/2,RAIL_H/2
    base = [(l,-h)]
    # Trace the underside from the far end back toward the near end.
    # Rounded inside shoulders approximate the cutter radius, as on real stringers.
    for centre in (.3302,-.3302):
        a,b = centre-.1143,centre+.1143
        r=.01905
        roof = -h+.0381
        base += [(b,-h),(b,roof-r)]
        for j in range(1,5):
            t=j*math.pi/8
            base.append((b-r+r*math.cos(t),roof-r+r*math.sin(t)))
        base.append((a+r,roof))
        for j in range(1,5):
            t=math.pi/2+j*math.pi/8
            base.append((a+r+r*math.cos(t),roof-r+r*math.sin(t)))
        base.append((a,-h))
    if condition:
        chip=.008 if condition==1 else .017
        base += [(-l+chip,-h),(-l+chip*.3,-h+chip*.35),
                 (-l,-h+chip),(-l,h-chip*.65),(-l+chip*.6,h),(l,h)]
    else:
        base += [(-l,-h),(-l,h),(l,h)]
    n=len(base)
    verts = [(x,y,z) for y in (-RAIL_W/2,RAIL_W/2) for x,z in base]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    ob=mesh(name,verts,faces,mat,coll)
    board_uv(ob,index,LENGTH,RAIL_W,RAIL_H)
    bevel(ob,.0006 if condition==0 else .001)
    return ob


def nail_mesh(name,centres,mat,coll,condition):
    verts,faces=[],[]
    rng=random.Random(987+condition)
    for x,y,z,sign in centres:
        count=10
        rad=rng.uniform(.0025,.0031)
        start=len(verts)
        # A stamped crown with a shallow bevel, mostly driven flush with the wood.
        for dz,r in [(-.0002,rad),(.0002,rad),(.00048,rad*.76)]:
            for k in range(count):
                a=k*math.tau/count
                verts.append((x+r*math.cos(a),y+r*math.sin(a),z+dz*sign))
        for ring in range(2):
            for k in range(count):
                q=(k+1)%count
                faces.append(tuple(start+v for v in (ring*count+k,ring*count+q,(ring+1)*count+q,(ring+1)*count+k)))
        faces.append(tuple(start+20+k for k in range(count)))
        faces.append(tuple(start+k for k in range(count-1,-1,-1)))
    return mesh(name,verts,faces,mat,coll)


def make_pallet(slug,label,subtitle,condition,position):
    coll=collection(slug+' | EDITABLE ASSET')
    root=bpy.data.objects.new(slug,None)
    coll.objects.link(root)
    root.location=position
    root.empty_display_type='PLAIN_AXES'
    root.empty_display_size=.12
    root['nominal_footprint_m']=[WIDTH,LENGTH]
    root['nominal_height_m']=HEIGHT
    root['condition']=subtitle
    root['pivot']='Floor centre; +Y runs along the 48-inch stringers'
    root['role']='Visual game asset; individual boards and physical open splits'
    mat=atlas(condition,slug)
    nailmat=solid(slug+' | nail steel',(.15,.16,.145) if condition==0 else (.075,.061,.043),.49 if condition==0 else .82,.75 if condition==0 else .42)
    rng=random.Random(400+condition)
    nails=[]
    boards=[]
    top_widths=[5.5*INCH]+[3.5*INCH]*5+[5.5*INCH]
    gap=(LENGTH-sum(top_widths))/6
    top_y=[]
    cursor=-LENGTH/2
    for w in top_widths:
        top_y.append(cursor+w/2)
        cursor+=w+gap
    bottom_y=[-LENGTH/2+2.75*INCH,-.1143,0,.1143,LENGTH/2-2.75*INCH]
    bottom_widths=[5.5*INCH]+[3.5*INCH]*3+[5.5*INCH]
    for layer,widths,ys,z in [('Top',top_widths,top_y,THICK+RAIL_H+THICK/2),('Bottom',bottom_widths,bottom_y,THICK/2)]:
        for j,(w,y) in enumerate(zip(widths,ys)):
            index=j if layer=='Top' else 7+j
            is_repair=condition==3 and index==1
            wear=0 if is_repair else condition
            split=(condition==2 and index in (0,2,5,8)) or (condition==1 and index==6) or (condition==3 and index in (4,10))
            chip=(condition==2 and index in (0,5,7)) or (condition==3 and index==0)
            poly=deck_outline(WIDTH,w,rng,wear,split,chip)
            ob=extrude_xy(f'{slug} | {layer} board {j+1:02d}'+(' | new repair' if is_repair else ''),poly,THICK,mat,coll,.006 if wear else .001)
            ob.parent=root
            ob.location=(0,y,z)
            board_uv(ob,index,WIDTH,w,THICK)
            bevel(ob,.00045 if wear==0 else .00085)
            ob['part']='deckboard'
            ob['has_open_split']=split
            ob['replacement_board']=is_repair
            boards.append(ob)
            lead=j in (0,len(widths)-1)
            for x in RAILS:
                for k in range(3 if lead else 2):
                    ny=y+w*((k+1)/(4 if lead else 3)-.5)
                    nx=x+(-1 if k%2 else 1)*.006
                    # Leave the deliberately missing corner without floating hardware.
                    if chip and nx>WIDTH/2-.05 and ny<y-w/2+.04:
                        continue
                    surf=z+THICK/2 if layer=='Top' else z-THICK/2
                    surf += (.006 if wear else .001)*math.sin(nx*5)*(ny-y)
                    nails.append((nx,ny,surf,1 if layer=='Top' else -1))
    for i,x in enumerate(RAILS):
        ob=stringer(f'{slug} | Notched stringer {i+1}',mat,coll,12+i,rng,condition)
        ob.parent=root
        ob.location=(x,0,THICK+RAIL_H/2)
        ob.rotation_euler.z=math.pi/2
        ob['part']='notched_stringer'
        boards.append(ob)
    hardware=nail_mesh(slug+' | Driven nail heads',nails,nailmat,coll,condition)
    hardware.parent=root
    hardware['nail_count']=len(nails)
    if condition==2:
        # Three attached, tapered fibres lifted at the torn front corner.
        for j in range(3):
            x=.355+j*.028
            y=top_y[0]-.045+j*.003
            z=HEIGHT-.005
            verts=[(x-.08,y,z),(x+.06,y+.001,z+.006),(x-.04,y+.004,z+.011),(x-.075,y+.005,z-.004)]
            splinter=mesh(f'{slug} | Attached splinter {j+1}',verts,[(0,1,2),(0,3,1),(0,2,3),(1,3,2)],mat,coll)
            splinter.parent=root
            board_uv(splinter,0,WIDTH,top_widths[0],THICK)
            splinter['part']='attached_splinter'
    coll.instance_offset=position
    coll.asset_mark()
    coll.asset_data.description=subtitle+'. Editable 48 x 40 inch wooden stringer pallet with packed PBR textures.'
    for tag in ('Warehouse','Pallet','Wood','Pine',label.title()):
        coll.asset_data.tags.new(tag)
    return {'slug':slug,'root':root,'collection':coll,'boards':boards,'nails':len(nails),'position':position}


assets=[make_pallet(*args) for args in VARIANTS]
print('PALLET_GEOMETRY_READY',flush=True)

studio=collection('STUDIO | floor, labels, lighting, cameras')
floor_mat=solid('Studio | warm warehouse concrete',(.205,.215,.205),.94)
nt=floor_mat.node_tree
p=nt.nodes.get('Principled BSDF')
tex=nt.nodes.new('ShaderNodeTexNoise')
tex.inputs['Scale'].default_value=240
tex.inputs['Detail'].default_value=2
bump=nt.nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value=.24
bump.inputs['Distance'].default_value=.0009
nt.links.new(tex.outputs['Fac'],bump.inputs['Height'])
nt.links.new(bump.outputs['Normal'],p.inputs['Normal'])
floor=mesh('Concrete presentation floor',[(-100,-100,-.003),(100,-100,-.003),(100,100,-.003),(-100,100,-.003)],[(0,1,2,3)],floor_mat,studio)
ink=solid('Studio | lettering',(.045,.053,.048),.9)
font_path=Path('C:/Windows/Fonts/segoeui.ttf')
font=bpy.data.fonts.load(str(font_path)) if font_path.exists() else None
if font:
    font.pack()
for slug,label,subtitle,condition,pos in VARIANTS:
    text=bpy.data.curves.new('Condition label','FONT')
    text.body=f'{condition+1:02d}  /  {label}'
    text.size=.056
    text.extrude=0
    if font:
        text.font=font
    ob=bpy.data.objects.new(label+' | studio caption',text)
    studio.objects.link(ob)
    ob.location=(pos[0]-.49,pos[1]-.77,.001)
    text.materials.append(ink)


def aim(ob,target):
    ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()


def area(name,loc,power,size,color,target=(0,0,0)):
    data=bpy.data.lights.new(name,'AREA')
    data.energy=power
    data.shape='DISK'
    data.size=size
    data.color=color
    ob=bpy.data.objects.new(name,data)
    studio.objects.link(ob)
    ob.location=loc
    aim(ob,target)


area('Warehouse skylight | broad key',(-3,-4,6),1250,4,(1,.95,.86))
area('Cool loading-door bounce',(4,-1,3.5),750,3,(.82,.9,1))
area('Ceiling bounce',(0,4,5),1000,3,(1,.98,.92))
world=bpy.data.worlds.new('Workshop ambient')
world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.25,.28,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.35
scene.world=world


def camera(name,loc,target,scale):
    data=bpy.data.cameras.new(name)
    ob=bpy.data.objects.new(name,data)
    studio.objects.link(ob)
    ob.location=loc
    aim(ob,target)
    data.type='ORTHO'
    data.ortho_scale=scale
    data.lens=55
    return ob


overview=camera('CAMERA | four-pallet comparison',(3,-5,5.7),(0,-.1,0),4.65)
detail=camera('CAMERA | damaged board close-up',(.7,-2.8,1.25),(-.72,-1.12,.08),1.55)
fresh=camera('CAMERA | fresh pine close-up',(.9,-.8,1.45),(-.82,.85,.07),1.55)
scene.camera=overview
scene.render.engine='CYCLES'
scene.cycles.samples=24 if QUICK else 64
scene.cycles.use_denoising=True
scene.cycles.max_bounces=6
scene.cycles.diffuse_bounces=3
scene.cycles.glossy_bounces=3
try:
    cp=bpy.context.preferences.addons['cycles'].preferences
    cp.compute_device_type='OPTIX'
    cp.get_devices()
    gpu=False
    for d in cp.devices:
        d.use=d.type=='OPTIX'
        gpu |= d.use
    if gpu:
        scene.cycles.device='GPU'
        print('PALLET_RENDER_DEVICE','OPTIX',flush=True)
except Exception as e:
    print('PALLET_RENDER_DEVICE','CPU',str(e),flush=True)
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=-.6
scene.render.resolution_x=1200 if QUICK else 1800
scene.render.resolution_y=1080 if QUICK else 1620
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGB'
scene.render.filepath=str(OUT/'warehouse-pallets-preview.png')

# Default opening state shows the textured assets and leaves the studio unobtrusive.
for screen in bpy.data.screens:
    for ui in screen.areas:
        if ui.type=='VIEW_3D':
            s=ui.spaces.active
            s.shading.type='MATERIAL'
            s.shading.studiolight_rotate_z=.6
            s.overlay.show_floor=False
            s.overlay.show_axis_x=False
            s.overlay.show_axis_y=False
            s.overlay.show_extras=False
            s.clip_end=300
            s.region_3d.view_distance=5.2
            s.region_3d.view_location=(0,0,0)
            s.region_3d.view_rotation=overview.rotation_euler.to_quaternion()
            s.region_3d.view_perspective='ORTHO'
for ob in scene.objects:
    ob.select_set(False)
assets[0]['root'].select_set(True)
bpy.context.view_layer.objects.active=assets[0]['root']

# Validate source topology, UVs, parts and evaluated mesh sizes before writing.
report={'blender':bpy.app.version_string,'units':'metres','footprint_m':[WIDTH,LENGTH],'height_m':HEIGHT,'variants':[]}
dg=bpy.context.evaluated_depsgraph_get()
for a in assets:
    meshes=[o for o in a['collection'].objects if o.type=='MESH']
    tris=0
    issues=[]
    for ob in meshes:
        bm=bmesh.new()
        bm.from_mesh(ob.data)
        if any(not e.is_manifold for e in bm.edges):
            issues.append(ob.name+': non-manifold source')
        bm.free()
        assert all(math.isfinite(c) for v in ob.data.vertices for c in v.co)
        ev=ob.evaluated_get(dg)
        me=ev.to_mesh()
        me.calc_loop_triangles()
        tris+=len(me.loop_triangles)
        ev.to_mesh_clear()
        if ob in a['boards']:
            assert ob.data.uv_layers.active is not None
    assert not issues,issues
    assert len(a['boards'])==15
    report['variants'].append({'name':a['slug'],'boards':15,'nail_heads':a['nails'],'mesh_objects':len(meshes),'evaluated_triangles':tris,'source_manifold':True,'open_splits':sum(bool(o.get('has_open_split')) for o in a['boards'])})
    # The collection remains editable and is ready for Blender's Asset Browser.
    a['root']['evaluated_triangles']=tris
(OUT/'warehouse-pallets-build.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'warehouse-pallets.blend'),compress=True)
print('PALLET_BUILD_COMPLETE',json.dumps(report),flush=True)
if not NO_RENDER:
    bpy.ops.render.render(write_still=True)
    if not QUICK:
        scene.render.resolution_x=1600
        scene.render.resolution_y=1100
        for cam,filename in [(detail,'warehouse-pallets-damage-detail.png'),(fresh,'warehouse-pallets-pine-detail.png')]:
            scene.camera=cam
            scene.render.filepath=str(OUT/filename)
            bpy.ops.render.render(write_still=True)
    print('PALLET_RENDER_COMPLETE',flush=True)
