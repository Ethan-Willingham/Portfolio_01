"""Repackage the site's existing WOFF font as a native Unity SFNT font."""
from pathlib import Path
import struct
import zlib

root=Path(__file__).resolve().parents[2]
data=(root/'assets/fonts/segoe_ui_regular.woff').read_bytes()
assert data[:4]==b'wOFF'
flavor=data[4:8]
n=struct.unpack_from('>H',data,12)[0]
power=2**(n.bit_length()-1)
header=flavor+struct.pack('>HHHH',n,power*16,power.bit_length()-1,n*16-power*16)
directory=bytearray()
body=bytearray()
head_offset=None
offset=12+n*16
for i in range(n):
    tag,src,packed,length,checksum=struct.unpack_from('>4sIIII',data,44+i*20)
    chunk=bytearray(data[src:src+packed])
    if packed<length: chunk=bytearray(zlib.decompress(chunk))
    assert len(chunk)==length
    if tag==b'head':
        chunk[8:12]=b'\0'*4
        head_offset=offset
    directory+=struct.pack('>4sIII',tag,checksum,offset,length)
    body+=chunk+b'\0'*((-length)%4)
    offset=12+n*16+len(body)
result=bytearray(header+directory+body)
checksum=sum(struct.unpack('>'+str(len(result)//4)+'I',result))&0xffffffff
struct.pack_into('>I',result,head_offset+8,(0xB1B0AFBA-checksum)&0xffffffff)
out=root/'unity/OneShiftRackLab/Assets/Resources/RackLabFont.ttf'
out.parent.mkdir(parents=True,exist_ok=True)
out.write_bytes(result)
print(out)

# A small readable shelf-location sticker, shared by every cosmetic variant.
from PIL import Image, ImageDraw, ImageFont
image=Image.new('RGB',(256,64),'white')
draw=ImageDraw.Draw(image)
font=ImageFont.truetype(str(out),32)
draw.text((10,0),'A01-01',font=font,fill=(24,28,25))
bars='10110010101101100100111010010110011010100101'
for i,bar in enumerate(bars):
    if bar=='1': draw.rectangle((11+i*5,43,13+i*5,57),fill=(24,28,25))
texture=root/'unity/OneShiftRackLab/Assets/RackLab/Textures/rack-location-label.png'
texture.parent.mkdir(parents=True,exist_ok=True)
image.save(texture)
