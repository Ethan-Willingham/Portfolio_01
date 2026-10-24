"""Build the classic LPG forklift from a fresh Blender scene. Metres, +Y forward.
Blender 5.2 --background --python tools/blender/build-warehouse-forklift.py
"""
import bpy, bmesh, math, json, random
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/one-shift/models'
UNITY=ROOT/'unity/OneShiftRackLab/Assets/RackLab/Models'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
bpy.context.preferences.filepaths.save_version=0
random.seed(41)

def material(name,color,metal=0,rough=.5,texture=False):
    m=bpy.data.materials.new('Forklift | '+name)
    m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    if texture:
        n=m.node_tree.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value=155
        b=m.node_tree.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value=.13; b.inputs['Distance'].default_value=.002
        m.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']); m.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal'])
    return m
yellow=material('industrial yellow enamel',(.79,.46,.012),.22,.34,True)
black=material('black enamel',(.012,.017,.019),.45,.35,True)
rubber=material('tyre rubber',(.009,.011,.012),0,.86,True)
vinyl=material('black vinyl',(.013,.016,.017),0,.53,True)
steel=material('forged steel',(.13,.16,.18),.86,.38,True)
alloy=material('bottle aluminium',(.48,.52,.53),.8,.3,True)
rim=material('ivory wheel enamel',(.65,.63,.53),.35,.36)
chrome=material('polished steel',(.64,.69,.71),.95,.16)
cream=material('cream labels',(.85,.82,.68),0,.48)
amber=material('amber lens',(.9,.24,.008),.1,.2)
red=material('red lens',(.45,.008,.005),.1,.21)
glass=material('headlamp glass',(.56,.62,.64),.35,.17)
brass=material('brass valve',(.42,.27,.08),.75,.36)
scuff=material('worn paint edges',(.17,.14,.075),.5,.72)

def empty(name,loc=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None); scene.collection.objects.link(o)
    o.location=loc; o.parent=parent; o.empty_display_size=.12
    return o
root=empty('OneShift_ClassicForklift')
root['description']='Original classic yellow four-wheel LPG counterbalance warehouse forklift'
root['units']='Metres; Blender +Y forward, +Z up'
body=empty('Chassis',parent=root)
def finish(o,name,mat,parent,bevel=0,segments=3):
    o.name=name; o.parent=parent; o.data.materials.append(mat)
    if bevel:
        m=o.modifiers.new('Formed metal edge','BEVEL'); m.width=bevel; m.segments=segments; m.harden_normals=True
        m=o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL'); m.keep_sharp=True; m.weight=50
    return o
def mesh(name,verts,faces,mat=black,parent=body,bevel=.005,segments=3):
    d=bpy.data.meshes.new(name); d.from_pydata(verts,[],faces); d.update()
    bm=bmesh.new(); bm.from_mesh(d); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(d); bm.free(); d.update()
    o=bpy.data.objects.new(name,d); scene.collection.objects.link(o)
    uv=d.uv_layers.new(name='UVMap')
    for p in d.polygons:
        p.use_smooth=True
        axes=sorted(range(3),key=lambda i:abs(p.normal[i]))[:2]
        for li in p.loop_indices:
            v=d.vertices[d.loops[li].vertex_index].co; uv.data[li].uv=(v[axes[0]],v[axes[1]])
    return finish(o,name,mat,parent,bevel,segments)
def box(name,loc,size,mat=black,parent=body,bevel=.008,segments=3):
    x,y,z=[v/2 for v in size]; a,b,c=loc
    vs=[(a+xx,b+yy,c+zz) for xx,yy,zz in [(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]]
    return mesh(name,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,parent,bevel,segments)
def cyl(name,loc,radius,depth,mat=steel,parent=body,axis='Z',vertices=40,bevel=.003):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc)
    o=bpy.context.object
    if axis=='X':o.rotation_euler.y=math.pi/2
    if axis=='Y':o.rotation_euler.x=math.pi/2
    for p in o.data.polygons:p.use_smooth=True
    return finish(o,name,mat,parent,bevel)
def rod(name,a,b,radius=.015,mat=steel,parent=body,vertices=20):
    a,b=Vector(a),Vector(b)
    o=cyl(name,(a+b)/2,radius,(a-b).length,mat,parent,vertices=vertices)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler(); return o
def bar(name,a,b,width=.06,depth=.06,mat=black,parent=body):
    a,b=Vector(a),Vector(b)
    o=box(name,(0,0,0),(width,depth,(b-a).length),mat,parent,.009)
    o.location=(a+b)/2; o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler(); return o
def hose(name,points,r=.009,mat=rubber,parent=body):
    c=bpy.data.curves.new(name,'CURVE'); c.dimensions='3D'; c.bevel_depth=r; c.bevel_resolution=2
    s=c.splines.new('BEZIER'); s.bezier_points.add(len(points)-1)
    for p,co in zip(s.bezier_points,points):p.co=co; p.handle_left_type=p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c); scene.collection.objects.link(o); o.parent=parent; c.materials.append(mat); return o
def torus(name,loc,major,minor,mat=steel,parent=body,axis='Z'):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=48,minor_segments=10,location=loc)
    o=bpy.context.object
    if axis=='X':o.rotation_euler.y=math.pi/2
    if axis=='Y':o.rotation_euler.x=math.pi/2
    for p in o.data.polygons:p.use_smooth=True
    return finish(o,name,mat,parent)
fonts=list((ROOT/'unity/OneShiftRackLab/Assets/RackLab').rglob('*.ttf'))
font=bpy.data.fonts.load(str(fonts[0])) if fonts else None
def label(name,content,loc,size,rot=(math.pi/2,0,0),mat=cream,parent=body):
    bpy.ops.object.text_add(location=loc,rotation=rot)
    o=bpy.context.object; o.name=name; o.parent=parent
    o.data.body=content; o.data.size=size; o.data.align_x='CENTER'; o.data.extrude=.00025; o.data.materials.append(mat)
    if font:o.data.font=font
    return o
def profile(name,points,width,mat=yellow,parent=body,bevel=.035):
    vs=[(s*width/2,y,z) for s in [-1,1] for y,z in points]; n=len(points)
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,vs,faces,mat,parent,bevel,5)

# Long engine body, rounded counterweight, and a genuinely open low step.
box('Heavy chassis belly',(0,-.17,.34),(1.09,2.43,.34),black,bevel=.07,segments=5)
profile('Cast rear counterweight',[(-1.48,.31),(-1.48,.81),(-1.33,1.04),(-.89,1.05),(-.74,.83),(-.74,.31)],1.2,bevel=.105)
profile('Engine compartment',[(-.94,.36),(-.94,.89),(-.66,1.02),(-.19,1.02),(.16,.72),(.18,.36)],1.04,bevel=.055)
profile('Engine bonnet',[(-.93,.89),(-.68,1.07),(-.2,1.07),(.18,.76),(.15,.71),(-.24,1.01),(-.68,1.01),(-.93,.84)],1.07,black,bevel=.02)
box('Rear rub strip',(0,-1.47,.33),(1.07,.095,.13),black,bevel=.04)
box('Rear radiator grille',(0,-1.489,.68),(.65,.018,.25),black,bevel=.03)
for z in [.58,.62,.66,.70,.74,.78]:box('Radiator louvre',(0,-1.505,z),(.58,.025,.018),black,bevel=.006)
box('Grille centre rib',(0,-1.522,.68),(.025,.025,.23),black)
rod('Tow pin',(0,-1.57,.25),(0,-1.57,.41),.022)
for z in [.26,.40]:box('Towing clevis',(0,-1.5,z),(.16,.16,.035),steel)
for x in [-.52,.52]:
    box('Front body sill',(x,.49,.4),(.15,1.17,.28),yellow,bevel=.03)
    box('Entry step',(x,.04,.3),(.23,.58,.055),black,bevel=.015)
    for y in [-.17,-.08,.01,.10,.19,.28]:box('Step traction rib',(x,y,.333),(.2,.014,.009),steel,bevel=.002)
    box('Engine service hatch',(x*1.009,-.48,.68),(.014,.53,.28),yellow,bevel=.018)
    for y in [-.67,-.60,-.53,-.46,-.39]:box('Side cooling slot',(x*1.027,y,.70),(.014,.028,.14),black,bevel=.01)
    cyl('Hood latch',(x*1.045,-.13,.73),.023,.014,steel,axis='X',vertices=16)
box('Operator footwell',(0,.39,.46),(.9,.82,.06),black,bevel=.02)
box('Floor mat',(0,.38,.499),(.79,.7,.019),rubber,bevel=.02)
for x in [-.32,-.24,-.16,-.08,0,.08,.16,.24,.32]:box('Floor mat ribs',(x,.36,.513),(.012,.55,.007),rubber,bevel=.002)
def fender(x):
    n=24; vs=[]
    for xx in [x-.14,x+.14]:
        for r in [.385,.42]:
            for i in range(n+1):
                a=math.radians(-22+i*224/n); vs.append((xx,.75+r*math.cos(a),.355+r*math.sin(a)))
    faces=[]; s=n+1
    for i in range(n):faces += [(i,i+1,s+i+1,s+i),(2*s+i,3*s+i,3*s+i+1,2*s+i+1),(s+i,s+i+1,3*s+i+1,3*s+i),(i,2*s+i,2*s+i+1,i+1)]
    faces += [(0,s,3*s,2*s),(n,2*s+n,3*s+n,s+n)]
    mesh('Curved front mudguard',vs,faces,yellow,body,.008)
for x in [-.51,.51]:fender(x)

# Tyre sidewalls and rounded shoulders, ivory dished rims and recessed hubs.
def wheel(name,loc,r,w):
    p=empty(name,loc,root); n=64
    rings=[(-w*.51,r*.64),(-w*.51,r*.82),(-w*.46,r*.94),(-w*.36,r),(w*.36,r),(w*.46,r*.94),(w*.51,r*.82),(w*.51,r*.64)]
    vs=[(x,rr*math.cos(i*math.tau/n),rr*math.sin(i*math.tau/n)) for x,rr in rings for i in range(n)]
    fs=[(j*n+i,j*n+(i+1)%n,((j+1)%len(rings))*n+(i+1)%n,((j+1)%len(rings))*n+i) for j in range(len(rings)) for i in range(n)]
    mesh('Solid industrial tyre',vs,fs,rubber,p,0)
    for side in [-1,1]:
        x=side*w*.5
        cyl('Ivory wheel dish',(x,0,0),r*.65,.025,rim,p,'X',48)
        torus('Wheel rim lip',(x+side*.014,0,0),r*.61,.009,rim,p,'X')
        cyl('Centre recess',(x+side*.014,0,0),r*.43,.025,steel,p,'X')
        cyl('Drive hub',(x+side*.035,0,0),r*.22,.07,rim,p,'X')
        for j in range(6):
            a=j*math.tau/6; cyl('Wheel stud',(x+side*.036,math.cos(a)*r*.33,math.sin(a)*r*.33),.013,.019,steel,p,'X',6)
        for rr in [.75,.82]:torus('Sidewall mould line',(x,0,0),r*rr,.003,rubber,p,'X')
    for j in range(40):
        a=j*math.tau/40
        for side in [-1,1]:
            o=box('Chevron tread',(0,0,0),(w*.46,.026,.012),rubber,p,.003)
            o.location=(side*w*.22,math.sin(a)*(r-.002),math.cos(a)*(r-.002)); o.rotation_euler=(-a,0,side*math.radians(23))
for s in [-1,1]:
    suffix='L' if s<0 else 'R'
    wheel('FrontWheel_'+suffix+'_Pivot',(s*.52,.75,.355),.35,.23)
    wheel('RearWheel_'+suffix+'_Pivot',(s*.49,-.96,.275),.27,.185)
rod('Drive axle',(-.52,.75,.355),(.52,.75,.355),.09,black)
rod('Steering axle',(-.49,-.96,.275),(.49,-.96,.275),.06,steel)

# The instantly recognisable rear-mounted propane bottle, with cradle and valve.
tank=empty('PropaneBottle',(0,-1.11,1.24),body)
cyl('Horizontal LPG cylinder',(0,0,0),.175,.67,alloy,tank,'X',64,.012)
for s in [-1,1]:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=20,location=(s*.335,0,0))
    o=bpy.context.object; o.scale=(.08,.171,.171); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    finish(o,'Dished bottle end',alloy,tank)
    torus('Rolled bottle seam',(s*.31,0,0),.173,.006,alloy,tank,'X')
    box('Bottle cradle',(s*.25,0,-.17),(.08,.32,.055),black,tank,.01)
    torus('Bottle retaining strap',(s*.23,0,0),.178,.012,black,tank,'X')
    box('Strap latch',(s*.23,.158,-.06),(.06,.045,.08),steel,tank,.009)
cyl('Valve boss',(.418,0,0),.043,.035,alloy,tank,'X')
cyl('Brass valve',(.456,0,0),.024,.05,brass,tank,'X',12)
cyl('Valve handwheel',(.47,0,.053),.036,.014,red,tank,vertices=12)
torus('Valve guard',(.485,0,0),.12,.012,alloy,tank,'X')
for a in [0,math.pi/2,math.pi,math.pi*1.5]:rod('Valve cage rail',(.37,.12*math.cos(a),.12*math.sin(a)),(.485,.12*math.cos(a),.12*math.sin(a)),.009,alloy,tank)
hose('LPG supply hose',[(.47,-1.10,1.24),(.55,-1.06,1.19),(.49,-.9,1.03),(.38,-.78,.9)])
box('Bottle label',(0,-.175,0),(.21,.005,.075),cream,tank,.003)
label('Bottle lettering','LPG',(0,-.180,-.015),.045,mat=black,parent=tank)

# A single suspension seat and an open cab, with manual levers and analogue dials.
box('Seat suspension',(0,-.28,1.02),(.44,.43,.11),black,bevel=.025)
for z in [.99,1.02,1.05]:box('Suspension bellows',(0,-.28,z),(.46,.44,.016),rubber,bevel=.018)
box('Seat cushion',(0,-.20,1.14),(.52,.48,.15),vinyl,bevel=.065,segments=6)
back=box('Contoured seat back',(0,0,0),(.54,.14,.43),vinyl,bevel=.06,segments=6)
back.location=(0,-.46,1.42); back.rotation_euler.x=math.radians(-11)
for x in [-.22,.22]:box('Seat bolster',(x,-.2,1.19),(.08,.41,.10),vinyl,bevel=.035,segments=5)
for x in [-.15,-.075,0,.075,.15]:hose('Seat seam',[(x,-.36,1.216),(x,-.16,1.219),(x,-.025,1.21)],.0025,black)
rod('Belt receiver',(.25,-.25,1.1),(.29,-.19,1.22),.012,black)
box('Belt buckle',(.29,-.19,1.23),(.045,.06,.035),red)
hose('Seat belt',[(-.26,-.35,1.16),(-.25,-.15,1.21),(-.19,-.01,1.2)],.014)
profile('Sloping dashboard',[(.57,.51),(.82,.51),(.82,1.13),(.63,1.17),(.49,.93)],.82,black,bevel=.035)
rod('Steering column',(-.16,.61,.72),(-.16,.34,1.2),.033,black)
steer=empty('SteeringWheel_Pivot',(-.16,.34,1.2),root); steer.rotation_euler.x=math.radians(32)
torus('Steering wheel',(0,0,0),.177,.015,rubber,steer)
cyl('Horn button',(0,0,.005),.047,.035,black,steer)
for i in range(3):
    a=i*math.tau/3; rod('Steering spoke',(0,0,0),(.164*math.cos(a),.164*math.sin(a),0),.009,black,steer)
cyl('Steering spinner',(.142,0,.041),.024,.05,black,steer)
for x in [-.19,0,.19]:
    cyl('Gauge bezel',(x,.599,1.105),.046,.018,steel,axis='Y')
    cyl('Gauge dial',(x,.586,1.105),.038,.006,black,axis='Y')
    rod('Gauge needle',(x,.581,1.105),(x-.017,.581,1.13),.002,cream)
for i in range(3):
    x=.23+i*.072; rod('Hydraulic lever',(x,.48,.85),(x,.29,1.16-i*.018),.009,steel)
    cyl('Lever grip',(x,.29,1.18-i*.018),.022,.07,black)
for x,w in [(-.22,.14),(.02,.13),(.23,.085)]:
    o=box('Pedal',(0,0,0),(w,.18,.033),rubber); o.location=(x,.57,.565); o.rotation_euler.x=math.radians(22)
rod('Parking brake',(-.35,.21,.65),(-.35,.05,.87),.013,steel)
rod('Brake grip',(-.35,.05,.87),(-.35,-.01,.91),.022,black)

# Slightly inclined posts and a broad flat slatted overhead guard.
for x in [-.49,.49]:
    bar('Rear guard post',(x,-.65,.86),(x,-.70,2.12),.065,.075)
    bar('Front guard post',(x,.80,.72),(x,.65,2.12),.065,.075)
    box('Roof side rail',(x,-.025,2.15),(.075,1.5,.09),black,bevel=.015)
    hose('Grab handle',[(x,.76,1.15),(x,.66,1.23),(x,.64,1.49),(x,.71,1.56)],.014,black)
for y in [-.75,.70]:box('Roof cross rail',(0,y,2.15),(1.05,.075,.09),black,bevel=.015)
for x in [-.34,-.17,0,.17,.34]:box('Roof slat',(x,-.025,2.16),(.044,1.39,.055),black)
for x in [-.4,.4]:
    box('Headlamp housing',(x,.75,1.83),(.16,.12,.13),black,bevel=.025)
    box('Headlamp lens',(x,.817,1.83),(.125,.018,.092),glass,bevel=.012)
    for xx in [-.04,-.02,0,.02,.04]:box('Fluted glass',(x+xx,.829,1.83),(.006,.005,.08),glass,bevel=.002)
    box('Rear lamp housing',(x,-1.43,.89),(.17,.075,.105),black,bevel=.025)
    box('Tail light',(x-.035,-1.474,.89),(.08,.014,.07),red,bevel=.008)
    box('Turn signal',(x+.041,-1.474,.89),(.045,.014,.07),amber,bevel=.006)
cyl('Beacon base',(.37,-.59,2.23),.064,.04,black)
cyl('Amber beacon',(.37,-.59,2.3),.053,.105,amber,vertices=48,bevel=.018)
rod('Mirror stalk',(-.49,.59,1.97),(-.61,.53,2.01),.01,black)
box('Mirror housing',(-.61,.51,2.01),(.13,.055,.15),black,bevel=.025)
box('Mirror face',(-.61,.479,2.01),(.105,.009,.122),chrome,bevel=.015)
box('Safety label',(.529,-.646,1.62),(.006,.06,.18),cream,bevel=.002)
for z in [1.57,1.6,1.63,1.66]:box('Safety label rules',(.533,-.646,z),(.003,.044,.005),black,bevel=.001)
for s in [-1,1]:label('Fleet number','04',(s*.604,-1.13,.6),.135,(math.pi/2,0,s*math.pi/2),black)

# Heavy channel mast with twin hydraulic rams, chains and independent carriage.
mast=empty('MastTilt_Pivot',(0,1.075,.34),root); mast['tilt_axis']='local X'
inner=empty('InnerMast_Lift',parent=mast)
for x in [-.40,.40]:
    box('Mast channel web',(x,0,.74),(.055,.16,2.01),black,mast)
    for y in [-.08,.08]:box('Mast channel flange',(x,y,.74),(.14,.028,2.01),black,mast)
    cyl('Mast tilt pin',(x,0,0),.067,.16,steel,mast,'X')
    rod('Tilt cylinder',(x,.40,.48),(x,.78,.61),.044,black)
    rod('Tilt piston',(x,.78,.61),(x,1.07,.7),.023,chrome)
for z in [-.15,1.72]:box('Mast cross tie',(0,-.035,z),(.92,.16,.11),black,mast)
for x in [-.29,.29]:
    box('Sliding mast rail',(x,.06,.79),(.05,.12,1.94),steel,inner)
    for y in [.005,.115]:box('Sliding mast flange',(x,y,.79),(.1,.026,1.94),black,inner)
box('Inner mast header',(0,.06,1.79),(.7,.16,.09),black,inner)
for x in [-.185,.185]:
    cyl('Lift ram barrel',(x,-.065,.44),.047,1.16,black,mast)
    cyl('Lift piston',(x,-.065,1.2),.025,.51,chrome,mast)
    cyl('Chain pulley',(x,.045,1.46),.061,.038,steel,mast,'X')
    for i in range(43):
        z=-.03+i*.034; box('Lift chain link',(x,.117,z),(.027,.012,.025),steel,mast,.003)
        if i%2==0:cyl('Chain pin',(x,.126,z),.006,.036,steel,mast,'X',8,0)
    hose('Hydraulic hose',[(x,-.13,-.12),(x,-.15,.6),(x,-.15,1.4),(x,-.08,1.55),(x,.01,1.4)],.009,rubber,mast)
carriage=empty('ForkCarriage_Lift',(0,.20,0),mast)
for z in [.05,.49]:box('Carriage rail',(0,0,z),(1.05,.1,.10),steel,carriage)
for x in [-.46,.46]:
    box('Carriage end plate',(x,0,.27),(.08,.1,.52),black,carriage)
    for z in [.05,.49]:cyl('Carriage guide roller',(x*.65,-.09,z),.061,.045,steel,carriage,'X')
for z in [.53,1.20]:box('Backrest horizontal',(0,.015,z),(1.12,.055,.055),black,carriage)
for x in [-.53,-.353,-.176,0,.176,.353,.53]:box('Backrest vertical',(x,.015,.865),(.029,.04,.67),black,carriage)
for x in [-.275,.275]:
    fork=empty('Fork_Left' if x<0 else 'Fork_Right',(x,0,0),carriage)
    # Continuous L-section connects the taper to the vertical heel.
    profile('Continuous forged fork',[(.018,.58),(.07,.58),(.07,-.19),(.105,-.22),(1.13,-.22),(1.13,-.232),(.12,-.263),(.045,-.263),(.018,-.23)],.10,steel,fork,.006)
    box('Carriage hook',(0,.002,.53),(.12,.10,.055),steel,fork)
    cyl('Fork spacing lock',(0,.005,.58),.014,.045,steel,fork)
    for i in range(3):box('Fork use polish',(-.029+i*.027,.62,-.219),(.004,.76,.001),chrome,fork,.0002)
for s in [-1,1]:
    for i in range(12):box('Sill paint chip',(s*.596,random.uniform(-.1,.99),random.uniform(.32,.44)),(.002,random.uniform(.012,.045),random.uniform(.002,.006)),scuff,bevel=.0004)
    for i in range(7):box('Counterweight scuff',(s*.601,random.uniform(-1.31,-.96),.49+random.uniform(-.03,.03)),(.002,random.uniform(.016,.055),.003),scuff,bevel=.0004)
empty('OperatorSeat',(0,-.2,1.215),root); empty('OperatorEye',(0,-.22,1.77),root)
empty('ForkTips',(0,1.13,-.22),carriage); empty('LoadCentre',(0,.61,-.20),carriage)

# Separate studio collection, excluded from the game export.
studio=bpy.data.collections.new('STUDIO | excluded from export'); scene.collection.children.link(studio)
def studio_object(o):
    for c in list(o.users_collection):c.objects.unlink(o)
    studio.objects.link(o); return o
studio_object(box('Studio ground',(0,0,-.035),(200,200,.06),material('studio neutral',(.19,.205,.19)),None,0))
world=bpy.data.worlds.new('Soft studio'); scene.world=world; world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.28,.32,.38,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.4
for name,loc,power,size in [('Key',(2,4,6),1300,5),('Fill',(-4,1,3),750,4),('Rim',(1,-4,5),1600,4)]:
    d=bpy.data.lights.new(name,'AREA'); d.energy=power; d.shape='DISK'; d.size=size
    o=bpy.data.objects.new(name,d); studio.objects.link(o); o.location=loc
    o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(5.4,6.7,3.65)); camera=studio_object(bpy.context.object)
camera.name='Preview camera'; camera.data.type='ORTHO'; camera.data.ortho_scale=4.9
def aim(loc,target=(0,.2,1.05)):
    camera.location=loc; camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
aim((5.4,6.7,3.65)); scene.camera=camera
scene.render.engine='CYCLES'; scene.cycles.samples=48; scene.cycles.use_denoising=True
scene.render.resolution_x=1600; scene.render.resolution_y=1400; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'; scene.view_settings.exposure=-.35
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=5.7; area.spaces.active.region_3d.view_location=(0,.2,1)
            area.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion(); area.spaces.active.clip_end=500
bpy.ops.object.select_all(action='DESELECT'); root.select_set(True); bpy.context.view_layer.objects.active=root
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'warehouse-forklift.blend'))
# Bake in a single operation, then combine each static material group under its pivot.
bpy.ops.object.select_all(action='DESELECT')
for o in root.children_recursive:
    if o.type in {'MESH','CURVE','FONT'}:o.select_set(True)
bpy.context.view_layer.objects.active=next(o for o in bpy.context.selected_objects if o.type=='MESH')
bpy.ops.object.convert(target='MESH')
groups={}
for o in list(root.children_recursive):
    if o.type=='MESH':groups.setdefault((o.parent,o.data.materials[0]),[]).append(o)
for (parent,mat),objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    objects[0].name=parent.name+' | '+mat.name.split('|')[-1].strip()
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
asset=[root]+list(root.children_recursive); bpy.ops.object.select_all(action='DESELECT')
for o in asset:o.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.fbx(filepath=str(UNITY/'warehouse-forklift.fbx'),use_selection=True,object_types={'MESH','EMPTY'},axis_forward='-Z',axis_up='Y',apply_unit_scale=True,add_leaf_bones=False,bake_anim=False,use_mesh_modifiers=True,mesh_smooth_type='FACE')
meshes=[o for o in asset if o.type=='MESH']; points=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
lo=[min(p[i] for p in points) for i in range(3)]; hi=[max(p[i] for p in points) for i in range(3)]; triangles=0
for o in meshes:o.data.calc_loop_triangles(); triangles+=len(o.data.loop_triangles)
assert len([o for o in asset if o.type=='EMPTY' and o.name.startswith(('FrontWheel_','RearWheel_'))])==4
assert -.015<lo[2]<.02
report={'design':'Classic yellow LPG forklift, rebuilt from scratch','dimensions_m':[round(hi[i]-lo[i],4) for i in range(3)],'bounds_min_m':lo,'bounds_max_m':hi,'triangles':triangles,'mesh_objects':len(meshes),'materials':len({m.name for o in meshes for m in o.data.materials}),'blade_length_m':1.06,'fork_centres_m':.55,'blade_width_m':.10,'blade_heel_thickness_m':.043,'floor_clearance_under_forks_m':.077,'wheelbase_m':1.71,'guard_height_m':2.195,'status':'Art asset and FBX. Driving and lifting gameplay are not installed.'}
(UNITY/'warehouse-forklift-report.json').write_text(json.dumps(report,indent=2)+'\n'); print(json.dumps(report,indent=2),flush=True)
for filename,loc,target in [('warehouse-forklift-preview.png',(5.4,6.7,3.65),(0,.2,1.05)),('warehouse-forklift-rear.png',(-5.7,-6.8,3.7),(0,-.05,1.05)),('warehouse-forklift-side.png',(7,0,2.1),(0,.25,1.05))]:
    aim(loc,target); scene.render.filepath=str(OUT/filename); bpy.ops.render.render(write_still=True)
print('Classic forklift completed',flush=True)
