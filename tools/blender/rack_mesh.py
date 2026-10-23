"""Shared mesh packing for warehouse game assets."""
import bpy
import math
import numpy as np
from mathutils import Vector

class GameMesh:
    def __init__(self):
        self.vertices=[]
        self.faces=[]
        self.colors=[]
        self.uv=[]
        self.surface=[]

    def face(self, coords, color, uv=None, surface=None):
        coords=[Vector(p) for p in coords]
        offset=len(self.vertices)
        self.vertices.extend(coords)
        self.faces.append(tuple(range(offset,offset+len(coords))))
        self.colors.extend([color]*len(coords))
        if uv is None:
            origin=coords[0]
            u=(coords[1]-origin).normalized()
            normal=(coords[1]-origin).cross(coords[2]-origin).normalized()
            v=normal.cross(u).normalized()
            planar=[((p-origin).dot(u),(p-origin).dot(v)) for p in coords]
            xs=[p[0] for p in planar]; ys=[p[1] for p in planar]
            dx=max(max(xs)-min(xs),.0001); dy=max(max(ys)-min(ys),.0001)
            uv=[((x-min(xs))/dx,(y-min(ys))/dy) for x,y in planar]
            surface=(dx,dy)
        self.uv.extend(uv)
        self.surface.extend([surface]*len(coords))

    def source(self,ob,lod):
        data=ob.data
        mat=data.materials[0] if data.materials else None
        name=mat.name if mat else ''
        color=tuple(mat.diffuse_color[:3]) if mat else (.2,.2,.2)
        code=.9 if 'Powder coat' in name or 'Safety yellow' in name else .3
        if 'label' in name.lower() or 'ink' in name.lower(): code=.01
        for p in data.polygons:
            self.face([ob.matrix_world@data.vertices[i].co for i in p.vertices],(*color,code))

    def rod(self,a,b,radius,color,sides=4):
        a,b=Vector(a),Vector(b)
        n=(b-a).normalized()
        ref=Vector((0,0,1)) if abs(n.z)<.9 else Vector((0,1,0))
        u=n.cross(ref).normalized()*radius
        v=n.cross(u).normalized()*radius
        ring=[u*math.cos(2*math.pi*i/sides)+v*math.sin(2*math.pi*i/sides) for i in range(sides)]
        for i in range(sides):
            j=(i+1)%sides
            self.face([a+ring[i],a+ring[j],b+ring[j],b+ring[i]],color)

    def finish(self,lod, prefix="Rack"):
        mesh=bpy.data.meshes.new(f'{prefix}_LOD{lod}')
        mesh.from_pydata(self.vertices,[],self.faces)
        mesh.update()
        mesh.uv_layers.new(name='FaceUV')
        mesh.uv_layers.new(name='SurfaceData')
        mesh.color_attributes.new(name='Finish',type='FLOAT_COLOR',domain='CORNER')
        # Creating custom-data layers can invalidate earlier RNA layer handles.
        # Fetch each layer after all allocations, then populate it in one write.
        loop_vertices=[loop.vertex_index for loop in mesh.loops]
        mesh.uv_layers['FaceUV'].data.foreach_set('uv',np.array([self.uv[v] for v in loop_vertices],dtype=np.float32).ravel())
        mesh.uv_layers['SurfaceData'].data.foreach_set('uv',np.array([self.surface[v] for v in loop_vertices],dtype=np.float32).ravel())
        expected=np.array([self.colors[v] for v in loop_vertices],dtype=np.float32).ravel()
        mesh.color_attributes['Finish'].data.foreach_set('color',expected)
        actual=np.empty(len(expected),dtype=np.float32)
        mesh.color_attributes['Finish'].data.foreach_get('color',actual)
        assert np.allclose(actual,expected), 'Vertex finish attributes were corrupted'
        ob=bpy.data.objects.new(f'{prefix}_LOD{lod}',mesh)
        bpy.context.scene.collection.objects.link(ob)
        return ob

