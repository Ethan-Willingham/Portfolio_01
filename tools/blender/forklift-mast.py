"""Original duplex mast for build-warehouse-forklift.py, metres and +Y forward.

Call build_mast(globals()) from the forklift builder. This module deliberately
does not reset a Blender scene, export a file, or install Unity gameplay.
"""
import math


def build_mast(api):
    bpy = api['bpy']
    Vector = api['Vector']
    empty, box, cyl = (api[k] for k in ('empty', 'box', 'cyl'))
    rod, hose, mesh, profile = (api[k] for k in ('rod', 'hose', 'mesh', 'profile'))
    root, black, steel, chrome, rubber = (api[k] for k in ('root', 'black', 'steel', 'chrome', 'rubber'))
    mast = empty('MastTilt_Pivot', (0, 1.075, .34), root)
    mast['tilt_axis'] = 'local X; radians'
    mast['preview_tilt_limits_degrees'] = '-6 to 8'
    inner = empty('InnerMast_Lift', parent=mast)
    inner['travel_m'] = .9
    inner['drive'] = 'Local Z travel h; ForkCarriage_Lift travels 2*h'
    carriage = empty('ForkCarriage_Lift', (0, .22, 0), mast)
    carriage['travel_m'] = 1.8
    carriage['drive'] = 'Local Z equals twice InnerMast_Lift local Z'

    # Outer channels open inward; inner channels occupy their clear central slot.
    for side in (-1, 1):
        x = side * .40
        box('Outer mast channel web', (x, .04, .74), (.035, .28, 2.01), black, mast, .004)
        for y in (-.10, .18):
            box('Outer mast flange', (x, y, .74), (.16, .025, 2.01), black, mast, .004)
        cyl('Mast tilt bearing', (x, 0, 0), .067, .16, steel, mast, 'X', 28)
        xi = side * .29
        box('Inner mast channel web', (xi, .04, .79), (.03, .15, 1.94), steel, inner, .003)
        for y in (-.035, .115):
            box('Inner mast flange', (xi, y, .79), (.105, .025, 1.94), black, inner, .003)
        suffix = 'L' if side < 0 else 'R'
        pivot = empty('InnerGuide_' + suffix + '_Lower', (side * .36, .04, 0), inner)
        cyl('Inner stage lower guide roller', (0, 0, 0), .121, .025, steel, pivot, 'X', 32, .002)
        cyl('Inner stage roller hub', (0, 0, 0), .038, .030, black, pivot, 'X', 20, .001)
        rod('Inner stage lower axle', (side * .29, .04, 0), (side * .36, .04, 0), .023, steel, inner, 20)
        # This upper roller stays with the outer mast and bears on the rear
        # outside face of the inner flange. It cannot exit the outer channel at
        # full rise and never enters the carriage's internal roller lane.
        pivot = empty('OuterGuide_' + suffix + '_Upper', (side * .29, -.108, 1.50), mast)
        cyl('Fixed upper rear guide roller', (0, 0, 0), .056, .025, steel, pivot, 'X', 28, .0015)
        rod('Fixed upper guide axle', (side * .29, -.108, 1.50), (side * .40, -.108, 1.50), .017, steel, mast, 20)
    for z in (-.15, 1.72):
        box('Outer mast cross tie', (0, -.075, z), (.92, .075, .10), black, mast, .006)
    box('Inner mast header', (0, .04, 1.79), (.70, .19, .09), black, inner, .006)

    for z in (.05, .49):
        box('Carriage rail', (0, 0, z), (1.05, .10, .10), steel, carriage, .006)
    for side in (-1, 1):
        box('Carriage end plate', (side * .46, 0, .27), (.08, .10, .52), black, carriage, .005)
        for z in (.05, .49):
            # Bearings enter the open inner face of the channel. Their axles do
            # not pass through the channel web, unlike the former arrangement.
            box('Carriage roller bracket', (side * .225, -.09, z), (.022, .20, .07), steel, carriage, .003)
            rod('Carriage roller axle', (side * .225, -.18, z),
                (side * .255, -.18, z), .018, steel, carriage, 16)
            pivot = empty('CarriageRoller_' + ('L' if side < 0 else 'R') + '_' + str(z),
                          (side * .255, -.18, z), carriage)
            cyl('Carriage guide roller', (0, 0, 0), .056, .025, steel, pivot, 'X', 28, .0015)
    for z in (.53, 1.20):
        box('Backrest horizontal', (0, .015, z), (1.12, .055, .055), black, carriage, .005)
    for x in (-.53, -.353, -.176, 0, .176, .353, .53):
        box('Backrest vertical', (x, .015, .865), (.029, .04, .67), black, carriage, .004)
    forks = []
    for x in (-.275, .275):
        fork = empty('Fork_Left' if x < 0 else 'Fork_Right', (x, 0, 0), carriage)
        forks.append(fork)
        profile('Continuous forged fork', [(.018, .58), (.07, .58), (.07, -.19),
                (.105, -.22), (1.13, -.22), (1.13, -.232), (.12, -.263),
                (.045, -.263), (.018, -.23)], .10, steel, fork, .006)
        box('Carriage hook', (0, .002, .53), (.12, .10, .055), steel, fork, .004)
        lock = empty('ForkSpacingLock_' + ('L' if x < 0 else 'R'), (0, .005, .58), fork)
        cyl('Fork spacing lock', (0, 0, 0), .014, .045, steel, lock, 'Z', 16, .001)
        for i in range(3):
            box('Fork use polish', (-.029 + i * .027, .62, -.219), (.004, .76, .001), chrome, fork, .0002)
    empty('ForkTips', (0, 1.13, -.22), carriage)
    empty('LoadCentre', (0, .61, -.20), carriage)

    # BL634-inspired original leaf geometry: 19.05 mm pitch, interlaced 3/4
    # plate packets and 7.9 mm pins. No roller chain or toothed sprockets.
    pitch, plate_half, plate_t, layer_step = .01905, .00905, .0032, .00335
    pin_radius, centre_y, sheave_z = .105, .045, 1.60
    fixed_z = .10
    chain_count = 175

    def chain_path(radius, height, carriage_z):
        """Two tangent lines and a clockwise upper circular wrap in Y/Z."""
        # Python complex coordinates keep the chord solver in double precision;
        # Blender's mathutils.Vector stores float32 and cannot resolve this test.
        a = complex(centre_y - pin_radius, fixed_z)
        b = complex(centre_y + pin_radius, carriage_z)
        c = complex(centre_y, sheave_z + height)
        va, vb = a - c, b - c
        ta = math.atan2(va.imag, va.real) - math.acos(radius / abs(va))
        while ta < 0:
            ta += math.tau
        tb = math.atan2(vb.imag, vb.real) + math.acos(radius / abs(vb))
        while tb > ta:
            tb -= math.tau
        pa = c + complex(math.cos(ta), math.sin(ta)) * radius
        pb = c + complex(math.cos(tb), math.sin(tb)) * radius
        l1, la, l2 = abs(pa - a), radius * (ta - tb), abs(b - pb)
        ua, ub = (pa - a) / l1, (b - pb) / l2

        def point(s):
            if s < l1:
                return a + ua * s
            if s <= l1 + la:
                angle = ta - (s - l1) / radius
                return c + complex(math.cos(angle), math.sin(angle)) * radius
            return pb + ub * (s - l1 - la)
        return point, l1 + la + l2, ub, (l1, la)

    def rigid_points(radius, height, carriage_z):
        # Advance by exact chord length, solving only links crossing/on the arc.
        point, total, last_direction, spans = chain_path(radius, height, carriage_z)
        s = 0.
        points = [point(0.)]
        for unused in range(chain_count):
            current = points[-1]
            low, high = s + pitch, s + pitch * 1.03
            if abs(point(low) - current) < pitch - 1e-12:
                for iteration in range(32):
                    mid = (low + high) * .5
                    if abs(point(mid) - current) < pitch:
                        low = mid
                    else:
                        high = mid
                s = (low + high) * .5
            else:
                s = low
            points.append(point(s))
        error = ((points[-1] - point(total)) * last_direction.conjugate()).real
        return points, error, spans

    # Select the lowered anchor height to suit an integral number of links.
    initial_points, unused_error, unused_spans = rigid_points(pin_radius, 0., .10)
    moving_anchor_z = initial_points[-1].imag
    assert .08 < moving_anchor_z < .12

    def leaf_mesh(lacing):
        verts, faces = [], []

        def plate(x):
            # Rounded ends with a slight waist between the two pin centres.
            outline = []
            for i in range(9):
                angle = math.pi + i * math.pi / 8
                outline.append((plate_half * math.cos(angle), plate_half * math.sin(angle)))
            outline.append((.0068, pitch / 2))
            for i in range(9):
                angle = i * math.pi / 8
                outline.append((plate_half * math.cos(angle), pitch + plate_half * math.sin(angle)))
            outline.append((-.0068, pitch / 2))
            start, n = len(verts), len(outline)
            verts.extend((x + dx, y, z) for dx in (-plate_t / 2, plate_t / 2) for y, z in outline)
            faces.append(tuple(start + j for j in reversed(range(n))))
            faces.append(tuple(start + n + j for j in range(n)))
            faces.extend((start + j, start + (j + 1) % n,
                          start + n + (j + 1) % n, start + n + j) for j in range(n))

        def pin(radius, x1, x2):
            start, n = len(verts), 12
            verts.extend((x, radius * math.cos(i * math.tau / n),
                          radius * math.sin(i * math.tau / n)) for x in (x1, x2) for i in range(n))
            faces.append(tuple(start + j for j in reversed(range(n))))
            faces.append(tuple(start + n + j for j in range(n)))
            faces.extend((start + j, start + (j + 1) % n,
                          start + n + (j + 1) % n, start + n + j) for j in range(n))
        for layer in ((-2, 0, 2) if lacing == 3 else (-3, -1, 1, 3)):
            plate(layer * layer_step)
        pin(.00395, -.0132, .0132)
        pin(.0047, -.0143, -.0126)
        pin(.0047, .0126, .0143)
        source = mesh('Leaf chain ' + str(lacing) + '-plate source', verts, faces, steel, mast, 0)
        for polygon in source.data.polygons:
            polygon.use_smooth = False
        data = source.data
        bpy.data.objects.remove(source, do_unlink=True)
        return data

    link_data = (leaf_mesh(3), leaf_mesh(4))
    chains, sheaves, pistons = [], [], []

    def clevis(name, loc, parent, upward=True):
        pivot = empty(name, loc, parent)
        # Pins are the exact link endpoint. Forks extend from the anchor plate.
        sign = -1 if upward else 1
        for side in (-1, 1):
            box('Chain anchor cheek', (side * .021, 0, sign * .012), (.009, .035, .055), steel, pivot, .005)
        cyl('Retained anchor pin', (0, 0, 0), .0049, .055, chrome, pivot, 'X', 16, .0005)
        for side in (-1, 1):
            cyl('Anchor pin retainer', (side * .028, 0, 0), .007, .003, steel, pivot, 'X', 12, .0004)
        rod('Anchor adjuster', (0, 0, sign * .03), (0, 0, sign * .103), .008, steel, pivot, 12)
        for zz in (.065, .082):
            cyl('Anchor locking nut', (0, 0, sign * zz), .014, .012, steel, pivot, 'Z', 6, .001)
        return pivot

    for side in (-1, 1):
        suffix, x = ('L' if side < 0 else 'R'), side * .185
        assembly = empty('LeafChain_' + suffix, parent=mast)
        assembly['pitch_m'] = pitch
        assembly['link_count'] = chain_count
        assembly['lacing'] = 'Alternating 3 and 4 plates, common transverse pins'
        assembly['animation'] = 'Rigid link transforms; do not merge across link pivots'
        pivots = []
        for j in range(chain_count):
            pivot = empty('Chain_' + suffix + '_Link_%03d' % j, parent=assembly)
            pivot.empty_display_size = .008
            obj = bpy.data.objects.new('Leaf plates and pivot pin', link_data[j % 2])
            bpy.context.scene.collection.objects.link(obj)
            obj.parent = pivot
            pivots.append(pivot)
        chains.append((x, pivots))
        fixed = clevis('Chain_' + suffix + '_FixedAnchor', (x, centre_y - pin_radius, fixed_z), mast, True)
        # The adjuster feet bolt to structural tabs, not free-standing in space.
        box('Fixed anchor mounting tab', (x, centre_y - pin_radius, -.01), (.08, .12, .025), black, mast, .004)
        rod('Fixed anchor support', (x, -.075, -.15), (x, centre_y - pin_radius, -.01), .024, black, mast, 16)
        clevis('Chain_' + suffix + '_CarriageAnchor',
               (x, centre_y + pin_radius - .22, moving_anchor_z), carriage, True)
        box('Carriage chain anchor foot', (x, -.035, moving_anchor_z - .11), (.085, .12, .025), steel, carriage, .004)
        box('Carriage anchor connection', (x, 0, .01), (.085, .10, .08), steel, carriage, .004)
        sheave = empty('ChainSheave_' + suffix + '_Pivot', (x, centre_y, sheave_z), inner)
        sheave['rotation_axis'] = 'local X'
        cyl('Smooth leaf chain sheave', (0, 0, 0), .0950, .027, steel, sheave, 'X', 48, .001)
        for xx in (-.0175, .0175):
            cyl('Sheave retaining flange', (xx, 0, 0), .1095, .006, black, sheave, 'X', 48, .001)
        cyl('Sheave hub', (0, 0, 0), .034, .060, steel, sheave, 'X', 24, .002)
        for xx in (-.039, .039):
            box('Sheave bearing hanger', (x + xx, centre_y, 1.68), (.018, .055, .22), black, inner, .004)
        cyl('Sheave axle', (x, centre_y, sheave_z), .016, .110, chrome, inner, 'X', 20, .001)
        sheaves.append(sheave)
        # A long piston remains engaged in the barrel throughout the .9 m rise.
        barrel = empty('LiftCylinder_' + suffix + '_Barrel', (x, -.17, -.14), mast)
        cyl('Lift ram barrel', (0, 0, .705), .046, 1.41, black, barrel, 'Z', 32, .004)
        cyl('Lift ram base', (0, 0, 0), .054, .05, steel, barrel, 'Z', 24, .002)
        cyl('Lift ram gland', (0, 0, 1.41), .052, .045, steel, barrel, 'Z', 28, .002)
        piston = empty('LiftCylinder_' + suffix + '_Piston', (x, -.17, 1.60), inner)
        cyl('Lift piston polished rod', (0, 0, -.79), .024, 1.58, chrome, piston, 'Z', 28, .002)
        cyl('Piston head pin', (0, 0, 0), .025, .085, steel, piston, 'X', 20, .002)
        box('Ram rear header standoff', (x, -.17, 1.695), (.065, .06, .23), black, inner, .005)
        box('Ram overhead header connection', (x, -.0625, 1.79), (.065, .235, .055), black, inner, .005)
        box('Ram base mounting foot', (x, -.14, -.15), (.11, .19, .06), steel, mast, .006)
        hose('Lift cylinder supply hose ' + suffix,
             [(x, -.24, -.16), (x, -.255, -.05), (x, -.25, .15), (x, -.211, .18)], .008, rubber, mast)
        empty('LiftHose_' + suffix + '_SupplyAnchor', (x, -.24, -.16), mast)
        empty('LiftHose_' + suffix + '_CylinderPort', (x, -.211, .18), mast)
        pistons.append(piston)

    tilt_units = []
    for side in (-1, 1):
        suffix, x = ('L' if side < 0 else 'R'), side * .31
        fixed = Vector((x, .40, .38))
        moving_local = Vector((x, -.20, .36))
        cylinder = empty('TiltCylinder_' + suffix + '_BarrelPivot', fixed, root)
        cylinder['aim'] = 'Aim local Z from chassis base toward mast end'
        cyl('Tilt ram barrel', (0, 0, .17), .044, .34, black, cylinder, 'Z', 28, .003)
        cyl('Tilt ram gland', (0, 0, .34), .049, .035, steel, cylinder, 'Z', 24, .002)
        cyl('Tilt barrel eye', (0, 0, 0), .038, .08, steel, cylinder, 'X', 20, .002)
        piston = empty('TiltCylinder_' + suffix + '_RodEnd', parent=root)
        cyl('Tilt polished piston', (0, 0, -.17), .023, .34, chrome, piston, 'Z', 24, .002)
        cyl('Tilt piston eye', (0, 0, 0), .038, .08, steel, piston, 'X', 20, .002)
        for xx in (-.040, .040):
            box('Tilt chassis clevis', (x + xx, .40, .38), (.016, .09, .09), black, root, .009)
            box('Tilt mast clevis', (x + xx, -.20, .36), (.016, .09, .09), black, mast, .009)
        # Inboard cylinders clear the front tyres. Their fixed mast brackets
        # rise behind the sliding rails, then reach the outer web above the
        # mudguards instead of obstructing either the wheel or the inner stage.
        box('Tilt mount rear upright', (x, -.20, .43), (.06, .06, .22), black, mast, .005)
        box('Tilt mount upper crossbar', (side * .355, -.20, .52), (.15, .055, .075), black, mast, .005)
        box('Tilt mount outer gusset', (side * .40, -.08, .52), (.055, .24, .075), black, mast, .005)
        empty('TiltCylinder_' + suffix + '_MastAnchor', moving_local, mast)
        tilt_units.append((fixed, moving_local, cylinder, piston))

    metadata = {
        'mast_type': 'Original duplex mast, paired 3x4 leaf chains on smooth sheaves',
        'inner_travel_m': .9, 'carriage_travel_m': 1.8, 'carriage_ratio': 2,
        'chain_pitch_m': pitch, 'chain_links_each': chain_count,
        'chain_length_each_m': chain_count * pitch,
        'chain_anchor_lowered_z_m': moving_anchor_z,
        'pin_path_nominal_radius_m': pin_radius,
        'sheave_running_radius_m': .0950,
        'min_inner_outer_rail_overlap_m': 1.025,
        'carriage_roller_to_flange_clearance_m': .0065,
        'carriage_roller_to_web_clearance_m': .0075,
        'lower_inner_stage_roller_to_flange_clearance_m': .0065,
        'lower_inner_stage_roller_to_web_clearance_m': .01,
        'upper_fixed_guide_to_inner_flange_clearance_m': .0045,
        'lift_piston_barrel_overlap_at_max_m': .35,
        'return_chain_to_lift_barrel_clearance_m': .05495,
        'tilt_cylinder_to_front_tyre_axial_clearance_m': .0437,
        'tilt_cylinder_to_front_mudguard_axial_clearance_m': .011,
        'chain_contact_method': 'Exact rigid pitch; tiny radial wrap adjustment closes both fixed anchors. Pose reports adjustment and residual.',
        'unity_note': 'Separate exported transforms; no runtime driver, colliders, rig constraints or gameplay installed.',
    }

    def pose(inner_lift_m=0., tilt_radians=0.):
        height = float(inner_lift_m)
        tilt = float(tilt_radians)
        if not 0 <= height <= .9:
            raise ValueError('Inner mast preview travel must be between 0 and .9 metres')
        if not math.radians(-6) - 1e-9 <= tilt <= math.radians(8) + 1e-9:
            raise ValueError('Mast preview tilt must be between -6 and 8 degrees')
        inner.location.z = height
        carriage.location.z = 2 * height
        mast.rotation_euler.x = tilt
        # Radius compensation is minute: rigid chord length and unchanged anchor
        # locations take priority over a fictitious stretchable chain texture.
        low, high = pin_radius - .00015, pin_radius + .00015
        final_z = moving_anchor_z + 2 * height
        _, elo, _ = rigid_points(low, height, final_z)
        _, ehi, _ = rigid_points(high, height, final_z)
        if elo * ehi > 0:
            raise AssertionError('Chain closure radius could not be bracketed')
        points = None
        for iteration in range(32):
            radius = (low + high) * .5
            points, error, unused_spans = rigid_points(radius, height, final_z)
            if error * elo > 0:
                low, elo = radius, error
            else:
                high = radius
        max_pitch_error = max(abs(abs(b - a) - pitch) for a, b in zip(points, points[1:]))
        endpoint_error = abs(points[-1] - complex(centre_y + pin_radius, final_z))
        min_chord_to_sheave = radius * math.sqrt(1 - (pitch / (2 * radius)) ** 2) - plate_half - .0950
        assert max_pitch_error < 1e-8
        assert endpoint_error < 1e-8
        assert min_chord_to_sheave > 0
        for x, pivots in chains:
            for j, pivot in enumerate(pivots):
                a, b = points[j], points[j + 1]
                pivot.location = (x, a.real, a.imag)
                direction = Vector((0., b.real - a.real, b.imag - a.imag))
                # Rotate around X only, preserving the leaf-plate lacing axis.
                pivot.rotation_euler.x = -math.atan2(direction.y, direction.z)
        for sheave in sheaves:
            sheave.rotation_euler.x = height / .0950
        bpy.context.view_layer.update()
        tilt_overlaps = []
        for fixed, moving_local, cylinder, piston in tilt_units:
            end = mast.matrix_world @ moving_local
            direction = end - fixed
            q = direction.to_track_quat('Z', 'Y')
            cylinder.rotation_euler = q.to_euler()
            piston.location = end
            piston.rotation_euler = q.to_euler()
            tilt_overlaps.append(.68 - direction.length)
        bpy.context.view_layer.update()
        return {
            'inner_lift_m': height, 'carriage_lift_m': 2 * height,
            'tilt_degrees': math.degrees(tilt), 'chain_pitch_error_m': max_pitch_error,
            'chain_endpoint_error_m': endpoint_error,
            'wrap_radius_adjustment_m': radius - pin_radius,
            'min_chain_plate_sheave_clearance_m': min_chord_to_sheave,
            'tilt_ram_overlap_m': min(tilt_overlaps),
        }

    metadata['lowered_pose'] = pose()
    return {'mast': mast, 'inner': inner, 'carriage': carriage,
            'metadata': metadata, 'pose': pose}
