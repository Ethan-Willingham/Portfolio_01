"""Make the small fictional stock label used by the loaded pallet material."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root=Path(__file__).resolve().parents[2]
font=root/'unity/OneShiftRackLab/Assets/Resources/RackLabFont.ttf'
out=root/'unity/OneShiftRackLab/Assets/RackLab/Textures/pallet-load-label.png'
image=Image.new('RGB',(512,320),(240,236,222))
draw=ImageDraw.Draw(image)
draw.rectangle((8,8,503,311),outline=(35,39,34),width=3)
for text,y,size in [('BRACKEN SUPPLY',20,40),('CARTON STOCK / 24 CASES',76,26),
                    ('LOT 026-104   /   A01',118,25),('001 040 048 024',275,22)]:
    draw.text((25,y),text,font=ImageFont.truetype(str(font),size),fill=(25,30,25))
for i,bar in enumerate('10110100110101100100111001011011010011010100110110100100110110010100110110100100110100110'):
    if bar=='1': draw.rectangle((25+i*5,176,27+i*5,261),fill=(25,30,25))
image.save(out)
print(out)
