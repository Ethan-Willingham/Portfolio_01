#!/usr/bin/env python3
"""LLM-written drawing instructions. No image-model calls, downloaded art or fonts.

Each subject has an explicit offline-article selection in subjects.json. Coordinates
are in a 256-unit square; renderers create real pixels, paper edges, engraved lines,
glass leading or individual textile stitches. Seeded details are reproducible.
"""
import argparse, json, math, random, hashlib
from pathlib import Path
from urllib.parse import quote
from PIL import Image, ImageDraw, ImageChops, ImageFilter
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/wiki-pixel-grid'
MASTERS=ROOT/'research/wiki-pixel-grid/code-masters'
PALETTES=[['#172d38','#345864','#749799','#d5c899','#c58c69','#815847','#d7d9ba','#668269'],
 ['#283d38','#608074','#a4b7a0','#ecd9b3','#ce9967','#8b5650','#f1dfc0','#929b63'],
 ['#302f43','#695b75','#ac8791','#f0c997','#b67c62','#5a526a','#e8d4be','#769a97'],
 ['#203443','#466279','#89a7b4','#e6cd9c','#ca8f78','#6b5864','#e4ded0','#64917d'],
 ['#343e32','#6f7856','#aab288','#e4c795','#be845b','#875e48','#eee0c3','#82a098']]
MEDIA=['pixel art','cut-paper collage','ink engraving','stained glass','woven tapestry']
def rgb(c):return tuple(int(c[i:i+2],16) for i in (1,3,5)) if isinstance(c,str) else c
def mix(c,d,t):return tuple(max(0,min(255,round(a*(1-t)+b*t))) for a,b in zip(rgb(c),rgb(d)))
class Art:
 def __init__(self,n):
  self.n=n;self.medium=(n-1)//50;self.r=random.Random(n*7867);self.p=[mix(c,PALETTES[(n+1)%5][i],(n%11)/18) for i,c in enumerate(PALETTES[(n*3)%5])];self.s=1 if self.medium==0 else 4
  self.im=Image.new('RGB',(256*self.s,256*self.s),rgb(self.p[0]));self.ops=[]
  if self.medium==2:self.im.paste((233,222,197),(0,0,1024,1024))
  self.d=ImageDraw.Draw(self.im)
 def coords(self,v):return [round(x*self.s) for x in v]
 def shape(self,kind,points,c,texture=True):
  c=rgb(c);s=self.s;mask=Image.new('L',self.im.size);md=ImageDraw.Draw(mask)
  if kind=='poly':md.polygon([(round(x*s),round(y*s)) for x,y in points],fill=255)
  else:md.ellipse(self.coords(points),fill=255)
  bbox=mask.getbbox()
  if not bbox:return
  self.ops.append((kind,points,c))
  if self.medium==1:
   shadow=ImageChops.offset(mask,2*s,3*s).filter(ImageFilter.GaussianBlur(1.1*s))
   self.im.paste(mix(self.p[0],'#100f10',.3),(0,0),shadow)
  if self.medium==2:
   lum=sum(c)/3;fill=mix('#636658','#efe3c9',max(.15,min(1,(lum-28)/195)))
   self.im.paste(fill,(0,0),mask)
  else:self.im.paste(c,(0,0),mask)
  if texture:
   patch=Image.new('RGB',self.im.size,c);pd=ImageDraw.Draw(patch)
   x0,y0,x1,y1=bbox
   if self.medium==0:
    # Deliberately clustered single art pixels, never antialiased.
    for _ in range(max(2,(x1-x0)*(y1-y0)//65)):
     x=self.r.randrange(x0,x1);y=self.r.randrange(y0,y1);l=1+self.r.randrange(3)
     pd.line((x,y,x+l,y),fill=mix(c,self.p[6],.17 if self.r.random()<.5 else -.12))
   elif self.medium==1:
    for _ in range((x1-x0)*(y1-y0)//900):
     x=self.r.randrange(x0,x1);y=self.r.randrange(y0,y1)
     pd.line((x,y,x+3,y+1),fill=mix(c,self.p[6],.07),width=1)
   elif self.medium==2:
    pd.rectangle((0,0,*self.im.size),fill=fill)
    spacing=max(3,round((3+lum/65)*s));dark=(52,54,47)
    for x in range(x0-(y1-y0),x1,spacing):pd.line((x,y1,x+y1-y0,y0),fill=dark,width=max(1,round(.28*s)))
    if lum<120:
     for y in range(y0,y1,spacing+3):pd.line((x0,y,x1,y+round(10*s)),fill=dark,width=1)
   elif self.medium==3:
    # Triangular panes have actual leading, not a color filter over the scene.
    step=26*s
    for y in range(y0,y1,step):
     for x in range(x0,x1,step):
      for tri in [[(x,y),(x+step,y),(x+step,y+step)],[(x,y),(x,y+step),(x+step,y+step)]]:
       pd.polygon(tri,fill=mix(c,self.p[6 if (x+y)//step%2 else 0],.12))
       pd.line(tri+[tri[0]],fill=mix(c,self.p[0],.5),width=round(.65*s))
   else:
    for y in range(y0,y1,3*s):
     pd.line((x0,y,x1,y),fill=mix(c,self.p[0],.23),width=max(1,s//2))
     for x in range(x0+(y//s%2)*s,x1,3*s):
      pd.line((x,y+s,x+2*s,y-s),fill=mix(c,self.p[6],.18),width=max(1,s//2))
   self.im.paste(patch,(0,0),mask)
  if self.medium in (1,2,3):
   outline=(45,48,42) if self.medium==2 else mix(c,self.p[0],.6)
   line=ImageDraw.Draw(self.im);w=round((.45 if self.medium==2 else 1.5 if self.medium==3 else .3)*s)
   if kind=='poly':line.line([(round(x*s),round(y*s)) for x,y in points+[points[0]]],fill=outline,width=max(1,w))
   else:line.ellipse(self.coords(points),outline=outline,width=max(1,w))
 def poly(self,p,c,texture=True):self.shape('poly',p,c,texture)
 def ellipse(self,b,c,texture=True):self.shape('ellipse',b,c,texture)
 def rect(self,b,c,texture=True):x,y,X,Y=b;self.poly([(x,y),(X,y),(X,Y),(x,Y)],c,texture)
 def line(self,p,c,w=1):
  if self.medium==2:c='#343a32'
  self.d.line([(round(x*self.s),round(y*self.s)) for x,y in p],fill=rgb(c),width=max(1,round(w*self.s)),joint='curve')
  self.ops.append(('line',p,rgb(c),w))
 def circle(self,x,y,r,c,t=True):self.ellipse((x-r,y-r,x+r,y+r),c,t)
 def sky(self,night=False):
  p=self.p
  for y in range(0,256,8):self.rect((0,y,256,y+8),mix(p[0 if night else 1],p[3],y/450),False)
  self.circle(38+(self.n*29)%180,31+(self.n*17)%47,16+self.n%15,p[3],False)
  if night:
   for _ in range(45):self.circle(self.r.randrange(256),self.r.randrange(160),.8,p[6],False)
  else:
   for x,y in [(27,48+self.n%19),(136,27+(self.n*3)%23),(206,94-self.n%21)]:
    self.ellipse((x-30,y,x+26,y+5),mix(p[6],p[2],.25),False)
 def hills(self,water=False):
  p=self.p
  for level in range(3):
   y=120+level*35;pts=[(-8,256),(-8,y)]
   pts += [(x,y-15-math.sin(x/35+self.n+level)*18) for x in range(0,273,17)];pts.append((272,256))
   self.poly(pts,p[2 if level==0 else 7 if level==1 else 1])
  if water:
   self.poly([(113,150),(142,150),(185,190),(151,225),(228,256),(84,256),(132,215),(108,184)],p[2])
   for y in range(165,256,7):self.line([(110+(y-165)/3,y),(141+(y-165)/2,y)],p[6],.7)
 def tree(self,x,y,h=48):
  p=self.p;self.poly([(x-2,y),(x+3,y),(x+1,y-h*.8),(x-1,y-h*.8)],p[5])
  for j in range(3):self.poly([(x-h*.35,y-h*.3-j*h*.2),(x+h*.35,y-h*.3-j*h*.2),(x,y-h-j*h*.08)],p[7 if j%2 else 1])
 def house(self,x,y,w=35,h=30,tower=False):
  p=self.p;self.rect((x,y-h,x+w,y),p[3]);self.poly([(x,y-h),(x+w,y-h),(x+w+6,y-h-5),(x+w*.5,y-h-20),(x-5,y-h-5)],p[5])
  self.poly([(x+w,y-h),(x+w+9,y-h-6),(x+w+9,y-6),(x+w,y)],p[4])
  for u in range(4,int(w)-4,9):
   for v in range(6,int(h)-3,11):self.rect((x+u,y-h+v,x+u+4,y-h+v+6),p[1],False)
  self.rect((x+w*.4,y-11,x+w*.6,y),p[0],False)
 def village(self,city=False,water=False):
  self.sky();self.hills(water)
  count=10 if city else 5
  for i in range(count):
   x=15+(i*43+self.n*11)%210;y=151+(i*23)%75;w=20+(i*5+self.n)%24;h=25+(i*13+self.n)%(62 if city else 20)
   self.house(x,y,w,h)
  for x in (8,76,214,245):self.tree(x,238,36+self.n%27)
  self.line([(0,245),(84,220),(128,197),(151,173)],self.p[3],5)
 def person(self,x,y,h=85,pose='stand',dress=False):
  p=self.p;u=h/90
  self.ellipse((x-14*u,y-h-3*u,x+14*u,y-h+26*u),p[4]);self.poly([(x-14*u,y-h+8*u),(x-13*u,y-h-6*u),(x+10*u,y-h-7*u),(x+17*u,y-h+9*u),(x+9*u,y-h+1*u),(x-6*u,y-h+2*u)],p[0])
  self.line([(x-6*u,y-h+12*u),(x-2*u,y-h+12*u)],p[0],1.5*u);self.line([(x+4*u,y-h+12*u),(x+8*u,y-h+12*u)],p[0],1.5*u)
  self.line([(x-3*u,y-h+20*u),(x+5*u,y-h+21*u)],p[5],u)
  self.poly([(x-11*u,y-h+26*u),(x+13*u,y-h+26*u),(x+22*u,y-25*u),(x-22*u,y-25*u)],p[2 if dress else 1])
  if dress:self.poly([(x-12*u,y-39*u),(x+13*u,y-39*u),(x+29*u,y),(x-29*u,y)],p[4])
  elif pose in ('run','kick','jump'):
   self.line([(x-9*u,y-28*u),(x-31*u,y-3*u),(x-48*u,y-12*u)],p[5],9*u)
   self.line([(x+8*u,y-28*u),(x+33*u,y-18*u),(x+49*u,y-34*u)],p[4],9*u)
  else:
   self.line([(x-9*u,y-28*u),(x-12*u,y)],p[5],9*u);self.line([(x+9*u,y-28*u),(x+13*u,y)],p[5],9*u)
  if pose in ('run','kick','jump'):
   self.line([(x-14*u,y-h+31*u),(x-32*u,y-h+49*u),(x-43*u,y-h+30*u)],p[4],7*u)
   self.line([(x+14*u,y-h+31*u),(x+32*u,y-h+18*u),(x+40*u,y-h+33*u)],p[4],7*u)
  else:
   self.line([(x-13*u,y-h+32*u),(x-26*u,y-h+49*u),(x-6*u,y-h+57*u)],p[4],7*u)
   self.line([(x+13*u,y-h+32*u),(x+24*u,y-h+48*u),(x+5*u,y-h+57*u)],p[4],7*u)
 def stage(self,people=1):
  p=self.p;self.sky(True);self.poly([(88,0),(167,0),(221,230),(35,230)],mix(p[3],p[1],.5))
  for x in (0,226):
   self.rect((x,0,x+30,256),p[5]);
   for u in range(x+2,x+29,6):self.line([(u,0),(u,256)],p[4],2)
  self.rect((0,231,256,256),p[0]);self.line([(0,231),(256,231)],p[3],2)
  for i in range(people):self.person(128+(i-(people-1)/2)*55,225,115 if people==1 else 85,dress=self.n%2==0)
 def book(self,x=83,y=155,w=91):
  p=self.p;self.poly([(x,y),(x+w/2,y+10),(x+w,y),(x+w,y+50),(x+w/2,y+60),(x,y+49)],p[3]);self.line([(x+w/2,y+10),(x+w/2,y+60)],p[5],1)
  for j in range(8):
   self.line([(x+5,y+8+j*5),(x+w/2-6,y+17+j*5)],p[5],.6)
   self.line([(x+w/2+6,y+17+j*5),(x+w-5,y+8+j*5)],p[5],.6)
 def ball(self,x,y,r=16,oval=False):
  p=self.p;self.ellipse((x-r*(1.5 if oval else 1),y-r,x+r*(1.5 if oval else 1),y+r),p[6]);
  for i in range(5):
   a=i*math.tau/5;self.line([(x,y),(x+math.cos(a)*r,y+math.sin(a)*r)],p[5],1)
  self.circle(x,y,r*.25,p[0],False)
 def field(self):
  self.sky();self.poly([(0,112),(256,112),(256,256),(0,256)],self.p[7]);
  self.line([(0,208),(256,208)],self.p[6],1);self.line([(128,112),(128,256)],self.p[6],1)
  self.ellipse((73,151,184,227),self.p[7],False);self.line([(73,189),(184,189)],self.p[6],1)
 def camera(self,x,y,s=1):
  p=self.p;self.rect((x,y,x+40*s,y+24*s),p[0]);self.circle(x+10*s,y-6*s,13*s,p[1]);self.circle(x+31*s,y-6*s,13*s,p[1]);self.poly([(x+40*s,y+5*s),(x+54*s,y),(x+54*s,y+24*s),(x+40*s,y+18*s)],p[5]);
  self.line([(x+20*s,y+24*s),(x+3*s,y+70*s)],p[0],3*s);self.line([(x+20*s,y+24*s),(x+36*s,y+70*s)],p[0],3*s)
 def mic(self,x,y,s=1):
  self.ellipse((x-5*s,y,x+5*s,y+19*s),self.p[6]);self.line([(x-8*s,y+9*s),(x-8*s,y+23*s),(x+8*s,y+23*s),(x+8*s,y+9*s)],self.p[0],2*s);self.line([(x,y+23*s),(x,y+65*s)],self.p[0],2*s)
 def plant(self,berries=False):
  p=self.p;self.sky(True)
  for k in range(3):
   x=53+k*62;self.line([(128,256),(x,75+k*18)],p[7],4)
   for i in range(5):
    y=99+i*26;dx=-1 if i%2 else 1
    self.poly([(x,y),(x+dx*41,y-28),(x+dx*36,y-6),(x+dx*12,y+6)],p[7]);self.line([(x,y),(x+dx*34,y-23)],p[3],.6)
    if berries:
     self.ellipse((x-13,y+5,x+17,y+39),p[4] if i%2 else p[2]);
     for z in range(4):self.line([(x-8+z*6,y+8),(x-5+z*5,y+35)],p[3],.5)
    elif self.n==2:
     self.poly([(x-13,y-9),(x-12,y-29),(x-4,y-22),(x,y-35),(x+5,y-22),(x+13,y-29),(x+12,y-9),(x+6,y-3),(x-7,y-3)],p[4])
    else:
     for z in range(5):
      a=z*math.tau/5;self.circle(x+math.cos(a)*12,y+math.sin(a)*12,9,p[4])
     self.circle(x,y,5,p[3],False)
 def train(self,bus=False):
  p=self.p;self.sky();self.hills();self.line([(0,227),(256,227)],p[0],4);self.line([(0,239),(256,239)],p[5],2)
  for x in range(0,256,11):self.line([(x,228),(x+7,239)],p[3],1)
  self.poly([(20,143),(205,143),(236,169),(236,212),(20,212)],p[3]);self.rect((20,179,236,191),p[4]);
  for x in range(29,204,23):self.rect((x,153,x+17,175),p[1])
  self.poly([(209,149),(230,170),(230,178),(210,178)],p[0]);
  for x in (45,85,179,210):self.circle(x,215,12,p[0]);self.circle(x,215,6,p[2])
 def horse(self,two=False):
  p=self.p;self.sky();self.hills()
  for x in ([77,178] if two else [127]):
   z=(.75 if x==77 else .45) if two else 1;self.ellipse((x-56*z,143,x+35*z,185),p[4]);self.poly([(x+20*z,163),(x+33*z,116),(x+59*z,118),(x+62*z,134),(x+42*z,151)],p[4]);
   self.poly([(x+37*z,121),(x+40*z,106),(x+47*z,122)],p[5]);self.circle(x+50*z,128,2,p[0],False)
   for j in (-40,-15,10,29):self.line([(x+j*z,173),(x+(j-8)*z,225)],p[5],6*z)
   self.line([(x-47*z,153),(x-71*z,187)],p[5],5*z)
 def mountain(self):
  p=self.p;self.sky();
  for x,h in [(40,108),(157,30),(237,83)]:
   self.poly([(x-110,256),(x,h),(x+105,256)],p[5]);self.poly([(x,h),(x+105,256),(x+22,188)],p[1]);self.poly([(x,h),(x-33,h+61),(x-8,h+51),(x+8,h+78),(x+34,h+64)],p[6]);
   for i in range(8):self.line([(x,h+14+i*11),(x-67+i*7,241)],p[3],.7)
 def frog(self,newt=False):
  p=self.p;self.sky(True);self.ellipse((0,171,273,255),p[7]);self.line([(0,222),(253,188)],p[3],1)
  if newt:
   self.poly([(48,175),(75,144),(114,146),(172,169),(231,136),(202,179),(139,192),(78,187)],p[5]);
   for x in (81,142):self.line([(x,174),(x-12,208),(x+8,216)],p[4],6)
   self.circle(76,160,4,p[6],False)
  else:
   self.ellipse((72,133,179,194),p[7]);self.ellipse((70,117,135,159),p[2]);
   for x in (87,118):self.circle(x,124,12,p[3]);self.circle(x,124,5,p[0],False)
   self.line([(75,164),(50,189),(78,206),(97,199)],p[2],9);self.line([(159,159),(196,186),(174,210),(152,199)],p[2],10)
   self.line([(104,160),(105,201),(86,208)],p[3],4);self.line([(129,157),(140,203),(158,206)],p[3],4)
 def portraitdesk(self,books=True):
  p=self.p;self.rect((0,0,256,256),p[3]);
  for x in range(10,255,22):self.rect((x,17,x+15,97),p[5 if x%3 else 7])
  self.person(128,210,142,dress=self.n%3==0);self.rect((0,204,256,256),p[5]);self.book(69,194,107)
  self.line([(194,177),(179,231)],p[0],2);self.rect((189,214,216,244),p[2])
 def music(self,kind):
  p=self.p;self.stage();
  if kind in ('guitar','music'):
   self.ellipse((83,153,142,203),p[4]);self.ellipse((90,141,137,176),p[3]);self.line([(120,158),(185,95)],p[5],12);self.circle(115,172,8,p[0],False)
   for j in range(5):self.line([(99+j*2,183),(185+j*1,95)],p[6],.4)
  elif kind=='violin':
   self.ellipse((84,130,112,165),p[4]);self.ellipse((99,143,134,174),p[4]);self.line([(108,150),(153,98)],p[5],8);self.line([(80,109),(159,183)],p[3],2)
  elif kind in ('piano','organ','vibraphone'):
   self.rect((35,160,226,205),p[0]);
   for x in range(39,223,9):
    self.rect((x,164,x+7,199),p[6])
    if kind!='vibraphone':self.rect((x+5,163,x+9,183),p[5])
    else:self.circle(x+3,173,1.2,p[0],False)
   if kind=='vibraphone':
    for x in (64,199):self.line([(x,163),(x+21,125)],p[3],2);self.circle(x+21,125,4,p[5])
   if kind=='organ':
    for x in range(20,240,14):self.rect((x,30+abs(128-x)/2,x+9,143),p[2])
  elif kind=='drums':
   for x in (77,178):self.circle(x,188,39,p[5]);self.circle(x,188,31,p[3]);self.circle(x,188,5,p[0],False)
   for x in (57,202):self.ellipse((x-30,116,x+30,129),p[3]);self.line([(x,124),(x,215)],p[0],2)
  else:self.mic(167,146,1.1)
 def ship(self):
  p=self.p;self.sky();self.rect((0,150,256,256),p[1]);
  for y in range(159,256,9):
   for x in range((y*3)%25,256,39):self.line([(x,y),(x+23,y)],p[2],1)
  self.poly([(35,184),(222,184),(194,214),(60,210)],p[5]);
  for x in (97,153):
   self.line([(x,62),(x,191)],p[0],2);self.poly([(x+3,74),(x+55,173),(x+3,165)],p[6]);self.poly([(x-4,83),(x-48,167),(x-4,165)],p[3]);
   self.line([(x,65),(35,187)],p[3],.6);self.line([(x,65),(217,190)],p[3],.6)
 def car(self,racing=False):
  p=self.p;self.sky();self.hills();self.poly([(0,207),(256,186),(256,256),(0,256)],p[0]);self.line([(0,245),(256,223)],p[3],2)
  if racing:
   self.poly([(25,181),(66,171),(106,160),(153,161),(195,181),(233,186),(235,198),(22,201)],p[4]);
   self.rect((27,164,57,189),p[0]);self.rect((201,179,235,194),p[0]);self.circle(134,165,9,p[6]);self.rect((108,159,155,167),p[0])
  else:
   self.rect((35,158,218,201),p[4]);self.poly([(66,158),(84,110),(163,110),(195,158)],p[3]);self.rect((85,119,122,152),p[1]);self.rect((132,119,164,152),p[1]);self.rect((201,167,220,178),p[3])
  for x in (64,187):self.circle(x,202,23,p[0]);self.circle(x,202,12,p[2]);self.circle(x,202,5,p[3])
 def church(self,synagogue=False,shrine=False):
  p=self.p;self.sky();self.hills();
  if shrine:
   self.rect((65,134,203,217),p[3]);self.poly([(40,136),(219,136),(245,119),(154,92),(120,92),(20,119)],p[5]);
   for x in (55,200):self.rect((x,87,x+8,244),p[4]);self.line([(31,80),(227,80)],p[4],10)
   self.line([(41,101),(216,101)],p[4],6)
  else:
   self.rect((43,137,213,232),p[3]);self.poly([(34,138),(128,77),(222,138)],p[4]);
   for x in (52,188):self.rect((x,85,x+24,231),p[4]);self.poly([(x-6,85),(x+12,53),(x+31,85)],p[5]);
   if synagogue:
    self.ellipse((80,46,176,122),p[3]);self.rect((80,97,176,137),p[3]);self.line([(128,44),(128,28)],p[5],2)
   for x in range(85,175,23):self.ellipse((x,142,x+14,166),p[1]);self.rect((x,154,x+14,192),p[1])
   self.ellipse((112,175,145,210),p[0]);self.rect((112,192,145,232),p[0])
  for i in range(5):self.rect((45-i*7,233+i*4,215+i*7,236+i*4),p[2])
 def school(self):
  p=self.p;self.sky();self.rect((0,203,256,256),p[7]);self.house(25,219,204,79)
  self.rect((100,170,152,218),p[0]);self.rect((110,178,143,218),p[3]);self.book(72,223,110)
  for x in (14,242):self.tree(x,235,55)
 def classroom(self):
  p=self.p;self.rect((0,0,256,256),p[3]);self.rect((25,25,225,126),p[7]);self.rect((32,32,217,119),p[0]);
  self.line([(52,70),(94,46),(148,88),(198,49)],p[6],2);self.circle(167,67,16,p[4]);
  for x in (57,127,196):self.person(x,239,80);self.rect((x-32,219,x+32,235),p[5]);self.book(x-25,210,50)
 def sports(self,k):
  p=self.p;self.field();self.person(123,223,118,'jump' if k in ('volleyball','basketball','korfball') else 'kick')
  if k=='baseball':
   self.poly([(128,162),(187,211),(127,252),(62,211)],p[4]);self.line([(128,162),(187,211),(127,252),(62,211),(128,162)],p[6],1)
   if self.n==207:self.line([(108,134),(58,106),(24,133)],p[4],7);self.circle(24,133,4,p[6],False)
   else:self.line([(153,146),(198,89)],p[3],5);self.circle(207,103,4,p[6],False)
  if k in ('hockey','goalie','football'):
   self.line([(166,132),(239,132),(239,204)],p[6],3);self.line([(166,132),(166,204)],p[6],3)
   for x in range(172,238,8):self.line([(x,137),(x,201)],p[6],.5)
   for y in range(138,205,8):self.line([(168,y),(239,y)],p[6],.5)
  if k in ('hockey','goalie'):
   self.line([(80,175),(126,232),(180,232)],p[5],4);self.ellipse((176,224,191,230),p[0],False)
  elif k=='cricket':
   self.line([(166,165),(150,224)],p[3],8)
   for x in (210,216,222):self.line([(x,165),(x,214)],p[3],2)
   self.line([(207,165),(225,165)],p[3],2);self.circle(193,171,5,p[4],False)
  elif k in ('basketball','korfball'):
   self.line([(221,110),(221,241)],p[0],4)
   if k=='basketball':self.rect((198,80,251,122),p[6]);self.line([(206,109),(236,109)],p[4],2)
   self.ellipse((205,113,234,122),p[3]);
   for x in range(207,235,5):self.line([(x,119),(220+(x-220)*.5,144)],p[6],1)
   self.ball(163,98,13)
  elif k=='tennis':
   self.ellipse((174,127,213,175),p[3]);self.line([(191,170),(162,203)],p[0],3)
   for x in range(180,211,5):self.line([(x,135),(x,167)],p[1],.5)
   self.circle(211,102,5,p[3],False)
  elif k in ('runner','gymnast','martial'):
   for y in range(221,256,8):self.line([(0,y),(256,y-12)],p[3],1)
  else:self.ball(191,212,16,k in ('rugby','gridiron'))
 def animal(self,k):
  p=self.p;self.sky(True);self.hills()
  if k=='gibbon':
   self.line([(0,49),(256,32)],p[5],9);self.line([(129,163),(74,68),(72,46)],p[4],12);self.line([(139,160),(204,78),(206,43)],p[4],12);self.ellipse((107,126,164,202),p[5]);self.circle(132,110,27,p[4]);self.ellipse((116,109,148,130),p[3]);
   self.line([(119,184),(98,229)],p[5],10);self.line([(149,185),(175,231)],p[5],10)
  elif k in ('bear','pig','mouse','cat'):
   self.ellipse((80,135,185,230),p[4]);self.circle(128,107,47,p[3]);
   for x in (92,166):
    if k=='cat':self.poly([(x-23,85),(x-8,44),(x+16,89)],p[4])
    else:self.circle(x,73,19 if k!='mouse' else 29,p[4])
   self.ellipse((110,110,149,139),p[4]);self.circle(127,116,6,p[0],False)
   for x in (110,147):self.circle(x,97,3,p[0],False)
   if k=='pig':self.ellipse((110,112,149,137),p[5]);self.circle(121,124,3,p[0],False);self.circle(138,124,3,p[0],False)
   if k in ('mouse','cat'):
    for y in (122,130):self.line([(104,y),(69,y-7)],p[6],.6);self.line([(150,y),(184,y-7)],p[6],.6)
   if k=='bear':self.ellipse((178,195,221,237),p[3]);self.rect((182,185,217,199),p[5]);self.mic(45,164,.65)
  elif k in ('bird','birds'):
   for i in range(3 if k=='birds' else 1):
    x=65+i*66 if k=='birds' else 127;y=164+i*7
    self.ellipse((x-35,y-17,x+35,y+29),p[6 if i==0 else 7 if i==1 else 4] if self.n==149 else p[5]);self.circle(x+24,y-30,18,p[7 if i==1 else 4]);self.poly([(x+36,y-34),(x+61,y-24),(x+35,y-20)],p[3]);
    if self.n==149:
     self.ellipse((x-7,y-51,x+54,y-44),p[2 if i==0 else 3]);self.rect((x+9,y-64,x+39,y-46),p[2 if i==0 else 3])
    self.poly([(x-20,y+8),(x-61,y-24),(x-50,y+21)],p[1]);self.line([(x-10,y+26),(x-12,237)],p[3],2);self.line([(x+11,y+27),(x+15,237)],p[3],2)
  elif k=='dinosaur':
   self.poly([(17,178),(79,165),(117,132),(159,136),(176,119),(176,88),(193,87),(205,103),(216,115),(197,122),(193,150),(164,181),(134,192),(98,185)],p[4]);self.poly([(176,92),(181,68),(190,87)],p[3]);
   self.line([(137,170),(114,145),(86,151)],p[5],6);self.line([(163,177),(147,218),(171,239)],p[5],10);self.line([(132,181),(111,219),(85,236)],p[4],9);self.circle(190,99,3,p[0],False)
 def machine(self,k):
  p=self.p;self.rect((0,0,256,256),p[0]);
  for y in range(10,256,17):self.line([(0,y),(256,y)],p[1],.6)
  if k in ('chip','software','internet','game'):
   self.rect((45,53,211,188),p[2]);self.rect((56,64,200,169),p[0]);
   if k=='chip':
    self.rect((94,94,166,145),p[4]);
    for i in range(9):self.line([(86,94+i*6),(65,94+i*6)],p[3],2);self.line([(176,94+i*6),(198,94+i*6)],p[3],2)
   else:
    for i in range(8):self.rect((63+i%4*33,77+i//4*40,87+i%4*33,102+i//4*40),p[(i%5)+2])
   self.poly([(100,189),(155,189),(170,213),(86,213)],p[5]);self.rect((43,219,216,237),p[2]);
   for i in range(20):self.line([(50+i*8,222),(50+i*8,233)],p[0],1)
  elif k=='meter':
   self.poly([(63,58),(167,43),(195,212),(92,226)],p[2]);self.poly([(83,82),(150,73),(157,126),(90,136)],p[0]);
   for x in range(102,142,9):self.line([(x,97),(x+1,116)],p[3],3)
   self.circle(133,167,15,p[5]);self.rect((142,199,155,251),p[3]);self.poly([(199,73),(178,107),(181,120),(205,122),(215,105)],p[4])
  elif k=='generator':
   self.circle(129,84,60,p[2]);self.ellipse((90,40,144,76),p[6]);self.rect((110,138,148,222),p[3]);self.rect((66,222,193,243),p[5]);
   for j in range(5):self.line([(182,84),(211,68+j*5),(201,48+j*5),(236,25+j*5)],p[6],.8)
  elif k=='phone':
   self.rect((85,35,174,216),p[5]);self.rect((93,49,165,195),p[2]);
   for y in range(63,177,24):self.rect((105,y,153,y+12),p[3]);self.line([(109,y+4),(145,y+4)],p[5],1)
   self.circle(129,206,4,p[3]);self.line([(0,252),(87,199)],p[4],5);self.line([(256,252),(166,193)],p[4],5)
  elif k=='gauge':
   self.ellipse((89,47,172,74),p[6]);self.rect((95,64,167,232),p[2]);self.rect((98,153,164,231),p[1]);
   for y in range(87,223,13):self.line([(146,y),(164,y)],p[3],1)
   for _ in range(40):x=self.r.randrange(256);y=self.r.randrange(40);self.line([(x,y),(x-9,y+20)],p[2],1)
 def architecture(self,k):
  p=self.p
  if k in ('church','synagogue','shrine'):return self.church(k=='synagogue',k=='shrine')
  self.sky();self.hills(k in ('sailhotel','tower','resort'))
  if k in ('tower','sailhotel'):
   if k=='sailhotel':
    self.poly([(97,234),(120,39),(177,83),(199,139),(206,205),(192,234)],p[6]);self.poly([(120,39),(177,83),(190,153),(162,215),(110,234)],p[2]);self.ellipse((155,76,222,91),p[3]);self.line([(179,89),(190,137)],p[5],3)
   else:
    self.poly([(83,236),(97,33),(147,33),(168,236)],p[2]);
    for y in range(48,224,8):self.line([(99-(y-48)/20,y),(147+(y-48)/10,y)],p[6],.5)
    for x in range(107,145,9):self.line([(x,38),(x+3,234)],p[1],1)
  elif k in ('cloister','hall','palace','university','law','council'):
   self.rect((22,99,234,226),p[3]);self.poly([(11,99),(128,47),(246,99)],p[4]);
   for x in range(35,221,33):
    self.ellipse((x,126,x+23,159),p[1]);self.rect((x,146,x+23,202),p[1]);self.rect((x-4,115,x,218),p[6])
   self.line([(18,113),(240,113)],p[5],2);self.rect((10,222,246,232),p[2]);self.rect((3,234,253,244),p[3])
  elif k=='fort':
   self.rect((21,112,235,215),p[3]);
   for x in range(21,235,17):self.rect((x,98,x+10,112),p[3])
   for x in (30,191):self.rect((x,73,x+35,221),p[4]);
   self.ellipse((105,153,152,194),p[0]);self.rect((105,179,152,217),p[0]);
   for y in range(123,212,12):self.line([(26,y),(230,y)],p[5],.6)
  elif k=='stadium':
   self.ellipse((-25,82,281,240),p[3]);self.ellipse((-6,104,264,237),p[5]);self.ellipse((32,140,223,234),p[7]);
   for y in range(104,142,5):self.line([(20,y),(236,y)],p[2],1)
   self.poly([(59,176),(179,167),(207,213),(69,223)],p[7]);self.line([(59,176),(179,167),(207,213),(69,223),(59,176)],p[6],1)
  elif k=='resort':
   self.house(71,203,110,43);self.rect((0,221,256,256),p[2]);
   for x in (28,217):
    self.line([(x,236),(x+9,106)],p[5],5)
    for dx in (-57,-27,23,55):self.line([(x+9,108),(x+dx,94),(x+dx*1.1,135)],p[7],5)
  elif k=='bridge':
   self.rect((0,182,256,256),p[2]);self.line([(0,157),(256,157)],p[5],6)
   for x in (53,183):self.line([(x,157),(x,215)],p[3],11);self.line([(x,157),(x,71)],p[3],6)
   self.line([(0,151),(53,77),(114,149),(183,77),(256,151)],p[3],3)
  elif k=='factory':
   self.house(35,227,162,57)
   for x in (67,136,184):self.rect((x,73,x+13,177),p[5]);
   for i in range(9):self.circle(80+i*13,63-i*4,12+i,p[2])
  elif k=='mine':
   self.poly([(0,227),(49,172),(102,147),(188,171),(256,225),(256,256),(0,256)],p[5]);self.ellipse((67,138,170,222),p[0]);
   for x in (70,162):self.line([(x,158),(x,239)],p[4],8)
   self.line([(67,159),(171,159)],p[4],9);self.line([(105,216),(74,256)],p[2],3);self.line([(141,216),(165,256)],p[2],3)
  else:self.village(True)
 def science(self,k):
  p=self.p;self.sky(True)
  if k in ('planet','star'):
   self.circle(128,136,74,p[2]);self.ellipse((87,84,135,181),p[7]);self.ellipse((126,99,189,164),p[1]);
   if k=='planet':
    self.line([(22,168),(62,133),(173,96),(231,110),(219,138),(100,180),(22,168)],p[3],7)
   else:
    self.poly([(128,62),(201,136),(128,210)],p[5]);self.circle(143,138,33,p[3]);
    for _ in range(30):self.circle(self.r.randrange(128,167),self.r.randrange(109,164),2,p[4],False)
  elif k=='magnet':
   self.line([(62,155),(62,195),(195,195),(195,155)],p[4],19);self.rect((50,146,72,166),p[2]);self.rect((185,146,206,166),p[3]);
   for i in range(8):self.line([(61,150),(32+i*5,109-i*7),(129,63-i*4),(221-i*5,109-i*7),(195,150)],p[3],.7)
   self.ellipse((106,92,152,189),p[6],False)
  elif k=='dna':
   for i in range(30):
    y=22+i*7;x=128+math.sin(i/4)*49;X=128-math.sin(i/4)*49
    self.line([(x,y),(X,y)],p[3],2);self.circle(x,y,3,p[4],False);self.circle(X,y,3,p[2],False)
  elif k=='cell':
   self.ellipse((39,49,210,223),p[2]);self.ellipse((68,76,173,209),p[7]);self.ellipse((86,108,136,148),p[4]);self.circle(147,152,9,p[5]);
   for i in range(60):
    a=i*math.tau/60;self.line([(125+85*math.cos(a),136+87*math.sin(a)),(125+95*math.cos(a),136+97*math.sin(a))],p[3],1)
   for _ in range(16):self.circle(self.r.randrange(82,163),self.r.randrange(92,189),3,p[3])
  elif k=='bone':
   for x,y in [(76,52),(167,207)]:
    self.circle(x-10,y,15,p[6]);self.circle(x+10,y,15,p[6])
   self.poly([(74,57),(89,48),(127,117),(115,132)],p[3]);self.poly([(136,128),(153,116),(178,202),(158,216)],p[3]);self.line([(119,119),(127,111),(128,129)],p[4],2)
  elif k=='microscope':
   self.line([(74,220),(177,220)],p[3],13);self.line([(169,217),(179,143),(132,86)],p[2],17);self.line([(139,69),(107,106)],p[3],20);self.line([(109,107),(94,126)],p[4],10);self.line([(74,166),(154,166)],p[3],6);self.circle(174,145,12,p[5]);
   self.circle(62,67,35,p[7]);
   for _ in range(12):self.ellipse((self.r.randrange(38,77),self.r.randrange(46,82),self.r.randrange(79,91),self.r.randrange(83,97)),p[2])
  elif k=='diagram':
   for i in range(7):
    a=i*math.tau/7;x=128+83*math.cos(a);y=129+83*math.sin(a)
    for j in range(i):b=j*math.tau/7;self.line([(x,y),(128+83*math.cos(b),129+83*math.sin(b))],p[2],.7)
    self.circle(x,y,14,p[3 if i%2 else 4]);self.circle(x,y,5,p[0],False)
 def objects(self,k):
  p=self.p;self.rect((0,0,256,256),p[0]);self.circle(193,65,103,p[1]);self.rect((0,213,256,256),p[5])
  if k=='record':
   self.circle(128,137,93,p[0]);
   for r in range(30,92,4):self.d.ellipse(self.coords((128-r,137-r,128+r,137+r)),outline=rgb(p[1]),width=self.s)
   self.circle(128,137,27,p[4]);self.circle(128,137,4,p[3],False);self.line([(33,67),(41,174)],p[2],1)
  elif k=='trophy':
   self.poly([(87,65),(172,65),(158,135),(139,154),(137,207),(162,221),(162,235),(93,235),(93,221),(116,207),(116,154),(99,135)],p[3]);
   self.line([(88,77),(58,72),(61,115),(99,135)],p[4],7);self.line([(171,77),(204,72),(201,115),(159,135)],p[4],7)
  elif k=='crown':
   self.poly([(49,152),(37,97),(81,122),(126,61),(164,120),(218,92),(206,159)],p[3]);self.rect((48,150,207,177),p[4]);
   for x in range(66,207,31):self.circle(x,159,6,p[2]);
   self.ellipse((43,183,215,230),p[5]);self.ellipse((56,189,207,215),p[4])
  elif k=='radio':
   self.rect((35,90,224,217),p[4]);self.rect((48,102,162,200),p[0]);
   for y in range(110,198,6):self.line([(53,y),(153,y)],p[3],.7)
   for x in (183,211):self.circle(x,179,11,p[3]);self.rect((173,112,217,140),p[2]);
   self.line([(186,89),(211,28)],p[3],2)
  elif k=='burger':
   self.ellipse((26,179,232,230),p[6]);self.ellipse((44,77,214,165),p[3]);self.rect((44,120,214,167),p[4]);self.ellipse((44,156,214,209),p[3]);
   self.poly([(35,155),(55,142),(70,151),(84,138),(101,146),(121,140),(147,151),(161,137),(184,152),(207,141),(224,157),(210,177),(46,177)],p[7]);self.ellipse((45,168,215,190),p[4]);
   for _ in range(30):x=self.r.randrange(67,193);y=self.r.randrange(102,137);self.line([(x,y),(x+3,y-1)],p[6],1)
  elif k=='bowl':
   self.ellipse((38,117,220,165),p[3]);self.ellipse((49,126,209,155),p[0]);self.poly([(40,144),(219,144),(194,210),(172,227),(83,227),(59,211)],p[4]);
   for i in range(4):self.line([(57,169+i*10),(200,169+i*10)],p[3],1.3)
  elif k=='rock':
   self.poly([(48,166),(67,103),(119,68),(187,93),(224,155),(206,208),(146,231),(79,213)],p[3]);
   for _ in range(170):x=self.r.randrange(75,199);y=self.r.randrange(101,198);self.circle(x,y,1+self.r.random()*3,p[5]);self.circle(x,y,.8,p[6],False)
  elif k=='flag':
   self.line([(51,41),(51,243)],p[3],3);self.poly([(55,43),(131,63),(211,44),(211,150),(137,169),(55,149)],p[7]);self.poly([(131,63),(211,44),(211,150),(137,169)],p[3]);self.ellipse((99,77,161,143),p[4]);self.poly([(110,91),(150,91),(150,117),(131,133),(110,117)],p[2])
  elif k=='textile':
   for i in range(9):self.line([(28+i*24,34),(35+i*24,224)],p[3 if i%2 else 4],8)
   for i in range(14):self.line([(22,54+i*12),(238,63+i*12)],p[7 if i%2 else 2],4)
  elif k=='fashion':
   self.circle(127,54,16,p[3]);self.poly([(107,76),(147,76),(168,126),(145,139),(160,213),(97,213),(110,139),(86,126)],p[2]);self.poly([(110,129),(145,129),(183,229),(75,229)],p[4]);
   for x in range(104,149,10):self.line([(x,139),(128+(x-128)*2.2,221)],p[3],1)
   self.line([(118,72),(100,53)],p[5],2);self.line([(138,72),(155,53)],p[5],2)
 def map(self):
  p=self.p;self.rect((0,0,256,256),p[3]);
  for i in range(9):
   x=30+i%3*73;y=27+i//3*73
   self.poly([(x-21,y+10),(x+9,y-15),(x+43,y+7),(x+51,y+42),(x+19,y+61),(x-13,y+49)],p[1+i%4]);
  self.line([(9,178),(55,151),(78,98),(139,143),(182,111),(244,40)],p[6],3)
  for x,y in [(55,151),(139,143),(182,111)]:self.circle(x,y,8,p[4]);self.circle(x,y,3,p[6],False)
 def plane(self):
  p=self.p;self.sky();self.poly([(26,169),(105,124),(202,100),(232,109),(213,121),(127,147),(65,190)],p[2]);self.poly([(101,140),(75,60),(105,63),(153,127)],p[3]);self.poly([(137,139),(169,211),(193,205),(171,127)],p[3]);
  self.poly([(57,174),(26,114),(45,110),(81,154)],p[4]);
  for x,y in [(109,108),(158,157)]:self.ellipse((x-14,y-8,x+15,y+14),p[5]);self.line([(x,y-24),(x,y+26)],p[0],2)
  for x in range(150,215,11):self.circle(x,119-(x-150)*.17,2,p[0],False)
 def special(self,k):
  p=self.p
  if k=='casting':
   self.rect((0,0,256,256),p[0]);self.rect((29,161,215,236),p[5]);self.poly([(52,182),(179,182),(164,213),(67,213)],p[0]);self.poly([(68,174),(177,174),(163,200),(77,200)],p[4]);
   self.poly([(140,31),(211,53),(197,95),(131,75)],p[2]);self.line([(140,76),(124,131),(128,181)],p[3],9)
   for i in range(12):x=self.r.randrange(69,178);self.line([(128,179),(x,148+self.r.randrange(36))],p[3],1)
  elif k=='bicycle':
   self.sky();self.hills();
   for x in (64,188):self.circle(x,195,43,p[0]);self.circle(x,195,39,p[2]);
   self.line([(64,195),(105,140),(141,194),(64,195),(171,147),(188,195)],p[3],3);self.person(129,164,85,'run');self.line([(168,140),(193,137)],p[5],3)
  elif k=='swimmer':
   self.sky();self.rect((0,109,256,256),p[2]);self.ellipse((73,146,179,185),p[1]);self.circle(169,138,16,p[4]);self.line([(118,159),(79,118),(30,153)],p[4],8);self.line([(124,167),(183,182),(225,172)],p[4],7)
   for y in range(194,256,13):self.line([(0,y),(256,y)],p[3],1)
  elif k=='kite':
   self.sky();self.rect((0,143,256,256),p[2]);self.poly([(51,52),(85,25),(156,34),(197,69),(145,63),(98,50)],p[4]);self.line([(54,54),(123,191),(190,70)],p[6],.6);self.person(123,210,59,'run');self.line([(67,222),(190,222)],p[3],4)
  elif k=='relief':
   self.rect((0,0,256,256),p[4]);self.circle(209,34,24,p[3]);
   for i,x in enumerate((79,157,206)):self.person(x,226,135 if i==0 else 77,dress=True)
   self.poly([(68,90),(58,28),(92,18),(102,92)],p[2]);
   for x in range(193,238,8):self.line([(208,36),(x,154)],p[3],1)
  elif k=='speech':
   self.rect((0,0,256,256),p[1]);self.poly([(97,27),(162,24),(192,66),(184,114),(202,141),(177,153),(181,196),(164,227),(87,227),(64,174),(66,94)],p[4]);self.ellipse((137,146,189,187),p[0]);self.line([(143,151),(176,153)],p[6],4);self.poly([(146,171),(176,163),(189,179),(155,182)],p[3]);
   for x in (210,223,238):self.line([(x,137),(x+3,170),(x,201)],p[2],1.2)
  elif k=='comics':
   self.rect((0,0,256,256),p[0]);
   for i in range(12):
    x=15+i%4*60;y=10+i//4*80;self.rect((x,y,x+47,y+65),p[2+i%4]);self.circle(x+23,y+22,13,p[3]);self.poly([(x+23,y+33),(x+7,y+56),(x+38,y+57)],p[5])
  elif k=='rats':
   self.village(True);self.person(151,216,119);self.line([(169,158),(202,113)],p[3],2)
   for i in range(7):
    x=20+i*33;y=242-(i%2)*12;self.ellipse((x,y-9,x+22,y),p[5]);self.circle(x+17,y-10,4,p[4]);self.line([(x,y-3),(x-10,y+3),(x-16,y-2)],p[3],1)
  elif k=='fantasy':
   self.village(True);self.circle(133,104,50,p[2]);self.circle(133,104,39,p[0]);
   for i in range(12):a=i*math.tau/12;self.poly([(133+43*math.cos(a),104+43*math.sin(a)),(133+59*math.cos(a+.05),104+59*math.sin(a+.05)),(133+43*math.cos(a+.13),104+43*math.sin(a+.13))],p[3])
  elif k=='knight':
   self.mountain();self.person(123,229,151);self.poly([(86,107),(98,61),(139,61),(157,108)],p[2]);self.line([(95,98),(146,98)],p[0],5);self.poly([(50,147),(88,142),(88,202),(69,221),(50,202)],p[3]);self.line([(176,212),(177,73)],p[6],4);self.line([(165,161),(191,161)],p[3],3)
  elif k=='dance':
   self.sky();self.hills();
   for i,x in enumerate((42,100,158,216)):self.person(x,232,91,dress=i%2==0);self.line([(x-22,184),(x+35,184)],p[3],3)
  elif k=='piper':
   self.village();self.person(137,228,116);self.line([(130,157),(195,157)],p[3],3)
   for x in range(10,250,27):self.ellipse((x,237,x+20,245),p[5]);self.line([(x,242),(x-6,248)],p[3],1)
  elif k=='cargo':
   self.sky();self.rect((0,187,256,256),p[1]);
   for i in range(9):x=20+i%3*72;y=147+i//3*32;self.rect((x,y,x+63,y+29),p[4 if i%2 else 3]);self.line([(x,y),(x+63,y+29)],p[5],1);self.line([(x,y+29),(x+63,y)],p[5],1)
  else:raise ValueError(('Unsupported composition',self.n,k))
 def compose(self,k):
  if k in ('village','city','house','street'):self.village(k in ('city','street'),self.n%4==0)
  elif k in ('river','forest','farmer','explorer'):
   self.sky();self.hills(k=='river');
   for x in range(7,255,38):self.tree(x,200+(x%5)*8,47+x%25)
   if k in ('farmer','explorer'):self.person(143,245,91);self.line([(164,214),(170,249)],self.p[3],2)
   if k=='farmer':
    for x in range(0,256,15):self.line([(128,163),(x,256)],self.p[3],1)
  elif k=='blackout':self.village(True);self.im=Image.blend(self.im,Image.new('RGB',self.im.size,rgb(self.p[0])),.65);self.d=ImageDraw.Draw(self.im)
  elif k in ('flowers','botanical','berries'):self.plant(k=='berries')
  elif k in ('stage','theatre','comedian'):self.stage(1 if k!='theatre' else 2)
  elif k in ('cinema','tv'):
   self.stage(2 if self.n in (84,110,224) else 1);self.camera(24,144,.7) if k=='cinema' else self.rect((16,16,240,238),self.p[0],False)
   if k=='tv':
    self.rect((28,28,228,215),self.p[2]);self.person(130,202,128);self.line([(91,18),(72,3)],self.p[3],2);self.line([(148,18),(171,3)],self.p[3],2)
  elif k in ('singer','guitar','music','violin','piano','organ','vibraphone','orchestra','choir','drums'):
   self.music(k)
   if k in ('choir','orchestra'):
    for x in (50,99,158,211):self.person(x,242,50)
  elif k in ('football','hockey','goalie','rugby','gridiron','cricket','basketball','korfball','tennis','volleyball','runner','gymnast','martial','baseball'):self.sports(k)
  elif k in ('books','philosopher','economist','newspaper'):self.portraitdesk()
  elif k in ('community','veteran','soldier','sailor','coastguard','cowboy','bishop'):
   self.stage(3 if k=='community' else 1)
   if k=='bishop':self.poly([(113,112),(108,42),(128,18),(149,42),(144,112)],self.p[3]);self.line([(184,76),(184,243)],self.p[3],3);self.ellipse((170,54,198,82),self.p[3],False)
   if k in ('veteran','soldier','sailor','coastguard','cowboy'):self.ellipse((91,102,165,113),self.p[3]);self.rect((111,80,145,104),self.p[2])
  elif k in ('frog','newt'):self.frog(k=='newt')
  elif k in ('gibbon','bear','pig','mouse','bird','birds','dinosaur','cat'):self.animal(k)
  elif k in ('mountain',):self.mountain()
  elif k=='horse':self.horse(self.n==21)
  elif k=='ship':self.ship()
  elif k in ('train','metro','bus'):self.train(k=='bus')
  elif k in ('car','racecar'):self.car(k=='racecar')
  elif k in ('church','synagogue','shrine','tower','sailhotel','cloister','hall','palace','university','law','council','fort','stadium','resort','bridge','factory','mine','architecture'):self.architecture(k)
  elif k=='school':self.school()
  elif k=='classroom':self.classroom()
  elif k in ('planet','star','magnet','dna','cell','bone','microscope','diagram'):self.science(k)
  elif k in ('chip','software','internet','game','meter','generator','phone','gauge'):self.machine(k)
  elif k in ('record','trophy','crown','radio','burger','bowl','rock','flag','textile','fashion'):self.objects(k)
  elif k=='map':self.map()
  elif k=='plane':self.plane()
  else:self.special(k)
  if k=='record':
   self.line([(29+self.n%39,29),(41+self.n%31,145),(67+self.n%43,157)],self.p[3],2)
   self.circle(29+self.n%39,29,6,self.p[4]);self.rect((62+self.n%43,151,74+self.n%43,165),self.p[2])
  # Article-specific props distinguish related motifs and preserve the subject.
  if self.n==83:
   for x in (87,169):
    for y in range(89,139,7):self.circle(x,y,4,self.p[5])
   self.poly([(89,177),(168,177),(186,231),(79,231)],self.p[2])
  if self.n==4:
   for i in range(16):
    a=i*math.tau/16;self.circle(122+82*math.cos(a),140+82*math.sin(a),3,self.p[3],False)
   self.line([(30,220),(30,75),(74,75)],self.p[2],2)
  if self.n==17:
   for i in range(55):x=self.r.randrange(256);y=self.r.randrange(200);self.line([(x,y),(x-4,y+13)],self.p[2],.7)
  if self.n in (1,47,68,115,205,241):self.camera(18,157,.65)
  if self.n in (83,89,122,237):self.tree(231,251,90)
  if self.n in (17,91):self.line([(10,222),(245,222)],self.p[6],.8)
  if self.n in (52,74,79):
   self.circle(132,179,6,self.p[3]);self.line([(124,162),(131,181),(138,162)],self.p[4],2)
  if self.n==137:self.ball(199,205,19)
  if self.n in (38,104,142,190,224,243):self.mic(187,163,.75)
  if self.n in (36,78,107,135,148):self.book(12,226,55)
  if self.n in (16,98):self.circle(218,46,12,self.p[3]);self.circle(218,46,5,self.p[4])
  # A distinct surface treatment for the whole composition, with no lossy export.
  if self.medium==4:
   for y in range(1,256,3):
    for x in range((y%2),256,3):
     b=self.im.getpixel((x*self.s,y*self.s));self.d.line((x*self.s,y*self.s,(x+1)*self.s,(y+1)*self.s),fill=mix(b,self.p[0],.15),width=1)
  return self.im

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--tiles',nargs='*',type=int);parser.add_argument('--reuse-existing',action='store_true');args=parser.parse_args()
 subjects=json.loads((ROOT/'tools/wiki-pixel-grid/subjects.json').read_text());queue_path=ROOT/'research/wiki-pixel-grid/queue.json';queue=json.loads(queue_path.read_text())['articles'] if queue_path.exists() else [dict(articleId=s['articleId'],revision=s['revision'],title=s['article']) for s in subjects]
 manifest=json.loads((OUT/'manifest.json').read_text());MASTERS.mkdir(parents=True,exist_ok=True);(OUT/'thumbs').mkdir(exist_ok=True)
 for spec in subjects:
  n=spec['id']
  if args.tiles and n not in args.tiles:continue
  art=Art(n);existing=MASTERS/f'{n:03d}.png';image=Image.open(existing).convert('RGB') if args.reuse_existing and existing.exists() else art.compose(spec['kind']);article=queue[n-1]
  image.save(MASTERS/f'{n:03d}.png');image.save(OUT/f'{n:03d}.webp',lossless=True,method=6)
  sampling=Image.Resampling.NEAREST if n<=50 else Image.Resampling.LANCZOS
  image.resize((256,256),sampling).save(OUT/'thumbs'/f'{n:03d}.webp',lossless=True,method=6)
  tile=dict(spec);tile.update(articleId=article['articleId'],revision=article['revision'],source='https://simple.wikipedia.org/w/index.php?oldid='+article['revision'],articleUrl='https://simple.wikipedia.org/wiki/'+quote(article['title'].replace(' ','_')),medium=MEDIA[(n-1)//50],image=f'assets/wiki-pixel-grid/{n:03d}.webp',thumbnail=f'assets/wiki-pixel-grid/thumbs/{n:03d}.webp',masterWidth=image.width,masterHeight=image.height,creation='LLM-written drawing code rendered with Pillow. No image-generation model.',drawingSource='tools/wiki-pixel-grid/draw-art.py',drawingSeed=n*7867,interpretation='Symbolic artistic interpretation of the stated subject. Places and people are not documentary reconstructions or exact likenesses.',sha256=hashlib.sha256(image.tobytes()).hexdigest())
  manifest['tiles'][n-1]=tile
  print(f'{n:03d} {spec["article"]}: {spec["kind"]}',flush=True)
 atlas=Image.new('RGB',(25*64,10*64),(48,57,49))
 for i,tile in enumerate(manifest['tiles']):
  if not tile.get('image'):continue
  im=Image.open(ROOT/tile['image']);sampling=Image.Resampling.NEAREST if tile['medium']=='pixel art' else Image.Resampling.LANCZOS
  atlas.paste(im.resize((64,64),sampling),(i%25*64,i//25*64));tile['preview']=[i%25*64,i//25*64,64,64]
 atlas.save(OUT/'overview.webp',lossless=True,method=6);manifest['assetVersion']='code-v1';manifest['creationPolicy']='LLM-written code and ordinary rendering tools only. No image-generation models.'
 manifest['media']=[dict(start=1+i*50,end=50+i*50,medium=m) for i,m in enumerate(MEDIA)]
 (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()
