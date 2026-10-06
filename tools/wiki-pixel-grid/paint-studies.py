#!/usr/bin/env python3
"""Three individually composed raster painting studies, with no image model.

Analytic underpainting is covered in directional, pressure-varied pigment strokes.
The shared tool is a brush; subject geometry and lighting are authored per study.
These are proposals, not replacements in the public 250-tile grid.
"""
import math, random, json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'research/wiki-pixel-grid/paint-studies';OUT.mkdir(parents=True,exist_ok=True)
N=1024
Y,X=np.mgrid[0:N,0:N].astype(float);x=X/N;y=Y/N

def noise(seed,size=32):
 r=np.random.default_rng(seed);im=Image.fromarray(np.uint8(r.random((size,size))*255));return np.asarray(im.resize((N,N),Image.Resampling.BICUBIC),float)/255-.5

def polygon(points):
 im=Image.new('L',(N,N));ImageDraw.Draw(im).polygon([(int(a*N),int(b*N)) for a,b in points],fill=255);return np.asarray(im,float)/255

def blend(field,color,mask):
 c=np.asarray(color);field[:]=field*(1-mask[:,:,None])+c*mask[:,:,None]

def paint(field,angle,seed,name,grain=2):
 rng=random.Random(seed)
 field=np.clip(field,0,255);im=Image.fromarray(field.astype('uint8')).filter(ImageFilter.GaussianBlur(1.1));d=ImageDraw.Draw(im)
 # Bristle marks carry neighboring pigment, with irregular ends and occasional gaps.
 for count,length,width in [(4500,31,11),(12000,14,4),(16000,5,1)]:
  for _ in range(count):
   px=rng.randrange(N);py=rng.randrange(N);theta=float(angle[py,px])+rng.gauss(0,.28);L=length*rng.uniform(.45,1.5);w=max(1,width*rng.uniform(.4,1.1))
   dx=math.cos(theta);dy=math.sin(theta);nx=-dy;ny=dx;delta=rng.gauss(0,grain)
   c=tuple(np.clip(field[py,px]+delta,0,255).astype(int));bend=rng.gauss(0,1.4)
   for k in range(max(2,int(w))):
    if rng.random()<.13:continue
    o=(k-w/2);a=(px-dx*L/2+nx*o,py-dy*L/2+ny*o);b=(px+nx*(o+bend),py+ny*(o+bend));z=(px+dx*L/2+nx*o,py+dy*L/2+ny*o)
    cc=tuple(max(0,min(255,v+rng.randrange(-4,5))) for v in c)
    d.line([a,b,z],fill=cc,width=1)
 # Fine canvas tooth modulates the pigment itself, rather than a pattern pasted on top.
 a=np.asarray(im).astype(float);tooth=(np.sin(X*math.pi*.91)*np.sin(Y*math.pi*.93))*1.2+noise(seed+99,500)*2
 a=np.clip(a+tooth[:,:,None],0,255).astype('uint8');im=Image.fromarray(a)
 im.save(OUT/(name+'.png'));im.save(OUT/(name+'.webp'),lossless=True,method=6)
 print(name,flush=True);return im

def mountain():
 # Jannu: an isolated high Himalayan wall, asymmetrical snow shoulders, cold shade.
 sky=np.zeros((N,N,3));t=np.clip(y/.66,0,1)[:,:,None];sky[:]=np.array([35,49,79])*(1-t)+np.array([205,160,138])*t
 cloud=noise(27,12)+noise(11,49)*.3
 blend(sky,[226,188,156],np.clip((cloud-.06)*1.6,0,.34)*(1-y)*.6)
 for k,pts in enumerate([
  [(0,.69),(.09,.54),(.20,.61),(.32,.45),(.50,.66),(.65,.54),(.82,.70),(1,.60),(1,1),(0,1)],
  [(0,.89),(.08,.64),(.23,.78),(.30,.61),(.48,.75),(.61,.62),(.88,.85),(1,.78),(1,1),(0,1)]
 ]):blend(sky,[76+k*9,86+k*6,107+k*4],polygon(pts))
 outline=[(.065,.98),(.17,.77),(.21,.60),(.32,.48),(.36,.35),(.41,.31),(.475,.145),(.515,.19),(.56,.175),(.61,.285),(.67,.32),(.695,.47),(.74,.50),(.795,.69),(.93,.94),(1,1),(0,1)]
 m=polygon(outline);ridge=.49+(y-.18)*.05+.018*np.sin(y*43)+.008*np.sin(y*141)
 lit=x<ridge
 rock=noise(82,75)*20+noise(64,240)*8
 strata=np.sin((y+x*.31)*320+noise(18,24)*7)*8
 base=np.stack([112+rock+strata,117+rock+strata,130+rock+strata],axis=2)
 base[lit]=np.stack([177+rock+strata,164+rock+strata,151+rock+strata],axis=2)[lit]
 snow=np.clip((.61-y)*2.7+noise(38,28)*.7+np.sin((x+y*.34)*103)*.15,0,1)
 snow*=np.clip((.74-x)*5,0,1)
 snowcol=np.zeros_like(base);snowcol[lit]=[241,225,200];snowcol[~lit]=[154,174,199]
 base=base*(1-snow[:,:,None])+snowcol*snow[:,:,None]
 sky[:]=sky*(1-m[:,:,None])+base*m[:,:,None]
 # Blue gullies descend from the crown; cliffs have light-catching broken shelves.
 im=Image.fromarray(np.uint8(np.clip(sky,0,255)));d=ImageDraw.Draw(im)
 rng=random.Random(94)
 for i in range(150):
  u=rng.uniform(.30,.77);v=rng.uniform(.30,.91)
  if m[int(v*N),int(u*N)]<.5:continue
  points=[(u*N,v*N),((u+.007)*N,(v+.025)*N),((u-.009)*N,(v+.058)*N)]
  d.line(points,fill=(74,90,112) if u>.50 else (122,116,118),width=rng.randrange(1,5))
 sky=np.asarray(im,float)
 mist=np.clip((noise(52,9)+.12)*.25,0,.14)*np.clip((y-.70)*4,0,1);blend(sky,[160,173,185],mist)
 angle=np.where(m>.5,1.32+noise(4,32)*.45,0.06+noise(3,12)*.3)
 return paint(sky,angle,147,'147-jannu-painted',3)

def gooseberries():
 # Macro still life: a diagonally hanging fruit cluster, backlit veined leaves.
 field=np.zeros((N,N,3));v=noise(157,9)+noise(10,46)*.18
 field[:,:,0]=25+v*28+y*9;field[:,:,1]=43+v*40+y*11;field[:,:,2]=37+v*25
 light=np.exp(-((x-.22)**2+(y-.12)**2)/.1)
 field+=light[:,:,None]*np.array([34,46,21]);angle=np.zeros((N,N))
 def leaf(cx,cy,rx,ry,theta):
  nonlocal field,angle
  u=(x-cx)*math.cos(theta)+(y-cy)*math.sin(theta);w=-(x-cx)*math.sin(theta)+(y-cy)*math.cos(theta)
  r=(u/rx)**2+(w/ry)**2;mask=np.clip((1-r)*80,0,1)
  veins=np.abs(np.sin(u*190+w*230));c=np.stack([48+light*44+veins*7,81+light*45+veins*8,43+light*19+veins*3],axis=2)
  field[:]=field*(1-mask[:,:,None])+c*mask[:,:,None];angle[mask>.5]=theta+.1
  im=Image.fromarray(np.uint8(np.clip(field,0,255)));d=ImageDraw.Draw(im)
  d.line([(int((cx-rx*math.cos(theta))*N),int((cy-rx*math.sin(theta))*N)),(int((cx+rx*math.cos(theta))*N),int((cy+rx*math.sin(theta))*N))],fill=(116,132,74),width=3)
  field=np.asarray(im,float).copy()
 leaf(.26,.22,.225,.095,-.54);leaf(.64,.21,.21,.085,.33);leaf(.72,.78,.23,.105,-.5)
 # Woody branch and hooked stems are painted before the fruit.
 im=Image.fromarray(np.uint8(np.clip(field,0,255)));d=ImageDraw.Draw(im)
 d.line([(66,52),(177,170),(391,233),(577,321),(854,358),(1024,454)],fill=(87,79,51),width=15,joint='curve')
 d.line([(65,49),(178,164),(392,228),(578,315),(855,351),(1024,448)],fill=(145,131,84),width=3,joint='curve')
 fruits=[(.29,.46,.135,(126,157,76)),(.57,.47,.17,(151,172,84)),(.77,.52,.113,(164,116,75)),(.425,.71,.145,(166,112,79)),(.67,.77,.16,(126,82,85))]
 for cx,cy,r,c in fruits:
  d.line([(int(cx*N),int((cy-r)*N)),(int((cx-.014)*N),int((cy-r-.08)*N))],fill=(125,136,75),width=5)
 field=np.asarray(im,float).copy()
 for cx,cy,r,color in fruits:
  u=(x-cx)/r;w=(y-cy)/(r*1.08);rad=u*u+w*w;mask=np.clip((1-rad)*90,0,1);z=np.sqrt(np.clip(1-rad,0,1));illum=np.clip(-u*.48-w*.6+z*.65,0,1)
  col=np.array(color)[None,None,:]*(.36+.70*illum[:,:,None]);col+=illum[:,:,None]**5*np.array([42,39,19])
  # Curved meridian ribs and translucent skin, not simple colored circles.
  ribs=np.sin(np.arctan2(u,np.maximum(.08,z))*13+cy*3);col+=ribs[:,:,None]*np.array([6,8,2]);col+=noise(int(cx*900),110)[:,:,None]*6
  field[:]=field*(1-mask[:,:,None])+col*mask[:,:,None]
  angle[mask>.5]=np.arctan2(w,u)[mask>.5]+math.pi/2
 # Calyx tips and translucent hairs are bespoke foreground marks.
 im=Image.fromarray(np.uint8(np.clip(field,0,255)));d=ImageDraw.Draw(im);rng=random.Random(154)
 for cx,cy,r,c in fruits:
  bx=cx*N;by=(cy+r*.96)*N
  for j in range(5):a=j*math.tau/5;d.line([(bx,by),(bx+math.cos(a)*11,by+math.sin(a)*7)],fill=(73,56,33),width=3)
  for j in range(85):
   a=rng.uniform(0,math.tau);px=(cx+math.cos(a)*r*.99)*N;py=(cy+math.sin(a)*r*1.07)*N
   if a<math.pi*1.2 and a>math.pi*.1:continue
   d.line([(px,py),(px+math.cos(a)*5,py+math.sin(a)*5)],fill=(169,170,112),width=1)
 return paint(np.asarray(im,float),angle,154,'154-gooseberries-painted',2)

def madang():
 # A quiet resort waterfront interpretation, with foliage and reflected lamplight.
 # No claim that the imagined buildings reproduce the real resort's architecture.
 field=np.zeros((N,N,3));t=np.clip(y/.49,0,1)[:,:,None]
 field[:]=np.array([47,81,95])*(1-t)+np.array([172,164,126])*t
 clouds=noise(84,13);blend(field,[209,186,146],np.clip(clouds-.02,0,.3)*(y<.45))
 far=polygon([(0,.47),(.04,.40),(.14,.425),(.23,.37),(.39,.44),(.54,.40),(.67,.45),(.86,.405),(1,.43),(1,.56),(0,.56)])
 blend(field,[43,78,69],far)
 water=y>.51;fade=np.clip((y-.51)/.49,0,1)
 waterfield=np.stack([89-fade*60,128-fade*61,127-fade*50],axis=2)
 waterfield+=noise(78,30)[:,:,None]*14+np.sin(y*310+x*8)[:,:,None]*4
 field[water]=waterfield[water]
 # Reflections are broken bands whose width grows toward the viewer.
 for cx,col in [(.39,[159,150,85]),(.49,[190,146,72]),(.60,[194,158,92])]:
  r=np.exp(-((x-cx-noise(34,19)*.026)/(.018+fade*.12))**2)*np.clip((.91-y)*2,0,1)*(y>.56)
  r*=.4+.6*np.maximum(0,np.sin(y*680+noise(77,45)*3));blend(field,col,r*.40)
 im=Image.fromarray(np.uint8(np.clip(field,0,255)));d=ImageDraw.Draw(im)
 def poly(pts,c):d.polygon([(int(a*N),int(b*N)) for a,b in pts],fill=c)
 # Low buildings with deep, shaded verandas behind a timber jetty.
 poly([(.28,.40),(.67,.40),(.67,.57),(.28,.57)],(127,128,93))
 poly([(.245,.414),(.37,.324),(.626,.353),(.70,.425)],(79,89,69))
 poly([(.253,.410),(.37,.329),(.628,.358),(.695,.421)],(111,105,74))
 poly([(.30,.425),(.65,.44),(.65,.555),(.30,.542)],(31,56,49))
 for k in range(9):
  a=.305+k*.039;poly([(a,.424),(a+.007,.425),(a+.007,.56),(a,.56)],(162,151,108))
  if k in (2,4,7):poly([(a+.01,.464),(a+.026,.465),(a+.026,.517),(a+.01,.517)],(217,180,105))
 poly([(.22,.57),(.70,.59),(.72,.614),(.215,.595)],(111,103,70))
 poly([(.51,.599),(.563,.602),(.735,.826),(.626,.837)],(133,120,82))
 for j in range(12):
  yy=.614+j*.018;left=.521+(yy-.614)*.49;right=.58+(yy-.614)*.70
  d.line([(int(left*N),int(yy*N)),(int(right*N),int((yy+.004)*N))],fill=(73,75,56),width=2)
 for a,b in [(.54,.62),(.59,.70),(.66,.81)]:
  d.line([(int(a*N),int(b*N)),(int(a*N),int((b+.07)*N))],fill=(60,63,46),width=5)
 # Foreground trunks are curved and taper; every frond is drawn along its own arc.
 rng=random.Random(3)
 for trunk in [[(60,1024),(85,800),(99,530),(157,226)],[(1002,1024),(920,726),(898,390),(826,126)]]:
  for j in range(len(trunk)-1):d.line(trunk[j:j+2],fill=(33,51,41),width=27-j*6)
  cx,cy=trunk[-1]
  for a,L in [(-2.93,260),(-2.45,215),(-1.87,190),(-1.14,242),(-.38,306),(.15,285),(.68,230),(1.10,197),(2.49,255)]:
   curve=[]
   for k in range(35):
    u=k/34;px=cx+math.cos(a)*L*u;py=cy+math.sin(a)*L*u+L*.28*u*u;curve.append((px,py))
   d.line(curve,fill=(43,72,48),width=3)
   for k in range(3,33):
    px,py=curve[k];w=math.sin(k/34*math.pi)*35;ang=a+math.pi/2
    for side in (-1,1):d.line([(px,py),(px+math.cos(ang)*w*side+math.cos(a)*16,py+math.sin(ang)*w*side+math.sin(a)*16+8)],fill=(46+rng.randrange(18),75+rng.randrange(21),45+rng.randrange(14)),width=2)
 # Dense lower-edge foliage and scattered warm-water ripples.
 for j in range(260):
  px=rng.randrange(N);py=rng.randrange(926,1040);L=rng.randrange(16,73)
  d.line([(px,py),(px+rng.randrange(-30,31),py-L)],fill=(24+rng.randrange(17),53+rng.randrange(31),36+rng.randrange(14)),width=rng.randrange(2,7))
 field=np.asarray(im,float);angle=np.where(y>.52,0,noise(5,13)*.5)
 return paint(field,angle,3,'003-madang-painted',2)

if __name__=='__main__':
 ims=[madang(),mountain(),gooseberries()]
 contact=Image.new('RGB',(1536,512))
 for i,im in enumerate(ims):contact.paste(im.resize((512,512),Image.Resampling.LANCZOS),(i*512,0))
 contact.save(OUT/'painted-studies.png')
 q=json.loads((ROOT/'tools/wiki-pixel-grid/subjects.json').read_text())
 (OUT/'provenance.json').write_text(json.dumps([dict(tile=n,article=q[n-1]['article'],subject=q[n-1]['subject'],evidence=q[n-1]['evidence'],revision=q[n-1]['revision'],method='Individually authored raster underpainting and directional pigment strokes. No image-generation model.') for n in [3,147,154]],indent=2)+'\n')
