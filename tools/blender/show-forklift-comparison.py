"""Put both original forklift studies in a ready-framed Blender comparison.

Blender --background --python tools/blender/show-forklift-comparison.py
The orange source is recovered from its original Git commit into local scratch.
Neither standalone model is edited. The comparison is an editable .blend.
"""
import bpy
import json
import subprocess
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/one-shift/models'
scratch=ROOT/'research/forklift/comparison'
scratch.mkdir(parents=True,exist_ok=True)
orange_file=scratch/'orange-forklift.blend'
orange_file.write_bytes(subprocess.check_output([
    'git','show','76b44f9f:assets/one-shift/models/warehouse-forklift.blend'],cwd=ROOT))
bpy.ops.wm.open_mainfile(filepath=str(OUT/'warehouse-forklift.blend'))
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene
yellow=bpy.data.objects['OneShift_ClassicForklift']
yellow.name='02 | Classic yellow propane forklift'
yellow.location=(-1.65,0,0)
with bpy.data.libraries.load(str(orange_file),link=False) as (source,target):
    target.objects=list(source.objects)
orange=next(o for o in target.objects if o and o.type=='EMPTY' and o.name.startswith('OneShift_Forklift'))
orange.name='01 | Original orange electric forklift'
orange.location=(1.65,0,0)
for title,root in [('01 | ORANGE - original electric',orange),('02 | YELLOW - classic propane',yellow)]:
    coll=bpy.data.collections.new(title)
    scene.collection.children.link(coll)
    for obj in [root]+list(root.children_recursive):
        for old in list(obj.users_collection):old.objects.unlink(obj)
        coll.objects.link(obj)
    # The editable native materials also drive the color in solid viewport mode.
    for obj in root.children_recursive:
        if obj.type in {'MESH','CURVE','FONT'} and obj.data.materials:
            obj.color=obj.data.materials[0].diffuse_color

camera=scene.camera
camera.location=(-4.6,13.0,6.9)
target=Vector((0,.25,1.08))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=7.55
# Scene +X appears on the left from this viewing direction.
scene.render.resolution_x=1800
scene.render.resolution_y=1200
scene.render.resolution_percentage=100
scene.cycles.samples=32
scene.cycles.use_denoising=True
for name,x,power,size in [('Comparison key',0,2100,7),('Comparison fill',-5,1200,5)]:
    d=bpy.data.lights.new(name,'AREA')
    d.energy=power
    d.shape='DISK'
    d.size=size
    o=bpy.data.objects.new(name,d)
    scene.collection.children['STUDIO | excluded from export'].objects.link(o)
    o.location=(x,4,7)
    o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()

# Hide the studio helpers in the viewport so Home also frames just the forklifts.
studio=scene.collection.children['STUDIO | excluded from export']
for obj in studio.objects:obj.hide_set(True)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active=yellow
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type!='VIEW_3D':continue
        space=area.spaces.active
        space.shading.type='SOLID'
        space.shading.color_type='MATERIAL'
        space.shading.light='STUDIO'
        space.shading.show_shadows=True
        space.shading.show_cavity=True
        space.shading.cavity_type='BOTH'
        space.shading.curvature_ridge_factor=1.15
        space.shading.curvature_valley_factor=1.05
        space.shading.background_type='WORLD'
        space.overlay.show_overlays=False
        space.show_region_ui=False
        space.show_region_toolbar=False
        space.region_3d.view_location=target
        space.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
        space.region_3d.view_distance=10
        space.region_3d.view_perspective='CAMERA'
        space.region_3d.view_camera_zoom=3
        space.region_3d.view_camera_offset=(0,0)
scene['Comparison']='Orange electric on the left; classic yellow propane on the right. Both at actual metre scale.'
scene['Navigation']='Middle mouse drag: orbit. Wheel: zoom. Numpad 0: restore the saved comparison camera.'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'warehouse-forklift-comparison.blend'))
print(json.dumps({'orange_objects':len(orange.children_recursive),'yellow_objects':len(yellow.children_recursive),'file':str(OUT/'warehouse-forklift-comparison.blend')}),flush=True)
scene.render.filepath=str(OUT/'warehouse-forklift-comparison.png')
bpy.ops.render.render(write_still=True)
