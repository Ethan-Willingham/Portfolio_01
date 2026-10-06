#!/usr/bin/env python3
"""Three fresh, uniformly random offline articles, individually painted studies.

Uses only numpy/Pillow and an LLM-authored raster brush. No generated image,
traced photograph, downloaded artwork or image-model service is involved.
Places and the portrait are artistic interpretations, not factual reconstructions.
"""
import importlib.util, math, random, json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('brush',Path(__file__).with_name('paint-studies.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
N=b.N;x=b.x;y=b.y;OUT=b.OUT

def canvas(field):return Image.fromarray(np.uint8(np.clip(field,0,255)))
def poly(d,pts,color):d.polygon([(a*N,c*N) for a,c in pts],fill=color)
def path(d,pts,color,width=1):d.line([(a*N,c*N) for a,c in pts],fill=color,width=width,joint='curve')
def bezier(points,count=90):
 p=np.array(points)*N;t=np.linspace(0,1,count)[:,None];v=(1-t)**3*p[0]+3*(1-t)**2*t*p[1]+3*(1-t)*t*t*p[2]+t**3*p[3];return [tuple(a) for a in v]

def garden():
 rng=random.Random(584099);field=np.zeros((N,N,3));mist=b.noise(117,10)
 field[:,:,0]=139+y*15+mist*21;field[:,:,1]=157+y*8+mist*17;field[:,:,2]=134+y*9+mist*15
 # Receding hills and a sheltered pond, all explicitly related to the garden text.
 for pts,col in [([(0,.4),(.1,.21),(.28,.26),(.48,.13),(.72,.29),(1,.18),(1,.7),(0,.7)],(100,128,108)),([(0,.53),(.19,.38),(.41,.43),(.65,.29),(.82,.35),(1,.31),(1,.71),(0,.71)],(75,103,84))]:b.blend(field,col,b.polygon(pts))
 pond=y>.52
 f=np.stack([102-44*y+mist*11,141-39*y+mist*16,131-29*y+mist*14],axis=2)
 f+=np.sin(y*570+x*17)[:,:,None]*3;field[pond]=f[pond]
 reflection=np.exp(-((x-.57)/.20)**2)*np.clip((.93-y)*2,0,1)*(y>.53)*(.2+.5*np.maximum(0,np.sin(y*880)))
 b.blend(field,[173,163,116],reflection*.45)
 im=canvas(field);d=ImageDraw.Draw(im)
 # An imagined classical pavilion. The article mentions houses, hills and ponds,
 # but does not document this exact building or layout.
 poly(d,[(.43,.36),(.735,.36),(.735,.533),(.43,.526)],(177,173,145))
 poly(d,[(.40,.375),(.50,.292),(.62,.315),(.73,.33),(.80,.383),(.75,.391),(.46,.389)],(39,66,58))
 poly(d,[(.413,.37),(.50,.296),(.66,.324),(.786,.378),(.68,.374)],(70,90,71))
 for j in range(33):u=.427+j*.0103;path(d,[(u,.369),(u+.012,.384)],(102,113,88),1)
 poly(d,[(.46,.397),(.718,.403),(.718,.516),(.46,.509)],(39,59,46))
 for j in range(6):
  u=.461+j*.048;poly(d,[(u,.393),(u+.009,.394),(u+.009,.527),(u,.526)],(152,151,114))
 path(d,[(.432,.529),(.745,.536)],(185,175,136),5)
 # Curved garden wall and irregular banks.
 poly(d,[(0,.50),(.08,.486),(.13,.47),(.31,.469),(.41,.511),(.41,.542),(.24,.513),(.10,.535),(0,.55)],(188,184,153))
 path(d,[(0,.498),(.11,.476),(.30,.461),(.405,.509)],(83,94,75),5)
 poly(d,[(0,.60),(.19,.59),(.25,.68),(.225,.82),(.30,1),(0,1)],(45,70,47))
 poly(d,[(0,.66),(.145,.64),(.20,.715),(.17,.832),(.25,1),(.10,1),(.092,.84),(.125,.728),(0,.716)],(147,142,108))
 for j in range(35):
  yy=.678+j*.009;xx=.15+.027*math.sin(j/7);path(d,[(xx-.045,yy),(xx+.026,yy+.014)],(95+rng.randrange(27),105+rng.randrange(17),82),rng.randrange(1,3))
 # Rocks at the waterline are separate irregular masses with lit top planes.
 for cx,cy,w,h in [(.325,.63,.11,.065),(.79,.56,.06,.035),(.91,.69,.14,.07),(.79,.87,.09,.037)]:
  poly(d,[(cx-w,cy),(cx-w*.4,cy-h),(cx+w*.3,cy-h*.8),(cx+w,cy),(cx+w*.7,cy+h*.6),(cx-w*.7,cy+h*.5)],(88,104,89))
  poly(d,[(cx-w,cy),(cx-w*.4,cy-h),(cx+w*.3,cy-h*.8),(cx+w*.65,cy-h*.1),(cx-w*.5,cy+.01)],(148,154,126))
  for _ in range(25):
   px=cx+rng.uniform(-w*.7,w*.7);py=cy+rng.uniform(-h*.3,h*.3);path(d,[(px,py),(px+.013,py-.011)],(68,88,71),1)
 # Calligraphic trees: branching paths, clustered leaves and flowers, no stamped tree icon.
 for points,col,w in [([(.06,1),(.115,.71),(.077,.39),(.16,.06)],(44,62,43),18),([(.10,.48),(.21,.34),(.34,.30),(.43,.21)],(59,75,48),7),([(.092,.47),(.034,.24),(.003,.10),(-.04,0)],(51,71,48),9),([(.94,1),(.90,.75),(.95,.40),(1.03,.13)],(32,60,43),24),([(.946,.46),(.82,.28),(.78,.10),(.68,.03)],(41,67,44),10)]:
  curve=bezier(points);d.line(curve,fill=col,width=w)
  d.line([(a-3,c-2) for a,c in curve],fill=(81,94,63),width=2)
 for cx,cy,rx,ry in [(.17,.11,.25,.11),(.31,.28,.17,.10),(.08,.26,.13,.10),(.83,.15,.23,.18),(.98,.43,.13,.14),(.34,.52,.08,.10),(.04,.91,.16,.12)]:
  for _ in range(430):
   px=rng.gauss(cx,rx*.42);py=rng.gauss(cy,ry*.42)
   if ((px-cx)/rx)**2+((py-cy)/ry)**2>1:continue
   L=rng.uniform(.004,.021);light=rng.randrange(37)
   path(d,[(px,py),(px+L,py-L*.4)],(43+light,68+light,39+int(light*.5)),rng.randrange(2,6))
 for _ in range(100):
  px=rng.uniform(.015,.115);py=rng.uniform(.75,.98);path(d,[(px,py),(px+.004,py-.008)],(175+rng.randrange(25),126+rng.randrange(23),133+rng.randrange(17)),2)
 angle=np.where(y>.55,.015,b.noise(41,19)*.7)
 return b.paint(np.asarray(im,float),angle,584099,'random-1-jichang-garden',2)

def village():
 rng=random.Random(671099);field=np.zeros((N,N,3));cloud=b.noise(72,9)
 field[:]=np.array([126,152,157])[None,None,:]+y[:,:,None]*np.array([49,30,-3])+cloud[:,:,None]*13
 for k,pts in enumerate([
  [(0,.48),(.16,.27),(.33,.325),(.55,.25),(.73,.35),(1,.25),(1,1),(0,1)],
  [(0,.6),(.12,.48),(.32,.42),(.51,.54),(.68,.39),(.83,.48),(1,.46),(1,1),(0,1)],
  [(0,.80),(.19,.64),(.34,.61),(.55,.72),(.75,.63),(1,.74),(1,1),(0,1)]
 ]):
  mask=b.polygon(pts);col=np.zeros_like(field);n=b.noise(89+k,35)
  col[:]=np.array([[98,126,107],[103,131,78],[133,142,79]][k])+n[:,:,None]*17
  field[:]=field*(1-mask[:,:,None])+col*mask[:,:,None]
 # Mosaic fields recede toward the village. Colors vary by land, not a global filter.
 for pts,col in [([(.08,.91),(.3,.72),(.46,.78),(.32,1)],(169,150,85)),([(.33,1),(.49,.77),(.64,.85),(.72,1)],(120,132,71)),([(.72,1),(.65,.84),(.86,.80),(1,.90),(1,1)],(152,145,85))]:b.blend(field,col,b.polygon(pts)*.8)
 im=canvas(field);d=ImageDraw.Draw(im)
 poly(d,[(.43,.69),(.463,.69),(.49,.77),(.41,.87),(.39,1),(.32,1),(.355,.85),(.446,.765)],(175,164,124))
 # Individually placed and oriented rooftops, not repeated at one scale.
 buildings=[(.26,.63,.052,.043),(.37,.585,.041,.055),(.44,.645,.065,.051),(.52,.618,.044,.036),(.60,.65,.058,.051),(.68,.609,.042,.053),(.33,.718,.074,.064),(.51,.74,.082,.080),(.69,.77,.083,.065),(.19,.769,.047,.048),(.81,.685,.041,.036),(.83,.833,.089,.068)]
 for i,(cx,cy,w,h) in enumerate(buildings):
  wall=(184+i%4*8,177+i%3*4,145+i%5*5);roof=(124+i%3*9,84+i%4*7,66+i%3*4)
  poly(d,[(cx-w,cy-h),(cx+w*.7,cy-h*.82),(cx+w*.7,cy),(cx-w,cy-.006)],wall)
  poly(d,[(cx+w*.7,cy-h*.82),(cx+w,cy-h),(cx+w,cy-.012),(cx+w*.7,cy)],(133,133,109))
  poly(d,[(cx-w*1.15,cy-h),(cx-w*.22,cy-h*1.52),(cx+w*1.08,cy-h*1.33),(cx+w*.78,cy-h*.82)],roof)
  poly(d,[(cx-w*.22,cy-h*1.52),(cx+w*1.08,cy-h*1.33),(cx+w*.70,cy-h*.82)],(80,76,62))
  for z in range(4):
   yy=cy-h*(1.02+z*.12);path(d,[(cx-w*.89+z*w*.12,yy),(cx+w*.2+z*w*.11,yy+.003)],(151,106,79),1)
  for row in range(2):
   for column in range(3):
    xx=cx-w*.75+column*w*.45;yy=cy-h*.74+row*h*.38;poly(d,[(xx,yy),(xx+w*.12,yy),(xx+w*.12,yy+h*.19),(xx,yy+h*.19)],(57,82,76))
 # Taller civic roof anchors the middle distance, not a claim of a named landmark.
 poly(d,[(.413,.557),(.441,.555),(.441,.64),(.413,.64)],(191,185,150))
 poly(d,[(.407,.557),(.426,.51),(.448,.555)],(86,87,71))
 for i in range(250):
  cx=rng.uniform(0,1);cy=rng.uniform(.43,.9)
  if .24<cx<.77 and .55<cy<.8:continue
  rr=.003+(cy-.40)*.019
  for j in range(8):
   px=cx+rng.gauss(0,rr*.7);py=cy+rng.gauss(0,rr)
   d.ellipse((int((px-rr)*N),int((py-rr*1.3)*N),int((px+rr)*N),int((py+rr*.4)*N)),fill=(52+rng.randrange(25),86+rng.randrange(29),48+rng.randrange(17)))
 for _ in range(1300):
  px=rng.random();py=rng.uniform(.86,1);L=rng.uniform(.002,.012);path(d,[(px,py),(px+.002,py-L)],(132+rng.randrange(46),147+rng.randrange(34),72+rng.randrange(32)),1)
 angle=np.where(y>.77,-.38,np.where(y>.40,.16,0))
 return b.paint(np.asarray(im,float),angle,671099,'random-2-laufelfingen',2)

def portrait():
 # A fictionalized civic portrait inspired by Reinfeldt's municipal role.
 # It is not a claim to reproduce her face or the decor of a real council chamber.
 field=np.zeros((N,N,3));texture=b.noise(8,14)
 light=np.exp(-((x-.66)**2+(y-.35)**2)/.25)
 field[:,:,0]=45+light*60+texture*10;field[:,:,1]=55+light*56+texture*12;field[:,:,2]=54+light*42+texture*9
 im=canvas(field);d=ImageDraw.Draw(im)
 # Receding paneling, a chair back and empty civic papers establish the subject.
 for u in [.10,.24,.78,.93]:path(d,[(u,0),(u,1)],(65,74,66),2)
 poly(d,[(.21,.46),(.41,.39),(.49,.76),(.35,.95),(.16,.90)],(56,61,55))
 poly(d,[(.22,.47),(.25,.46),(.25,.82),(.22,.84)],(109,103,80))
 # Coat silhouette is wider at the shoulders and softly folds toward the desk.
 coat=b.polygon([(.20,1),(.25,.78),(.35,.60),(.46,.55),(.55,.60),(.64,.58),(.76,.69),(.84,.92),(.83,1)])
 color=np.stack([60+light*21+texture*6,69+light*26+texture*7,84+light*28+texture*10],axis=2)
 field=np.asarray(im,float);field[:]=field*(1-coat[:,:,None])+color*coat[:,:,None]
 neck=b.polygon([(.498,.447),(.584,.444),(.598,.558),(.646,.603),(.544,.704),(.441,.572),(.51,.523)])
 nc=np.stack([157+light*46,112+light*39,92+light*34],axis=2);field[:]=field*(1-neck[:,:,None])+nc*neck[:,:,None]
 # Face contour: forehead, brow, nose, lips, chin and mandibular angle.
 face=b.polygon([(.447,.254),(.478,.193),(.542,.190),(.592,.219),(.622,.263),(.618,.314),(.630,.344),(.657,.382),(.637,.401),(.635,.415),(.644,.430),(.635,.440),(.615,.447),(.605,.467),(.574,.486),(.541,.490),(.498,.462),(.479,.418),(.457,.366)])
 illumination=np.exp(-((x-.588)**2/.009+(y-.294)**2/.041))
 cheek=np.exp(-((x-.584)**2/.003+(y-.388)**2/.006))
 underjaw=np.exp(-((x-.537)**2/.008+(y-.463)**2/.001))
 skin=np.stack([147+illumination*78+cheek*9-underjaw*25,102+illumination*73+cheek*9-underjaw*17,83+illumination*65+cheek*12-underjaw*10],axis=2)
 skin+=b.noise(64,60)[:,:,None]*3
 field[:]=field*(1-face[:,:,None])+skin*face[:,:,None]
 # Hair is a separate sculptural mass, with strokes following its flow.
 hair=b.polygon([(.319,.438),(.318,.314),(.355,.224),(.415,.162),(.494,.147),(.566,.165),(.611,.209),(.623,.260),(.600,.283),(.579,.238),(.54,.229),(.505,.26),(.477,.315),(.479,.376),(.493,.423),(.526,.5),(.486,.568),(.414,.588),(.355,.532)])
 hlight=np.exp(-((x-.408)**2/.013+(y-.295)**2/.06))
 hc=np.stack([72+hlight*77+texture*10,64+hlight*66+texture*8,50+hlight*49+texture*6],axis=2);field[:]=field*(1-hair[:,:,None])+hc*hair[:,:,None]
 im=canvas(field);d=ImageDraw.Draw(im);rng=random.Random(205609)
 # Eye and mouth remain quiet marks rather than icon-style eyes and a smile.
 d.line(bezier([(.579,.326),(.592,.314),(.609,.32),(.615,.331)],40),fill=(86,72,57),width=3)
 d.line(bezier([(.579,.340),(.593,.332),(.607,.331),(.613,.338)],40),fill=(71,63,54),width=2)
 d.line(bezier([(.602,.338),(.606,.337),(.609,.339),(.610,.342)],20),fill=(126,130,108),width=3)
 path(d,[(.612,.348),(.615,.373),(.633,.391)],(155,114,86),2)
 path(d,[(.633,.392),(.641,.392)],(91,69,54),2)
 d.line(bezier([(.606,.424),(.615,.419),(.633,.423),(.640,.429)],32),fill=(137,85,78),width=4)
 d.line(bezier([(.604,.430),(.617,.435),(.633,.436),(.64,.430)],32),fill=(170,115,101),width=3)
 path(d,[(.604,.450),(.592,.465),(.572,.476)],(217,174,143),2)
 # Ear, hair locks and a restrained earring.
 d.ellipse((int(.469*N),int(.329*N),int(.492*N),int(.390*N)),fill=(162,117,91))
 path(d,[(.482,.340),(.486,.359),(.478,.376)],(112,84,62),2)
 d.ellipse((486,398,491,405),fill=(188,175,125))
 for _ in range(260):
  a=rng.uniform(.34,.49);yy=rng.uniform(.21,.51)
  if hair[int(yy*N),int(a*N)]<.5:continue
  points=[(a,yy),(a-.014,yy+.029),(a-.004,yy+.075),(a+.035,yy+.115)]
  curve=bezier(points,25);c=(95+rng.randrange(41),83+rng.randrange(34),60+rng.randrange(22));d.line(curve,fill=c,width=rng.randrange(1,3))
 # Collar and lapel planes, with actual fold lines that follow the body.
 poly(d,[(.443,.559),(.541,.673),(.604,.566),(.642,.600),(.549,.757),(.40,.615)],(195,191,169))
 poly(d,[(.37,.621),(.434,.583),(.549,.757),(.498,.807),(.44,.719)],(87,98,114))
 poly(d,[(.641,.6),(.69,.651),(.604,.803),(.549,.757)],(100,112,124))
 d.line(bezier([(.329,.698),(.375,.752),(.34,.832),(.408,.912)]),fill=(43,54,65),width=9)
 d.line(bezier([(.704,.745),(.672,.81),(.74,.86),(.739,.948)]),fill=(38,50,60),width=7)
 # Papers, a fountain pen and a loosely resting hand: civic work, not a stage prop.
 poly(d,[(0,.94),(.30,.874),(.76,.94),(1,.916),(1,1),(0,1)],(89,87,69))
 poly(d,[(.117,.962),(.429,.925),(.674,.976),(.372,1),(.193,1)],(200,193,160))
 for j in range(7):path(d,[(.28,.953+j*.005),(.43,.941+j*.005)],(132,140,116),1)
 hand=[(.56,.891),(.60,.899),(.646,.926),(.63,.946),(.583,.941),(.561,.916),(.528,.921),(.49,.912),(.481,.899),(.50,.889)]
 poly(d,hand,(172,131,105));path(d,[(.505,.900),(.547,.897),(.582,.918),(.628,.932)],(206,164,133),3)
 for j in range(3):path(d,[(.581,.923+j*.006),(.627,.936+j*.005)],(118,95,78),1)
 path(d,[(.521,.909),(.457,.971)],(38,48,45),3)
 field=np.asarray(im,float);angle=np.full((N,N),.8);angle[face>.5]=1.2;angle[hair>.5]=1.40;angle[y>.92]=.12
 im=b.paint(field,angle,205609,'random-3-filippa-reinfeldt',1.8)
 d=ImageDraw.Draw(im)
 # Final fine brushwork comes after the broad pigment passes, as in a painting.
 for points,c,w in [
  ([ (.578,.319),(.590,.311),(.606,.315),(.615,.322)],(113,87,66),4),
  ([ (.580,.337),(.594,.330),(.606,.332),(.614,.338)],(72,64,54),3),
  ([ (.582,.341),(.596,.343),(.606,.342),(.613,.338)],(165,135,110),2),
  ([ (.613,.347),(.612,.362),(.624,.382),(.635,.388)],(166,119,92),2),
  ([ (.630,.396),(.635,.393),(.641,.394),(.644,.396)],(102,73,56),3),
  ([ (.608,.425),(.619,.421),(.633,.425),(.638,.430)],(142,85,79),4),
  ([ (.606,.431),(.617,.435),(.633,.434),(.638,.430)],(177,119,103),3),
  ([ (.597,.448),(.587,.467),(.569,.476),(.548,.478)],(211,168,134),2),
  ([ (.477,.340),(.489,.347),(.485,.369),(.477,.376)],(128,93,68),3)
 ]:d.line(bezier(points,40),fill=c,width=w)
 d.ellipse((612,342,617,349),fill=(101,112,97))
 d.line([(609,345),(611,341)],fill=(191,176,149),width=1)
 for _ in range(90):
  a=rng.uniform(.36,.46);yy=rng.uniform(.22,.51)
  if hair[int(yy*N),int(a*N)]<.5:continue
  d.line(bezier([(a,yy),(a-.008,yy+.027),(a+.01,yy+.056),(a+.02,yy+.08)],20),fill=(118+rng.randrange(28),101+rng.randrange(25),72+rng.randrange(22)),width=1)
 im.save(OUT/'random-3-filippa-reinfeldt.png');im.save(OUT/'random-3-filippa-reinfeldt.webp',lossless=True,method=6)
 return im

if __name__=='__main__':
 ims=[garden(),village(),portrait()]
 contact=Image.new('RGB',(1536,512))
 for i,im in enumerate(ims):contact.paste(im.resize((512,512),Image.Resampling.LANCZOS),(i*512,0))
 contact.save(OUT/'random-three.png')
 records=OUT/'random-articles.json'
 articles=json.loads(records.read_text()) if records.exists() else [dict(title=a['article'],id=a['articleId'],revision=a['revision']) for a in json.loads((ROOT/'assets/wiki-pixel-grid/studies/provenance.json').read_text())]
 (OUT/'random-three-provenance.json').write_text(json.dumps([dict(article=a['title'],articleId=a['id'],revision=a['revision'],source='https://simple.wikipedia.org/w/index.php?oldid='+a['revision'],method='LLM-written composition and raster brush strokes, rendered with numpy and Pillow; no image-generation model',interpretation='Artistic interpretation, not a documentary layout or exact portrait likeness') for a in articles],ensure_ascii=False,indent=2)+'\n')
