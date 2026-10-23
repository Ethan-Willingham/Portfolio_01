"""Pack existing roughness maps into URP's metallic/smoothness channels."""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
source = ROOT / 'assets/one-shift/models/pallets/textures'
target = ROOT / 'unity/OneShiftRackLab/Assets/RackLab/Textures/Pallets'
for roughness in source.glob('*_Roughness.png'):
    rough = Image.open(roughness).convert('L')
    zero = Image.new('L', rough.size, 0)
    Image.merge('RGBA', (zero, zero, zero, ImageOps.invert(rough))).save(
        target / roughness.name.replace('_Roughness', '_MetallicSmoothness'))
