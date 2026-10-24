"""Check the editable forklift's mechanical clearances in Blender background mode.

blender --background --python-exit-code 1 --python tools/blender/check-forklift-clearance.py
The report is local scratch, not a collision or physics model for Unity.
"""
import bpy
import argparse
import json
import math
import sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/one-shift/models/warehouse-forklift.blend'
REPORT = ROOT / 'research/forklift/clearance.json'
EPSILON = 0.00005  # Ignore numerical contact within 0.05 mm.
GEOMETRY_TYPES = {'MESH', 'CURVE', 'FONT', 'SURFACE'}


def descendants(parent):
    return list(parent.children_recursive)


def require(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise RuntimeError('Missing required moving part: ' + name)
    return obj


def geometry(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    if mesh is None:
        return None
    try:
        mesh.calc_loop_triangles()
        vertices = [evaluated.matrix_world @ v.co for v in mesh.vertices]
        triangles = [tuple(t.vertices) for t in mesh.loop_triangles]
    finally:
        evaluated.to_mesh_clear()
    if not vertices or not triangles:
        return None
    low = Vector(tuple(min(v[i] for v in vertices) for i in range(3)))
    high = Vector(tuple(max(v[i] for v in vertices) for i in range(3)))
    edge_counts = {}
    for tri in triangles:
        for a, b in zip(tri, (tri[1], tri[2], tri[0])):
            key = (min(a, b), max(a, b))
            edge_counts[key] = edge_counts.get(key, 0) + 1
    return {
        'name': obj.name, 'vertices': vertices, 'triangles': triangles,
        'bvh': BVHTree.FromPolygons(vertices, triangles, all_triangles=True),
        'low': low, 'high': high,
        'closed': all(count == 2 for count in edge_counts.values()),
    }


def bounds_overlap(a, b):
    return all(a['high'][i] > b['low'][i] + EPSILON and
               b['high'][i] > a['low'][i] + EPSILON for i in range(3))


def segment_triangle(p, q, a, b, c):
    """Strict segment/triangle crossing, excluding coplanar numerical contacts."""
    edge1, edge2, direction = b - a, c - a, q - p
    normal = edge1.cross(edge2)
    normal_length = normal.length
    if normal_length < 1e-12:
        return None
    normal /= normal_length
    dp, dq = normal.dot(p - a), normal.dot(q - a)
    if not ((dp > EPSILON and dq < -EPSILON) or
            (dp < -EPSILON and dq > EPSILON)):
        return None
    h = direction.cross(edge2)
    det = edge1.dot(h)
    if abs(det) < 1e-14:
        return None
    inverse = 1.0 / det
    s = p - a
    u = inverse * s.dot(h)
    if u < -1e-7 or u > 1.0 + 1e-7:
        return None
    cross = s.cross(edge1)
    v = inverse * direction.dot(cross)
    if v < -1e-7 or u + v > 1.0 + 1e-7:
        return None
    t = inverse * edge2.dot(cross)
    if not 0 < t < 1:
        return None
    return p + direction * t


def triangle_crossing(a, b):
    for first, second in ((a, b), (b, a)):
        for i in range(3):
            hit = segment_triangle(first[i], first[(i + 1) % 3], *second)
            if hit is not None:
                return hit
    return None


RAY_DIRECTIONS = [Vector(v).normalized() for v in (
    (1.0, 0.234891, 0.491729), (0.357181, 1.0, 0.612947),
    (0.569897, 0.187463, 1.0))]


def inside(point, target):
    """Parity rays in three directions avoid face-normal and winding dependence."""
    if not target['closed'] or any(
            point[i] <= target['low'][i] + EPSILON or
            point[i] >= target['high'][i] - EPSILON for i in range(3)):
        return False
    near = target['bvh'].find_nearest(point)
    if near[0] is None or near[3] <= EPSILON:
        return False
    votes = 0
    maximum = (target['high'] - target['low']).length * 2 + 1
    for direction in RAY_DIRECTIONS:
        position = point.copy()
        hits = 0
        for unused in range(256):
            location, normal, index, distance = target['bvh'].ray_cast(
                position, direction, maximum)
            if location is None:
                break
            hits += 1
            position = location + direction * (EPSILON * 2)
        else:
            # Unresolved heavily self-overlapping geometry is not proof of containment.
            continue
        votes += hits % 2
    return votes >= 2


def collision(a, b):
    if not bounds_overlap(a, b):
        return None
    for ta, tb in a['bvh'].overlap(b['bvh']):
        first = [a['vertices'][i] for i in a['triangles'][ta]]
        second = [b['vertices'][i] for i in b['triangles'][tb]]
        hit = triangle_crossing(first, second)
        if hit is not None:
            return {'moving': a['name'], 'fixed': b['name'],
                    'kind': 'confirmed surface crossing',
                    'point_m': [round(v, 6) for v in hit]}
    # A closed object entirely inside another need not cross any surface.
    # Sample up to 48 evenly distributed vertices in both directions.
    for source, target in ((a, b), (b, a)):
        step = max(1, len(source['vertices']) // 48)
        for point in source['vertices'][::step]:
            if inside(point, target):
                return {'moving': a['name'], 'fixed': b['name'],
                        'kind': 'confirmed contained sample',
                        'point_m': [round(v, 6) for v in point]}
    return None


def collect(objects, depsgraph):
    return [data for obj in objects if obj.type in GEOMETRY_TYPES
            if (data := geometry(obj, depsgraph)) is not None]


def check_pose(label, moving_objects, static_geometry, depsgraph):
    moving_geometry = collect(moving_objects, depsgraph)
    intersections = []
    for moving in moving_geometry:
        for fixed in static_geometry:
            hit = collision(moving, fixed)
            if hit is not None:
                intersections.append(hit)
    print(label + ': ' + (str(len(intersections)) + ' clipping pairs' if intersections
                         else 'clear'), flush=True)
    return {'pose': label, 'moving_meshes': len(moving_geometry),
            'fixed_meshes': len(static_geometry), 'intersections': intersections}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--steering-limit', type=int, default=35,
                        help='Check a wider runtime steering range without changing the source file.')
    parser.add_argument('--suspension-travel', type=float, default=0,
                        help='Also check both wheels at half this travel above and below their saved centres, in metres.')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if not 1 <= args.steering_limit <= 80:
        raise ValueError('Steering limit must be between 1 and 80 degrees.')
    if not 0 <= args.suspension_travel <= .2:
        raise ValueError('Suspension travel must be between 0 and 0.2 metres.')
    report_path = REPORT if args.steering_limit == 35 else REPORT.with_name(
        'clearance-steer' + str(args.steering_limit) + '.json')
    if args.suspension_travel:
        report_path = report_path.with_stem(report_path.stem + '-travel' +
                                           str(round(args.suspension_travel * 1000)) + 'mm')
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    root = require('OneShift_ClassicForklift')
    chassis = require('Chassis')
    axle = require('RearAxle_Oscillation')
    steering = [require('RearSteer_' + side + '_Pivot') for side in ('L', 'R')]
    rolls = [require('RearWheel_' + side + '_Pivot') for side in ('L', 'R')]
    brake = require('ParkingBrake_Pivot')
    poses = [axle, *steering, brake]
    original_rotations = {obj: obj.rotation_euler.copy() for obj in poses}
    original_roll_locations = {obj: obj.location.copy() for obj in rolls}
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()

    report = {
        'source': str(SOURCE.relative_to(ROOT)).replace('\\', '/'),
        'units': 'metres', 'contact_tolerance_m': EPSILON,
        'steering_limit_degrees': args.steering_limit,
        'suspension_travel_m': args.suspension_travel,
        'method': 'Evaluated mesh BVH candidates, confirmed triangle crossings '
                  'and closed mesh containment samples.',
        'exclusions': ['Rear axle, knuckles and steering joints are intentional '
                       'wheel connections. Only Chassis descendants are fixed '
                       'obstacles for wheel clearance.'],
        'limitations': ['Discrete pose samples do not prove every intermediate '
                        'angle or Unity physics clearance.',
                        'Coplanar or sub-tolerance contacts are ignored.'],
        'wheel_poses': [], 'parking_brake_poses': [], 'failures': [],
    }
    baseline = collect(descendants(root), depsgraph)
    low = [min(g['low'][i] for g in baseline) for i in range(3)]
    high = [max(g['high'][i] for g in baseline) for i in range(3)]
    dimensions = [high[i] - low[i] for i in range(3)]
    report['rest_bounds_m'] = {'min': low, 'max': high, 'dimensions': dimensions}
    if not all(math.isfinite(v) for v in low + high):
        report['failures'].append('Non-finite rest mesh bounds.')
    if low[2] < -0.003:
        report['failures'].append('Rest mesh extends below floor by more than 3 mm.')
    if not all(0.5 < value < 10 for value in dimensions):
        report['failures'].append('Rest bounds fail metre-scale sanity check.')
    if any(abs(obj.rotation_euler[i]) > 1e-5 for obj in poses for i in range(3)):
        report['failures'].append('Mechanical pivots are not saved in their zero rest pose.')

    # Both tyre/rim assemblies are checked, including their treads and hub caps.
    wheel_objects = [obj for roll in rolls for obj in descendants(roll)]
    wheel_set = set(wheel_objects)
    joint_set = set(descendants(axle)) | {axle}
    fixed_objects = [obj for obj in descendants(chassis)
                     if obj not in wheel_set and obj not in joint_set]
    fixed = collect(fixed_objects, depsgraph)
    engine = collect([require('Engine bonnet'), require('Engine compartment')], depsgraph)
    try:
        steering_angles = sorted({-args.steering_limit, 0, args.steering_limit} |
                                {angle for angle in (-60, -45, -35, -20, 20, 35, 45, 60)
                                 if abs(angle) <= args.steering_limit})
        suspension_offsets = (-args.suspension_travel / 2, 0, args.suspension_travel / 2) if args.suspension_travel else (0,)
        for suspension in suspension_offsets:
            for roll in rolls:
                roll.location = original_roll_locations[roll] + Vector((0, 0, suspension))
            for oscillation in (-3, 0, 3):
                axle.rotation_euler.y = math.radians(oscillation)
                for angle in steering_angles:
                    for obj in steering:
                        obj.rotation_euler.z = math.radians(angle)
                    bpy.context.view_layer.update()
                    label = f'rear steer {angle:+d} deg, axle {oscillation:+d} deg'
                    if args.suspension_travel:
                        label += f', hub offset {suspension * 1000:+.1f} mm'
                    report['wheel_poses'].append(check_pose(label, wheel_objects, fixed, depsgraph))
        for angle in (-10, 0, 12):
            brake.rotation_euler.x = math.radians(angle)
            bpy.context.view_layer.update()
            report['parking_brake_poses'].append(check_pose(
                f'parking brake {angle:+d} deg', descendants(brake), engine, depsgraph))
    finally:
        for obj, rotation in original_rotations.items():
            obj.rotation_euler = rotation
        for obj, location in original_roll_locations.items():
            obj.location = location
        bpy.context.view_layer.update()
    clipping_pairs = sum(len(pose['intersections']) for pose in
                         report['wheel_poses'] + report['parking_brake_poses'])
    report['clipping_pairs'] = clipping_pairs
    report['passed'] = clipping_pairs == 0 and not report['failures']
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('Forklift clearance: ' + ('PASS' if report['passed'] else 'FAIL') +
          f', {len(report["wheel_poses"])} rear wheel poses, '
          f'{len(report["parking_brake_poses"])} brake poses, '
          f'{clipping_pairs} clipping pairs.', flush=True)
    print('Report: ' + str(report_path), flush=True)
    if not report['passed']:
        raise RuntimeError('Unexpected forklift clipping or invalid rest bounds; see report.')


if __name__ == '__main__':
    main()
