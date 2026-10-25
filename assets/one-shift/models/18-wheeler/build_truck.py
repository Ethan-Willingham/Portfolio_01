import bpy, bmesh, math, json, os, sys
from mathutils import Vector, Matrix, Quaternion
from math import sin, cos, pi

OUT = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0
asset = bpy.data.collections.new('18 WHEELER | export')
scene.collection.children.link(asset)
studio = bpy.data.collections.new('STUDIO | not exported')
scene.collection.children.link(studio)
MATS = []
def material(name, color, metallic=0, rough=.5, emission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metallic; p.inputs['Roughness'].default_value=rough
    if emission:
        p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emission
    MATS.append(m); return len(MATS)-1
BLUE=material('01 | midnight blue enamel',(.026,.105,.18),.58,.28)
WHITE=material('02 | warm white trailer panels',(.82,.83,.80),.12,.46)
CHROME=material('03 | polished aluminum',(.62,.67,.7),.88,.24)
ALUM=material('04 | brushed galvanized metal',(.39,.44,.47),.74,.43)
FRAME=material('05 | chassis graphite',(.028,.038,.043),.55,.5)
RUBBER=material('06 | tire rubber',(.018,.022,.024),0,.83)
GROOVE=material('07 | tread and seals',(.007,.01,.012),0,.78)
GLASS=material('08 | blue smoked glass',(.022,.065,.09),.48,.16)
RED=material('09 | red reflector',(.58,.018,.012),.15,.28)
AMBER=material('10 | amber lens',(.95,.24,.018),.1,.23,.15)
LAMP=material('11 | headlight glass',(.78,.86,.84),.2,.17,.25)
CREAM=material('12 | ivory stripe',(.74,.67,.49),.35,.34)
WOOD=material('13 | hardwood cargo floor',(.29,.17,.075),0,.8)
WOOD2=material('14 | hardwood variation',(.36,.23,.12),0,.8)
LINER=material('15 | cargo liner',(.65,.66,.59),.05,.72)
BLACK=material('16 | recess black',(.004,.006,.008),0,.7)

class Geo:
    def __init__(self): self.v=[]; self.f=[]; self.mi=[]; self.sm=[]
    def mesh(self,vs,fs,mat=FRAME,smooth=False):
        n=len(self.v); self.v.extend([tuple(v) for v in vs]); self.f.extend([tuple(n+i for i in f) for f in fs])
        self.mi.extend([mat]*len(fs)); self.sm.extend([smooth]*len(fs))
    def box(self,c,d,mat=FRAME,bevel=0):
        if bevel:
            bevel=min(bevel,min(d)*.45)
            bm=bmesh.new(); bmesh.ops.create_cube(bm,size=1)
            for v in bm.verts: v.co=Vector((v.co.x*d[0],v.co.y*d[1],v.co.z*d[2]))
            bmesh.ops.bevel(bm,geom=list(bm.edges),offset=bevel,segments=1,affect='EDGES')
            bm.verts.ensure_lookup_table(); bm.verts.index_update()
            self.mesh([v.co+Vector(c) for v in bm.verts],[[v.index for v in f.verts] for f in bm.faces],mat)
            bm.free(); return
        x,y,z=c; a,b,h=[t/2 for t in d]
        self.mesh([(x-a,y-b,z-h),(x+a,y-b,z-h),(x+a,y+b,z-h),(x-a,y+b,z-h),
                   (x-a,y-b,z+h),(x+a,y-b,z+h),(x+a,y+b,z+h),(x-a,y+b,z+h)],
                  [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
    def cyl(self,a,b,r,mat=FRAME,n=12,r2=None):
        a=Vector(a); b=Vector(b); z=(b-a).normalized(); h=Vector((0,0,1))
        if abs(z.dot(h))>.95:h=Vector((0,1,0))
        u=z.cross(h).normalized(); v=z.cross(u).normalized(); r2=r if r2 is None else r2
        vs=[p+rr*(u*cos(2*pi*i/n)+v*sin(2*pi*i/n)) for p,rr in [(a,r),(b,r2)] for i in range(n)]
        self.mesh(vs,[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat,True)
    def lathe_x(self,c,profile,mat=FRAME,n=32):
        x,y,z=c; vs=[(x+a,y+r*cos(2*pi*i/n),z+r*sin(2*pi*i/n)) for a,r in profile for i in range(n)]
        fs=[(k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i) for k in range(len(profile)-1) for i in range(n)]
        self.mesh(vs,fs,mat,True)
    def prism_x(self,points,x0,x1,mat=FRAME):
        n=len(points); self.mesh([(x,y,z) for x in (x0,x1) for y,z in points],
            [tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)
    def loft_y(self,sections,mat=BLUE):
        n=len(sections[0][1]); vs=[(x,y,z) for y,p in sections for x,z in p]
        fs=[tuple(range(n-1,-1,-1)),tuple((len(sections)-1)*n+i for i in range(n))]
        fs += [(k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i) for k in range(len(sections)-1) for i in range(n)]
        self.mesh(vs,fs,mat)
    def line(self,points,r=.015,mat=CHROME,n=8):
        for a,b in zip(points,points[1:]):self.cyl(a,b,r,mat,n)
    def object(self,name,parent=None,origin=(0,0,0)):
        mesh=bpy.data.meshes.new(name); mesh.from_pydata([Vector(v)-Vector(origin) for v in self.v],[],self.f); mesh.update()
        for m in MATS:mesh.materials.append(m)
        for p,mi,sm in zip(mesh.polygons,self.mi,self.sm):p.material_index=mi; p.use_smooth=sm
        bm=bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(mesh); bm.free()
        obj=bpy.data.objects.new(name,mesh); asset.objects.link(obj); obj.location=origin
        if parent:
            obj.parent=parent; obj.matrix_parent_inverse=parent.matrix_world.inverted()
        # Angle split keeps machined rims clean while smoothing curved tires.
        mesh.use_auto_smooth=True; mesh.auto_smooth_angle=math.radians(48)
        return obj

def empty(name,loc=(0,0,0),parent=None,size=.35):
    o=bpy.data.objects.new(name,None); asset.objects.link(o); o.location=loc; o.empty_display_type='PLAIN_AXES';o.empty_display_size=size
    bpy.context.view_layer.update()
    if parent:o.parent=parent; o.matrix_parent_inverse=parent.matrix_world.inverted()
    bpy.context.view_layer.update(); return o
root=empty('Truck_Root')
tractor=empty('Tractor_Root',parent=root)
KP=(0,.70,1.18)
trailer=empty('Trailer_Coupling',KP,root)
root['asset']='Conventional American 6x4 tractor + 53 ft dry van'
root['units']='Meters; Blender -Y forward, Z up. FBX exported -Z forward / Y up.'
root['wheel_count']=18; root['doors']='Independent rear door pivots on hinge barrels'
trailer['motion']='Rotate local Z in Blender for trailer articulation. Pivot is the kingpin.'

# Tractor chassis. The frame, axles, tanks and fifth wheel remain independent of spinning tires.
g=Geo()
for x in (-.41,.41):g.box((x,-2.05,.76),(.115,9.0,.28),FRAME,.018)
for y in (-5.8,-4.2,-2.7,-1.2,.0,1.2,2.2):g.box((0,y,.77),(.9,.12,.16),FRAME,.01)
g.box((0,2.32,.77),(1.03,.14,.28),FRAME,.02)
for y in (-5.63,.30,1.65):
    g.cyl((-1.04,y,.505),(1.04,y,.505),.068,FRAME,12)
    if y>0:
        g.cyl((0,y-.22,.505),(0,y+.22,.505),.17,FRAME,12)
        for x in (-.45,.45):
            g.box((x,y,.65),(.09,1.05,.08),FRAME,.008)
            g.cyl((x,y-.32,.64),(x,y-.32,.89),.115,RUBBER,12)
            g.cyl((x,y+.32,.64),(x,y+.32,.89),.115,RUBBER,12)
    else:
        for x in (-.5,.5):g.box((x,y,.64),(.07,1.12,.05),FRAME,.006)
g.cyl((0,-3.7,.6),(0,1.65,.505),.055,ALUM,12)
g.box((0,-.0,.96),(1.05,.6,.07),ALUM,.012)
for i in range(9):g.box((-.44+i*.11,-.0,1.0),(.018,.56,.012),CHROME)
# Slotted horseshoe fifth-wheel plate, with the kingpin at its rotational center.
g.box((0,.64,1.12),(.94,.94,.11),FRAME,.025)
pts=[(-.48,-.46),(.48,-.46),(.54,-.3),(.54,.27),(.34,.51),(.095,.51),(.07,.08),(-.07,.08),(-.095,.51),(-.34,.51),(-.54,.27),(-.54,-.3)]
vs=[(x,y+.70,z) for z in (1.16,1.20) for x,y in pts]; n=len(pts)
g.mesh(vs,[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],ALUM)
g.object('Tractor_Chassis_and_Suspension',tractor)

# Eighteen individually pivoted tire/rim assemblies.
wheel_objects=[]; steer_objects=[]
def wheel(name,c,parent,outside=1,steer=False):
    if steer:
        parent=empty(name.replace('Wheel','Steer'),c,parent,.22); parent['motion']='Steering: local Z';steer_objects.append(parent)
    w=Geo(); x,y,z=c; s=outside; inner='Inner' in name; seg=24 if inner else 32
    profile=[(-.138,.295),(-.142,.40),(-.11,.488),(-.09,.505),(-.057,.505),(-.052,.496),(-.047,.505),(-.005,.505),(0,.496),(.005,.505),(.047,.505),(.052,.496),(.057,.505),(.09,.505),(.127,.457),(.142,.39),(.138,.295)]
    w.lathe_x(c,profile,RUBBER,seg)
    for side in (-1,1):
        if not inner:
            w.lathe_x(c,[(side*.14,.31),(side*.147,.318),(side*.144,.328)],RUBBER,seg)
            w.lathe_x(c,[(side*.134,.445),(side*.136,.448),(side*.131,.452)],GROOVE,seg)
    # Open rim dish and ten ventilation slots between spokes.
    w.lathe_x(c,[(s*-.07,.285),(s*.15,.30),(s*.166,.297),(s*.166,.277),(s*.09,.243)],CHROME,24)
    w.lathe_x(c,[(s*.075,.25),(s*.098,.25),(s*.098,.232)],ALUM,24)
    w.lathe_x(c,[(s*.098,.145),(s*.118,.145),(s*.118,.106)],CHROME,24)
    for k in range(10):
        a=2*pi*k/10; da=.115
        verts=[(x+s*xx,y+rr*cos(aa),z+rr*sin(aa)) for xx in (.095,.113) for rr,aa in [(.138,a-da),(.245,a-da*.8),(.245,a+da*.8),(.138,a+da)]]
        w.mesh(verts,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],CHROME)
        if not inner:w.cyl((x+s*.119,y+.122*cos(a),z+.122*sin(a)),(x+s*.145,y+.122*cos(a),z+.122*sin(a)),.014,CHROME,6)
    w.cyl((x+s*.09,y,z),(x+s*.19,y,z),.088,CHROME,16)
    w.cyl((x+s*.19,y,z),(x+s*.205,y,z),.065,ALUM,12)
    # Valve and short shoulder sipes make wheel rotation legible without heavy tread geometry.
    w.cyl((x+s*.17,y+.258,z),(x+s*.185,y+.258,z+.022),.007,FRAME,6)
    for k in range(0 if inner else 24):
        a=k*2*pi/24
        for side in (-1,1):
            w.mesh([(x+side*u,y+r*cos(a+da),z+r*sin(a+da)) for u,r,da in [(.095,.502,-.007),(.121,.477,-.001),(.121,.477,.008),(.095,.502,.002)]],[(0,1,2,3)],GROOVE)
    obj=w.object(name,parent,c); obj['spin_axis']='local X';obj['tire_radius_m']=.505;obj['tire_width_m']=.286
    wheel_objects.append(obj)
for s,label in [(-1,'L'),(1,'R')]:
    wheel('Wheel_Tractor_Steer_'+label,(s*1.035,-5.63,.505),tractor,s,True)
    for ax,y in enumerate((.30,1.65),1):
        for pos,x in [('Inner',.836),('Outer',1.14)]:wheel(f'Wheel_Tractor_Drive{ax}_{label}_{pos}',(s*x,y,.505),tractor,s)

# Hood, cab, flat-top sleeper. Purpose-shaped silhouettes rather than stacked primitives.
g=Geo()
g.loft_y([(-6.61,[(-.70,1.05),(.70,1.05),(.70,1.88),(.56,2.02),(-.56,2.02),(-.70,1.88)]),
          (-4.15,[(-.84,1.06),(.84,1.06),(.84,2.00),(.68,2.16),(-.68,2.16),(-.84,2.00)])],BLUE)
g.box((0,-5.36,2.10),(.045,2.1,.035),CHROME,.008)
g.prism_x([(-4.18,1.05),(-2.65,1.05),(-2.65,3.0),(-3.87,3.0),(-4.18,2.32)],-.94,.94,BLUE)
g.box((0,-3.30,3.035),(1.96,1.34,.12),BLUE,.055)
g.loft_y([(-2.67,[(-1.03,1.02),(1.03,1.02),(1.03,2.88),(.90,3.13),(-.90,3.13),(-1.03,2.88)]),
          (-.84,[(-1.03,1.02),(1.03,1.02),(1.03,2.88),(.90,3.13),(-.90,3.13),(-1.03,2.88)])],BLUE)
# Thin seams, pinstripes, sleeper vents, access hatch and door hardware.
for s in (-1,1):
    x=s*.951
    g.line([(x,-4.12,1.18),(x,-2.77,1.18),(x,-2.77,2.95)],.009,GROOVE,6)
    g.line([(x,-4.12,1.18),(x,-4.12,2.28),(x,-3.84,2.94),(x,-2.77,2.94)],.009,GROOVE,6)
    g.box((x,-3.43,1.76),(.013,1.3,.075),CREAM)
    g.box((s*1.039,-1.77,1.76),(.012,1.71,.075),CREAM)
    g.box((s*.959,-2.96,2.05),(.025,.17,.045),CHROME,.008)
    g.box((s*.959,-3.11,2.05),(.025,.025,.035),BLACK)
    g.box((s*1.043,-1.53,1.35),(.014,.70,.40),GROOVE,.015)
    g.box((s*1.055,-1.53,1.35),(.013,.66,.36),BLUE,.012)
    g.box((s*1.068,-1.28,1.43),(.02,.09,.025),CHROME)
    g.box((s*1.044,-1.57,2.52),(.018,.52,.24),ALUM,.015)
    for j in range(6):g.box((s*1.056,-1.57,2.43+j*.035),(.008,.45,.012),BLACK)
    # Hood side molding and three engine vents.
    for j in range(3):g.box((s*.833,-4.48-j*.13,1.7),(.016,.065,.26),BLACK,.01)
    g.line([(s*.724,-6.4,1.52),(s*.837,-4.23,1.52)],.018,CREAM,6)
    g.box((s*.857,-4.34,1.22),(.04,.085,.16),CHROME,.008)
# Windshield, two framed panes laid against the sloped front cab face.
for s in (-1,1):
    xa,xb=sorted((s*.055,s*.85))
    g.mesh([(xa,-4.177,2.37),(xb,-4.177,2.37),(xb,-3.921,2.925),(xa,-3.921,2.925)],[(0,1,2,3)],GROOVE)
    g.mesh([(xa+.025,-4.175,2.40),(xb-.025,-4.175,2.40),(xb-.025,-3.946,2.894),(xa+.025,-3.946,2.894)],[(0,1,2,3)],GLASS)
    g.line([(s*.13,-4.198,2.39),(s*.61,-4.049,2.71)],.011,FRAME,6)
    g.line([(s*.44,-4.12,2.54),(s*.73,-3.977,2.85)],.012,RUBBER,6)
    # Side glazing and its separate vent pane.
    g.prism_x([(-4.075,2.28),(-2.83,2.28),(-2.83,2.92),(-3.805,2.92)],s*.95,s*.957,GROOVE)
    g.prism_x([(-4.015,2.32),(-2.87,2.32),(-2.87,2.875),(-3.79,2.875)],s*.96,s*.967,GLASS)
    g.line([(s*.975,-3.73,2.32),(s*.975,-3.73,2.88)],.012,CHROME,6)
g.object('Tractor_Cab_Hood_and_Sleeper',tractor)

g=Geo()
# Radiator surround and inset vertical grille bars.
g.box((0,-6.635,1.53),(1.46,.14,1.13),CHROME,.07)
g.box((0,-6.714,1.53),(1.21,.035,.88),BLACK,.035)
for i in range(19):g.box((-.54+i*.06,-6.741,1.53),(.018,.018,.83),CHROME,.004)
g.box((0,-6.756,1.54),(1.16,.02,.045),CHROME)
g.box((0,-6.79,.55),(2.47,.22,.35),CHROME,.035)
for x in (-.75,.75):g.box((x,-6.907,.55),(.21,.012,.085),BLACK,.018)
g.box((0,-6.916,.53),(.31,.012,.15),ALUM,.005)
g.box((0,-6.933,.53),(.26,.008,.11),WHITE,.003)
# Arched front fenders, with real open wheel wells.
for s in (-1,1):
    n=20; vs=[]
    for x in (s*.79,s*1.27):
        for r in (.575,.635):
            for i in range(n+1):
                a=pi*i/n;vs.append((x,-5.63+r*cos(a),.505+r*sin(a)))
    N=n+1; fs=[]
    for i in range(n):
        fs.extend([(i,i+1,N+i+1,N+i),(2*N+i,3*N+i,3*N+i+1,2*N+i+1),
                   (N+i,N+i+1,3*N+i+1,3*N+i),(i,2*N+i,2*N+i+1,i+1)])
    fs.extend([(0,N,3*N,2*N),(n,2*N+n,3*N+n,N+n)])
    g.mesh(vs,fs,BLUE)
    g.box((s*1.0,-6.36,.97),(.50,.49,.32),BLUE,.055)
    g.box((s*1.0,-6.615,.97),(.49,.055,.24),CHROME,.025)
    for x in (.88,1.12):
        g.cyl((s*x,-6.65,.975),(s*x,-6.684,.975),.089,BLACK,16)
        g.cyl((s*x,-6.685,.975),(s*x,-6.697,.975),.072,LAMP,16)
    g.box((s*1.20,-6.43,1.17),(.09,.17,.045),AMBER,.015)
    g.box((s*1.07,-4.94,.32),(.37,.035,.42),RUBBER,.006)
    # Aluminum saddle tanks, capped fore and aft.
    g.cyl((s*.91,-2.55,.65),(s*.91,-1.06,.65),.335,CHROME,24)
    for y in (-2.59,-1.02):g.cyl((s*.91,y-.018,.65),(s*.91,y+.018,.65),.29,ALUM,24)
    for y in (-2.32,-1.28):
        for a in range(24):
            a0=2*pi*a/24;a1=2*pi*(a+1)/24
            g.mesh([(s*.91+.343*cos(t),yy,.65+.343*sin(t)) for yy in (y-.035,y+.035) for t in (a0,a1)],[(0,1,3,2)],FRAME)
    g.cyl((s*.99,-1.33,.954),(s*.99,-1.33,1.003),.055,ALUM,12)
    # Two entry steps below each cab door, perforation marks and brackets.
    for y in (-3.83,-2.93):g.box((s*.94,y,.64),(.12,.08,.73),FRAME,.008)
    for z,x in ((.39,1.08),(.73,1.015)):
        g.box((s*x,-3.39,z),(.43,1.19,.075),ALUM,.012)
        for j in range(12):g.box((s*x,-3.91+j*.095,z+.04),(.32,.025,.004),BLACK)
    # Air-cleaner barrel, dual stacks, steps and supports.
    g.cyl((s*1.04,-4.05,1.25),(s*1.04,-4.05,2.23),.145,CHROME,16)
    g.cyl((s*1.04,-4.05,2.23),(s*1.04,-4.05,2.31),.173,CHROME,16)
    for z in (1.38,2.1):g.cyl((s*1.04,-4.05,z-.025),(s*1.04,-4.05,z+.025),.153,ALUM,16)
    g.cyl((s*1.12,-2.66,1.1),(s*1.12,-2.66,2.6),.095,ALUM,16)
    g.cyl((s*1.12,-2.66,2.6),(s*1.12,-2.66,3.63),.066,CHROME,16)
    g.cyl((s*1.12,-2.66,3.632),(s*1.12,-2.66,3.64),.051,BLACK,16)
    for z in (1.27,2.4):g.cyl((s*.94,-2.66,z),(s*1.12,-2.66,z),.025,FRAME,8)
    for j in range(8):g.box((s*1.218,-2.66,1.36+j*.14),(.008,.07,.065),BLACK)
    # Braced mirror arm with main mirror and convex lower mirror.
    g.line([(s*.97,-3.83,2.83),(s*1.41,-4.02,2.83),(s*1.41,-4.02,2.18),(s*.97,-3.83,2.18)],.019,CHROME,8)
    g.box((s*1.43,-4.03,2.57),(.20,.10,.44),CHROME,.04)
    g.box((s*1.43,-3.972,2.57),(.159,.009,.391),GLASS,.025)
    g.cyl((s*1.43,-4.025,2.22),(s*1.43,-3.975,2.22),.092,CHROME,16)
    g.cyl((s*1.43,-3.973,2.22),(s*1.43,-3.97,2.22),.077,GLASS,16)
    g.line([(s*.96,-3.8,1.94),(s*1.03,-3.8,1.94),(s*1.03,-3.8,2.19)],.014,CHROME,8)
    # Rear tandem mudguards and mudflaps.
    g.box((s*1.0,.98,1.045),(.63,2.48,.045),ALUM,.012)
    g.box((s*1.0,2.21,.50),(.64,.034,.89),RUBBER,.008)
    g.box((s*1.0,2.233,.12),(.57,.012,.045),ALUM)
    g.box((s*.78,2.35,.84),(.39,.085,.17),FRAME,.015)
    for x in (.69,.87):g.cyl((s*x,2.396,.84),(s*x,2.414,.84),.059,RED,12)
# Cab roof running lights and visor.
g.box((0,-4.005,3.04),(1.98,.30,.052),CHROME,.02)
for x in (-.77,-.39,0,.39,.77):
    g.box((x,-3.78,3.126),(.09,.24,.035),CHROME,.018)
    g.box((x,-3.82,3.16),(.065,.17,.046),AMBER,.02)
for s in (-1,1):
    g.cyl((s*.52,-2.96,3.19),(s*.52,-3.6,3.19),.033,CHROME,12,r2=.07)
    g.cyl((s*.52,-3.601,3.19),(s*.52,-3.605,3.19),.055,BLACK,12)
g.object('Tractor_Trim_Tanks_Fenders_and_Lights',tractor)

# Hoses live in the gap between cab and trailer; simplified low polygon coils.
g=Geo()
for x,mat in [(-.25,RED),(.0,FRAME),(.25,ALUM)]:
    pts=[(x+.055*cos(t*2*pi*5),-.76+t*.55,1.5+.40*sin(t*pi)+.055*sin(t*2*pi*5)) for t in [i/40 for i in range(41)]]
    g.line(pts,.013,mat,6)
g.object('Tractor_Air_and_Electrical_Lines',tractor)

F=-.20; LENGTH=16.1544; R=F+LENGTH; W=2.5908; HALF=W/2; TOP=4.1148; HINGE_X=HALF+.09
# Dry van shell: individual wall thicknesses, closed front, open rear and a usable interior.
g=Geo()
g.box((0,(F+R)/2,1.272),(2.50,LENGTH-.10,.08),FRAME)
for i in range(14):
    x=-1.216+(i+.5)*2.432/14
    g.box((x,(F+R)/2,1.315),(2.432/14-.002,LENGTH-.17,.035),WOOD if i%3 else WOOD2)
    for y in (F+3.2+(i%3)*.7,F+7.4+(i%4)*.5,F+11.5+(i%2)*.6):
        g.box((x,y,1.333),(2.432/14-.004,.005,.0015),GROOVE)
for s in (-1,1):
    g.box((s*(HALF-.024),(F+R)/2,2.697),(.048,LENGTH-.08,2.716),WHITE,.01)
    g.box((s*(HALF-.052),(F+R)/2,2.695),(.008,LENGTH-.16,2.71),LINER)
    g.box((s*(HALF-.061),(F+R)/2,1.49),(.015,LENGTH-.18,.30),ALUM)
    g.box((s*(HALF-.011),(F+R)/2,1.30),(.069,LENGTH,.175),ALUM,.009)
    g.box((s*(HALF-.013),(F+R)/2,4.076),(.073,LENGTH,.078),CHROME,.01)
    # Sheet joints, fasteners and recessed interior logistics posts on 50-inch centers.
    for j in range(13):
        y=F+.17+j*1.27
        g.box((s*(HALF+.002),y,2.70),(.006,.009,2.63),ALUM)
        g.box((s*(HALF-.060),y,2.70),(.012,.033,2.63),ALUM)
        for z in (1.43,1.85,2.27,2.69,3.11,3.53,3.95):
            g.cyl((s*(HALF+.003),y-.018,z),(s*(HALF+.008),y-.018,z),.008,CHROME,6)
        for z in (1.8,2.1,2.4,2.7,3.,3.3,3.6):
            g.box((s*(HALF-.068),y,z),(.003,.015,.049),BLACK)
    # Conspicuity tape covers half the lower side rail.
    for j in range(25):
        y=F+.18+j*.628
        g.box((s*(HALF+.026),y,1.30),(.008,.30,.050),RED if j%2==0 else WHITE)
    for y,mat in ((F+.15,AMBER),(F+LENGTH*.5,AMBER),(R-.16,RED)):
        g.box((s*(HALF+.036),y,1.39),(.026,.16,.073),FRAME,.012)
        g.box((s*(HALF+.053),y,1.39),(.012,.124,.045),mat,.01)
g.box((0,F+.031,2.694),(W-.05,.062,2.718),WHITE,.012)
g.box((0,F+.069,2.694),(W-.14,.012,2.704),LINER)
g.box((0,(F+R)/2,4.082),(W-.065,LENGTH-.04,.045),WHITE,.008)
for y in [F+.43+i*.61 for i in range(26)]:g.box((0,y,4.043),(W-.13,.04,.035),ALUM,.006)
for x in (-1.24,1.24):g.box((x,F+.02,2.7),(.095,.105,2.82),CHROME,.018)
g.box((0,F-.012,1.42),(W-.07,.06,.22),ALUM,.014)
for x in (-1.17,1.17):g.box((x,F-.05,4.04),(.10,.025,.055),AMBER,.009)
g.object('Trailer_Shell_and_Cargo_Interior',trailer)

# Floor crossmembers, tandem slider, landing gear and rear impact guard.
g=Geo()
for j in range(40):
    y=F+.17+j*.40
    g.box((0,y,1.17),(2.46,.055,.13),ALUM)
for x in (-.48,.48):
    g.box((x,1.0,1.106),(.13,2.35,.15),FRAME,.008)
    g.box((x,12.98,1.125),(.14,4.18,.17),FRAME,.009)
g.cyl((0,.70,1.10),(0,.70,1.29),.026,CHROME,12)
for s in (-1,1):
    x=s*.89
    g.box((x,2.83,.83),(.19,.20,.68),FRAME,.015)
    g.box((x,2.83,.49),(.138,.145,.41),ALUM,.008)
    g.box((x,2.83,.293),(.37,.41,.055),FRAME,.012)
    g.line([(s*.89,2.83,.65),(s*.43,3.55,1.19)],.031,FRAME,8)
    g.line([(s*.89,2.83,.64),(s*.89,3.7,1.18)],.031,FRAME,8)
g.cyl((-.92,2.83,.89),(.92,2.83,.89),.032,ALUM,8)
g.line([(1.0,2.83,.87),(1.16,2.83,.87),(1.16,2.97,.69),(1.28,2.97,.69)],.018,ALUM,8)
for x in (-.54,.54):g.box((x,13.47,.96),(.11,3.08,.20),FRAME,.01)
for y in (12.60,13.8446):
    g.cyl((-1.04,y,.505),(1.04,y,.505),.073,FRAME,12)
    for x in (-.53,.53):
        g.box((x,y-.14,.66),(.12,.82,.08),FRAME,.012)
        g.cyl((x,y-.30,.70),(x,y-.30,.99),.125,RUBBER,12)
        g.cyl((x,y+.15,.56),(x,y+.35,.95),.036,ALUM,8)
    g.cyl((-.40,y,.72),(.40,y,.72),.095,FRAME,12)
for x in (-1.02,1.02):
    g.box((x,14.43,.50),(.62,.035,.89),RUBBER,.008)
    g.box((x,14.451,.1),(.55,.012,.05),ALUM)
    g.box((x,14.43,1.005),(.66,.11,.055),FRAME,.008)
for x in (-.87,.87):
    g.box((x,R-.13,.85),(.12,.17,.68),ALUM,.012)
    g.line([(x,R-.13,.56),(x,R-1.0,1.16)],.04,ALUM,8)
g.box((0,R-.12,.52),(2.40,.15,.145),ALUM,.015)
for i in range(8):g.box((-1.05+i*.30,R-.038,.53),(.29,.012,.055),RED if i%2==0 else WHITE)
g.object('Trailer_Chassis_Landing_Gear_and_Impact_Guard',trailer)
for s,label in [(-1,'L'),(1,'R')]:
    for ax,y in enumerate((12.60,13.8446),1):
        for pos,x in [('Inner',.836),('Outer',1.14)]:wheel(f'Wheel_Trailer_Axle{ax}_{label}_{pos}',(s*x,y,.505),trailer,s)

# Rear portal and lights stay on the trailer when doors open.
g=Geo()
for s in (-1,1):
    g.box((s*(HALF-.037),R-.034,2.70),(.075,.10,2.78),ALUM,.008)
g.box((0,R-.034,4.061),(W,.11,.106),ALUM,.009)
g.box((0,R-.027,1.27),(W,.14,.14),ALUM,.008)
g.box((0,R-.045,1.105),(W-.04,.14,.22),ALUM,.012)
for s in (-1,1):
    for x,mat in ((.88,RED),(1.10,RED),(.64,LAMP)):
        g.cyl((s*x,R+.029,1.104),(s*x,R+.047,1.104),.082,BLACK,16)
        g.cyl((s*x,R+.049,1.104),(s*x,R+.061,1.104),.063,mat,16)
    g.box((s*1.22,R+.06,1.39),(.10,.12,.19),RUBBER,.014)
    for z in (1.57,2.28,3.0,3.75):
        g.box((s*1.315,R+.006,z),(.19,.10,.13),ALUM,.008)
        g.cyl((s*HINGE_X,R+.055,z-.083),(s*HINGE_X,R+.055,z+.083),.022,ALUM,10)
for x in (-1.17,-.14,0,.14,1.17):g.box((x,R+.025,4.063),(.08,.032,.046),RED,.012)
g.box((0,R+.034,1.10),(.33,.025,.15),FRAME,.005)
g.box((0,R+.049,1.10),(.29,.008,.12),WHITE,.002)
g.object('Trailer_Rear_Frame_and_Lights',trailer)

# Hinged doors, independent objects including their locking bars and moving hinge straps.
doors=[]
for s,label in [(-1,'L'),(1,'R')]:
    g=Geo(); cx=s*.625; w=1.228
    g.box((cx,R-.038,2.682),(w,.072,2.62),WHITE,.008)
    g.box((cx,R-.079,2.682),(w-.036,.011,2.58),LINER,.003)
    for x in (s*.018,s*1.231):g.box((x,R+.002,2.68),(.034,.029,2.64),ALUM,.004)
    for z in (1.383,3.981):g.box((cx,R+.008,z),(w,.035,.044),ALUM,.004)
    # Rubber perimeter gasket, visible center seam and four hinge straps.
    g.box((s*.007,R+.002,2.68),(.014,.04,2.62),GROOVE)
    for z in (1.57,2.28,3.0,3.75):
        g.box((s*1.18,R+.023,z),(.42,.025,.075),ALUM,.008)
        for x in (.98,1.11):g.cyl((s*x,R+.037,z),(s*x,R+.048,z),.012,CHROME,6)
    for x in (s*.32,s*.92):
        g.cyl((x,R+.071,1.40),(x,R+.071,3.96),.017,ALUM,10)
        for z in (1.45,2.1,2.96,3.91):
            g.box((x,R+.027,z),(.075,.035,.105),ALUM,.007)
            g.cyl((x,R+.07,z-.04),(x,R+.07,z+.04),.025,CHROME,10)
        g.box((x,R+.08,1.88),(.075,.05,.16),ALUM,.009)
        g.box((x-s*.096,R+.112,1.88),(.20,.028,.03),ALUM,.008)
        g.box((x-s*.18,R+.12,1.88),(.046,.018,.095),FRAME,.008)
        for z in (1.405,3.96):g.box((x+s*.035,R+.058,z),(.12,.055,.04),ALUM,.005)
    for j in range(4):g.box((s*(.17+j*.29),R+.036,1.57),(.275,.009,.053),RED if j%2==0 else WHITE)
    g.box((s*1.11,R+.036,3.85),(.045,.008,.18),WHITE)
    g.box((s*1.035,R+.036,3.92),(.19,.008,.045),WHITE)
    hinge=(s*HINGE_X,R+.055,2.682)
    door=g.object('Rear_Door_'+label,trailer,hinge)
    door['hinge_axis']='local Z';door['open_degrees']=s*-270;door['motion']='Rotate about own origin; geometry and lock rods follow the hinge.'
    doors.append(door)

# Useful attachments for later Unity scene assembly, all in real-world meters.
empty('Socket_FifthWheel',KP,tractor,.15)
empty('Socket_Trailer_Kingpin',KP,trailer,.15)
empty('Socket_Cargo_Floor',(0,R-.25,1.333),trailer,.2)
empty('Socket_Driver_Camera',(-.42,-3.3,2.58),tractor,.15)

# Strip unused material slots, unwrap, and triangulate export geometry deterministically.
bpy.ops.object.select_all(action='DESELECT')
meshes=[o for o in asset.objects if o.type=='MESH']
for o in meshes:
    used=sorted(set(p.material_index for p in o.data.polygons)); mapping={v:k for k,v in enumerate(used)}
    indices=[mapping[p.material_index] for p in o.data.polygons]
    mats=[MATS[i] for i in used];o.data.materials.clear()
    for m in mats:o.data.materials.append(m)
    for p,idx in zip(o.data.polygons,indices):p.material_index=idx
    o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.015,area_weight=.5,scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')
for o in meshes:
    mod=o.modifiers.new('Export triangles','TRIANGULATE'); mod.keep_custom_normals=True
    mod.quad_method='SHORTEST_DIAGONAL'; mod.ngon_method='BEAUTY'
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    o.data.update()

# Neutral studio: excluded from FBX/GLB. Three cameras demonstrate the full model and open cargo.
scene.render.engine='BLENDER_EEVEE'; scene.eevee.use_gtao=True;scene.eevee.gtao_distance=3;scene.eevee.gtao_factor=1.35
scene.eevee.use_soft_shadows=True;scene.eevee.taa_render_samples=96
scene.render.resolution_x=1800;scene.render.resolution_y=1120;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world=bpy.data.worlds.new('Studio World');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.30,.36,.43,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
scene.view_settings.view_transform='AgX'
def studio_obj(o):
    for col in list(o.users_collection):col.objects.unlink(o)
    studio.objects.link(o);return o
bpy.ops.mesh.primitive_plane_add(size=2000,location=(0,4,-.012));ground=studio_obj(bpy.context.object);ground.name='Studio_Floor'
floor_mat=bpy.data.materials.new('Studio | slate');floor_mat.diffuse_color=(.12,.16,.20,1);floor_mat.use_nodes=True
floor_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.12,.16,.20,1)
floor_mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.86;ground.data.materials.append(floor_mat)
def area(name,loc,power,size,color,target):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    o=bpy.data.objects.new(name,data);studio.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Key softbox',(-7,-5,12),5200,9,(1,.9,.77),(0,1,1))
area('Side softbox',(6,6,10),4500,10,(.78,.87,1),(0,5,1))
area('Trailer rim',(-4,15,11),4800,8,(1,.96,.88),(0,10,1))
def camera(name,loc,target,scale):
    data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=scale;data.lens=50;data.clip_end=300
    o=bpy.data.objects.new(name,data);studio.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
hero=camera('01 | Complete 18 wheeler',(-19,-19,13),(0,4.3,1.7),28.2)
rear=camera('02 | Open cargo doors',(-7,25,7),(0,10.5,2),15.0)
rear_detail=camera('05 | Rear door hardware',(-5,24,5.2),(0,13.65,2.1),8.2)
cab=camera('03 | Tractor details',(-10,-13,6.4),(0,-2.3,1.6),11.8)
side=camera('04 | Side proportions',(-25,4.4,3.1),(0,4.4,2.0),25.6)
scene.camera=hero
scene['asset_notes']='All geometry in 18 WHEELER collection. STUDIO is excluded from exports. Rear_Door_L/R rotate about Z. Wheels rotate about X.'

# Named pose markers are view aids only; no animation is required for the game asset.
scene.frame_start=1;scene.frame_end=120
scene.timeline_markers.new('Closed transport pose',frame=1)
text=bpy.data.texts.new('READ ME | Unity preparation')
text.write('18 WHEELER\n\nReal-scale generic American long-nose tractor and 53-foot dry van.\n'
    'All 18 wheels are separate meshes with centered origins. Spin local X.\n'
    'Steer_Tractor_Steer_L/R are steering pivots: local Z.\n'
    'Rear_Door_L/R origins are on the outer hinge axes. Rotate local Z.\n'
    'Left opens positive; right opens negative. 110 degrees reveals the interior; 270 folds alongside.\n'
    'Trailer_Coupling is positioned at the kingpin. Rotate local Z for articulation.\n'
    'FBX and GLB contain only the asset, no studio, cameras, or lights.\n'
    'Blender axes: -Y forward, +Z up, +X right. 1 unit = 1 metre.\n'
    'FBX export: -Z forward / Y up. Unity should use scale 1, Convert Units and Bake Axis Conversion.\n'
    'This is the model only. Add WheelColliders, Rigidbody, hinge behavior and a vehicle controller in Unity later.\n'
    'Original generic design, with proportions informed by conventional highway tractors and commercial dry vans.\n')

def export_assets():
    bpy.ops.object.select_all(action='DESELECT')
    for o in asset.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.fbx(filepath=os.path.join(OUT,'18-wheeler.fbx'),use_selection=True,object_types={'MESH','EMPTY'},
        global_scale=1,apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',axis_forward='-Z',axis_up='Y',
        use_mesh_modifiers=True,mesh_smooth_type='FACE',use_custom_props=True,add_leaf_bones=False,bake_anim=False,path_mode='AUTO')
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'18-wheeler.glb'),export_format='GLB',use_selection=True,
        export_yup=True,export_apply=True,export_animations=False,export_extras=True)
export_assets()

# Save the closed transport pose with a useful material-colored viewport.
bpy.ops.object.select_all(action='DESELECT');root.select_set(True);bpy.context.view_layer.objects.active=root
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.clip_end=300
            a.spaces.active.shading.type='MATERIAL'
            a.spaces.active.overlay.show_extras=False
            a.spaces.active.region_3d.view_distance=29
            a.spaces.active.region_3d.view_location=(0,4.4,1.7)
            a.spaces.active.region_3d.view_rotation=hero.rotation_euler.to_quaternion()
            a.spaces.active.region_3d.view_perspective='ORTHO'
studio.hide_viewport=True
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'18-wheeler.blend'))

def render(name,cam,open_angle=0):
    scene.camera=cam
    for s,d in zip((-1,1),doors):d.rotation_euler.z=math.radians(-s*open_angle)
    bpy.context.view_layer.update();scene.render.filepath=os.path.join(OUT,name+'.png')
    bpy.ops.render.render(write_still=True)
render('preview-truck',hero)
render('preview-tractor',cab)
render('preview-open-doors',rear,110)
render('preview-rear-closed',rear_detail)
render('preview-doors-folded',rear_detail,270)
render('preview-side',side)
for d in doors:d.rotation_euler.z=0
scene.camera=hero;bpy.context.view_layer.update()

stats={'wheel_count':len(wheel_objects),'rear_door_count':len(doors),'mesh_objects':len(meshes),
    'vertices':sum(len(o.data.vertices) for o in meshes),'triangles':sum(len(o.data.polygons) for o in meshes),
    'trailer_box_length_m':LENGTH,'trailer_box_width_m':W,'trailer_box_height_from_ground_m':TOP,
    'tire_radius_m':.505,'front_axle_y_m':-5.63,'drive_axles_y_m':[.30,1.65],'trailer_axles_y_m':[12.60,13.8446],
    'wheel_names':[o.name for o in wheel_objects],'door_origins':{o.name:list(o.matrix_world.translation) for o in doors}}
with open(os.path.join(OUT,'model-stats.json'),'w') as f:json.dump(stats,f,indent=2)
print('MODEL_STATS '+json.dumps(stats),flush=True)


