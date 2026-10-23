"""Export the owner's four existing Blender pallets, without changing the source.

Run with Blender 5.2. Keep full detail nearby; omit nails and bevels at distance.
The 40 x 48 inch footprint and original board UVs are never rescaled.
"""
import bpy
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/one-shift/models/pallets'
TARGET = ROOT / 'unity/OneShiftRackLab/Assets/RackLab'
SLUGS = ['01_Fresh_Pine', '02_Working_Wear', '03_Split_Battered', '04_Repaired']
bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'warehouse-pallets.blend'))
report = []
exports = []
for slug in SLUGS:
    root = bpy.data.objects[slug]
    parts = [o for o in root.children_recursive if o.type == 'MESH']
    origin = root.matrix_world.inverted()
    entries = []
    for lod in range(3):
        copies = []
        for source in parts:
            if lod and 'nail_count' in source:
                continue
            copy = source.copy()
            copy.data = source.data.copy()
            bpy.context.scene.collection.objects.link(copy)
            copy.parent = None
            copy.matrix_world = origin @ source.matrix_world
            if lod:
                copy.modifiers.clear()
                simplify = copy.modifiers.new('Distant board silhouette', 'DECIMATE')
                simplify.decimate_type = 'DISSOLVE'
                simplify.angle_limit = .015 if lod == 1 else .07
                simplify.delimit = {'UV', 'MATERIAL'}
            graph = bpy.context.evaluated_depsgraph_get()
            evaluated = copy.evaluated_get(graph)
            baked = bpy.data.meshes.new_from_object(evaluated, depsgraph=graph)
            baked.transform(copy.matrix_world)
            bpy.data.objects.remove(copy, do_unlink=True)
            obj = bpy.data.objects.new('part', baked)
            bpy.context.scene.collection.objects.link(obj)
            copies.append(obj)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in copies:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = copies[0]
        bpy.ops.object.join()
        joined = bpy.context.object
        joined.name = f'{slug}_LOD{lod}'
        joined.data.name = joined.name
        joined.data.calc_loop_triangles()
        entries.append({'lod': lod, 'triangles': len(joined.data.loop_triangles),
                        'bounds_m': list(joined.dimensions),
                        'materials': [m.name for m in joined.data.materials]})
        exports.append(joined)
    report.append({'variant': slug, 'source_objects': len(parts), 'lods': entries})

bpy.ops.object.select_all(action='DESELECT')
for obj in exports:
    obj.select_set(True)
bpy.context.view_layer.objects.active = exports[0]
bpy.ops.export_scene.fbx(filepath=str(TARGET / 'Models/owner-pallets-lods.fbx'),
    use_selection=True, object_types={'MESH'}, use_mesh_modifiers=False,
    add_leaf_bones=False, bake_anim=False, axis_forward='-Z', axis_up='Y',
    apply_unit_scale=True, bake_space_transform=True, mesh_smooth_type='FACE',
    path_mode='AUTO')
textures = TARGET / 'Textures/Pallets'
textures.mkdir(exist_ok=True)
for slug in SLUGS:
    for suffix in ('BaseColor', 'Normal'):
        shutil.copy2(SOURCE / f'textures/{slug}_{suffix}.png', textures)
(TARGET / 'Models/owner-pallets-report.json').write_text(json.dumps(report, indent=2)+'\n')
print('OWNER_PALLETS_EXPORTED', json.dumps(report), flush=True)
