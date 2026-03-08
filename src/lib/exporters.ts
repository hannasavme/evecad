import * as THREE from "three";

// STL Binary Export
export function exportSTL(scene: THREE.Scene): Blob {
  const triangles: { normal: THREE.Vector3; vertices: THREE.Vector3[] }[] = [];

  scene.updateMatrixWorld(true);

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    // Skip non-model meshes (grid, helpers, selection indicators)
    const mat = (obj as THREE.Mesh).material as THREE.Material;
    if (mat && ('wireframe' in mat) && (mat as any).wireframe) return;
    if (mat && 'opacity' in mat && (mat as any).opacity < 0.1) return;
    const mesh = obj as THREE.Mesh;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);

    if (!geometry.index) {
      geometry.computeVertexNormals();
      const pos = geometry.attributes.position;
      const norm = geometry.attributes.normal;
      for (let i = 0; i < pos.count; i += 3) {
        const normal = new THREE.Vector3(norm.getX(i), norm.getY(i), norm.getZ(i));
        const v0 = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
        const v1 = new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
        const v2 = new THREE.Vector3(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
        triangles.push({ normal, vertices: [v0, v1, v2] });
      }
    } else {
      geometry.computeVertexNormals();
      const pos = geometry.attributes.position;
      const norm = geometry.attributes.normal;
      const idx = geometry.index;
      for (let i = 0; i < idx.count; i += 3) {
        const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
        const normal = new THREE.Vector3(norm.getX(a), norm.getY(a), norm.getZ(a));
        const v0 = new THREE.Vector3(pos.getX(a), pos.getY(a), pos.getZ(a));
        const v1 = new THREE.Vector3(pos.getX(b), pos.getY(b), pos.getZ(b));
        const v2 = new THREE.Vector3(pos.getX(c), pos.getY(c), pos.getZ(c));
        triangles.push({ normal, vertices: [v0, v1, v2] });
      }
    }
    geometry.dispose();
  });

  const headerBytes = 80;
  const numTriangles = triangles.length;
  const bufferLength = headerBytes + 4 + numTriangles * 50;
  const buffer = new ArrayBuffer(bufferLength);
  const view = new DataView(buffer);

  // Header (80 bytes of zeros)
  for (let i = 0; i < 80; i++) view.setUint8(i, 0);
  view.setUint32(80, numTriangles, true);

  let offset = 84;
  for (const tri of triangles) {
    view.setFloat32(offset, tri.normal.x, true); offset += 4;
    view.setFloat32(offset, tri.normal.y, true); offset += 4;
    view.setFloat32(offset, tri.normal.z, true); offset += 4;
    for (const v of tri.vertices) {
      view.setFloat32(offset, v.x, true); offset += 4;
      view.setFloat32(offset, v.y, true); offset += 4;
      view.setFloat32(offset, v.z, true); offset += 4;
    }
    view.setUint16(offset, 0, true); offset += 2;
  }

  return new Blob([buffer], { type: "application/octet-stream" });
}

// OBJ Text Export
export function exportOBJ(scene: THREE.Scene): Blob {
  let output = "# CADGen OBJ Export\n";
  let vertexOffset = 0;

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mesh = obj as THREE.Mesh;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);

    output += `o ${mesh.name || "object"}\n`;

    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      output += `v ${pos.getX(i)} ${pos.getY(i)} ${pos.getZ(i)}\n`;
    }

    if (geometry.attributes.normal) {
      const norm = geometry.attributes.normal;
      for (let i = 0; i < norm.count; i++) {
        output += `vn ${norm.getX(i)} ${norm.getY(i)} ${norm.getZ(i)}\n`;
      }
    }

    if (geometry.index) {
      const idx = geometry.index;
      for (let i = 0; i < idx.count; i += 3) {
        const a = idx.getX(i) + 1 + vertexOffset;
        const b = idx.getX(i + 1) + 1 + vertexOffset;
        const c = idx.getX(i + 2) + 1 + vertexOffset;
        output += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        const a = i + 1 + vertexOffset;
        const b = i + 2 + vertexOffset;
        const c = i + 3 + vertexOffset;
        output += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
      }
    }

    vertexOffset += pos.count;
    geometry.dispose();
  });

  return new Blob([output], { type: "text/plain" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
