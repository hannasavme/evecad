import * as THREE from "three";
import type { SceneModel } from "@/components/ModelViewer";

let modelIdCounter = Date.now();

function nextId() {
  return `imported-${++modelIdCounter}`;
}

// Parse binary/ASCII STL into SceneModel parts
export function parseSTL(buffer: ArrayBuffer, filename: string): SceneModel[] {
  const geometry = new THREE.BufferGeometry();

  // Check if binary or ASCII
  const text = new TextDecoder().decode(buffer.slice(0, 80));
  const isBinary = !text.startsWith("solid") || buffer.byteLength !== text.length;

  if (isBinary) {
    const view = new DataView(buffer);
    const numTriangles = view.getUint32(80, true);
    const vertices = new Float32Array(numTriangles * 9);
    const normals = new Float32Array(numTriangles * 9);

    let offset = 84;
    for (let i = 0; i < numTriangles; i++) {
      const nx = view.getFloat32(offset, true); offset += 4;
      const ny = view.getFloat32(offset, true); offset += 4;
      const nz = view.getFloat32(offset, true); offset += 4;

      for (let j = 0; j < 3; j++) {
        const idx = i * 9 + j * 3;
        vertices[idx] = view.getFloat32(offset, true); offset += 4;
        vertices[idx + 1] = view.getFloat32(offset, true); offset += 4;
        vertices[idx + 2] = view.getFloat32(offset, true); offset += 4;
        normals[idx] = nx;
        normals[idx + 1] = ny;
        normals[idx + 2] = nz;
      }
      offset += 2; // attribute byte count
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  } else {
    // ASCII STL
    const fullText = new TextDecoder().decode(buffer);
    const vertexRegex = /vertex\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/g;
    const verts: number[] = [];
    let match;
    while ((match = vertexRegex.exec(fullText))) {
      verts.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
    geometry.computeVertexNormals();
  }

  // Compute bounding box for normalization
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // Normalize to fit roughly in a 3x3x3 area
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scaleFactor = 3 / maxDim;

  const name = filename.replace(/\.[^.]+$/, "");

  return [{
    id: nextId(),
    type: "box" as const,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: "#c4b5fd",
    label: name.slice(0, 30),
    params: {},
    visible: true,
    _importedGeometry: geometry,
    _importedScale: scaleFactor,
    _importedCenter: [-center.x * scaleFactor, -center.y * scaleFactor, -center.z * scaleFactor],
  }] as any[];
}

// Parse OBJ text into SceneModel parts
export function parseOBJ(text: string, filename: string): SceneModel[] {
  const vertices: number[] = [];
  const normals: number[] = [];
  const faces: { v: number[]; n: number[] }[] = [];
  const objects: { name: string; faceStart: number; faceEnd: number }[] = [];
  let currentObj = filename.replace(/\.[^.]+$/, "");
  let objStart = 0;

  const lines = text.split("\n");
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === "v") {
      vertices.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (parts[0] === "vn") {
      normals.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (parts[0] === "o" || parts[0] === "g") {
      if (faces.length > objStart) {
        objects.push({ name: currentObj, faceStart: objStart, faceEnd: faces.length });
      }
      currentObj = parts.slice(1).join(" ") || "object";
      objStart = faces.length;
    } else if (parts[0] === "f") {
      const fv: number[] = [];
      const fn: number[] = [];
      for (let i = 1; i < parts.length; i++) {
        const indices = parts[i].split("/");
        fv.push(parseInt(indices[0]) - 1);
        if (indices[2]) fn.push(parseInt(indices[2]) - 1);
      }
      faces.push({ v: fv, n: fn });
    }
  }
  if (faces.length > objStart) {
    objects.push({ name: currentObj, faceStart: objStart, faceEnd: faces.length });
  }

  if (objects.length === 0 && faces.length > 0) {
    objects.push({ name: filename.replace(/\.[^.]+$/, ""), faceStart: 0, faceEnd: faces.length });
  }

  // Build geometry for all faces combined
  const allVerts: number[] = [];
  const allNormals: number[] = [];
  for (const face of faces) {
    // Triangulate (fan from first vertex)
    for (let i = 1; i < face.v.length - 1; i++) {
      const indices = [face.v[0], face.v[i], face.v[i + 1]];
      for (const idx of indices) {
        allVerts.push(vertices[idx * 3], vertices[idx * 3 + 1], vertices[idx * 3 + 2]);
      }
      if (face.n.length > 0) {
        const nIndices = [face.n[0], face.n[Math.min(i, face.n.length - 1)], face.n[Math.min(i + 1, face.n.length - 1)]];
        for (const idx of nIndices) {
          allNormals.push(normals[idx * 3] || 0, normals[idx * 3 + 1] || 0, normals[idx * 3 + 2] || 1);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(allVerts), 3));
  if (allNormals.length === allVerts.length) {
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(allNormals), 3));
  } else {
    geometry.computeVertexNormals();
  }

  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scaleFactor = 3 / maxDim;

  const name = filename.replace(/\.[^.]+$/, "");

  return [{
    id: nextId(),
    type: "box" as const,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: "#a5f3fc",
    label: name.slice(0, 30),
    params: {},
    visible: true,
    _importedGeometry: geometry,
    _importedScale: scaleFactor,
    _importedCenter: [-center.x * scaleFactor, -center.y * scaleFactor, -center.z * scaleFactor],
  }] as any[];
}
