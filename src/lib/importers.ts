import * as THREE from "three";
import type { SceneModel } from "@/components/ModelViewer";

let modelIdCounter = Date.now();

function nextId() {
  return `imported-${++modelIdCounter}`;
}

const IMPORT_COLORS = [
  "#c4b5fd", "#a5f3fc", "#f9a8d4", "#86efac", "#fde68a",
  "#fdba74", "#fda4af", "#a5b4fc", "#f0abfc", "#fef3c7",
];

function buildGeometryFromFaces(
  vertices: number[],
  normals: number[],
  faces: { v: number[]; n: number[] }[]
): THREE.BufferGeometry {
  const verts: number[] = [];
  const norms: number[] = [];

  for (const face of faces) {
    for (let i = 1; i < face.v.length - 1; i++) {
      const indices = [face.v[0], face.v[i], face.v[i + 1]];
      for (const idx of indices) {
        verts.push(vertices[idx * 3], vertices[idx * 3 + 1], vertices[idx * 3 + 2]);
      }
      if (face.n.length > 0) {
        const nIndices = [
          face.n[0],
          face.n[Math.min(i, face.n.length - 1)],
          face.n[Math.min(i + 1, face.n.length - 1)],
        ];
        for (const idx of nIndices) {
          norms.push(normals[idx * 3] || 0, normals[idx * 3 + 1] || 0, normals[idx * 3 + 2] || 1);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
  if (norms.length === verts.length) {
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(norms), 3));
  } else {
    geometry.computeVertexNormals();
  }
  return geometry;
}

function computeNormalization(geometries: THREE.BufferGeometry[]): { scaleFactor: number; globalCenter: THREE.Vector3 } {
  const globalBox = new THREE.Box3();
  for (const geo of geometries) {
    geo.computeBoundingBox();
    globalBox.union(geo.boundingBox!);
  }
  const size = new THREE.Vector3();
  globalBox.getSize(size);
  const center = new THREE.Vector3();
  globalBox.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  return { scaleFactor: 3 / maxDim, globalCenter: center };
}

// Parse binary/ASCII STL into SceneModel parts
// Supports multi-solid ASCII STL files
export function parseSTL(buffer: ArrayBuffer, filename: string): SceneModel[] {
  const textCheck = new TextDecoder().decode(buffer.slice(0, 80));
  const isBinary = !textCheck.startsWith("solid") || buffer.byteLength > textCheck.length + 100;

  if (isBinary) {
    // Binary STL = single solid
    const geometry = parseBinarySTL(buffer);
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
      color: IMPORT_COLORS[0],
      label: name.slice(0, 30),
      params: {},
      visible: true,
      _importedGeometry: geometry,
      _importedScale: scaleFactor,
      _importedCenter: [-center.x * scaleFactor, -center.y * scaleFactor, -center.z * scaleFactor],
    }] as any[];
  }

  // ASCII STL — split by "solid" blocks
  const fullText = new TextDecoder().decode(buffer);
  const solidRegex = /solid\s*(.*?)\n([\s\S]*?)endsolid/gi;
  const solids: { name: string; text: string }[] = [];
  let match;
  while ((match = solidRegex.exec(fullText))) {
    solids.push({ name: match[1]?.trim() || "solid", text: match[2] });
  }

  if (solids.length === 0) {
    // Fallback: treat whole file as one solid
    solids.push({ name: filename.replace(/\.[^.]+$/, ""), text: fullText });
  }

  const geometries: THREE.BufferGeometry[] = [];
  const names: string[] = [];

  for (const solid of solids) {
    const vertexRegex = /vertex\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/g;
    const verts: number[] = [];
    let m;
    while ((m = vertexRegex.exec(solid.text))) {
      verts.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    }
    if (verts.length === 0) continue;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
    geometry.computeVertexNormals();
    geometries.push(geometry);
    names.push(solid.name);
  }

  if (geometries.length === 0) return [];

  const { scaleFactor, globalCenter } = computeNormalization(geometries);

  return geometries.map((geometry, i) => {
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox!.getCenter(center);

    return {
      id: nextId(),
      type: "box" as const,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
      color: IMPORT_COLORS[i % IMPORT_COLORS.length],
      label: names[i].slice(0, 30),
      params: {},
      visible: true,
      _importedGeometry: geometry,
      _importedScale: scaleFactor,
      _importedCenter: [
        -globalCenter.x * scaleFactor,
        -globalCenter.y * scaleFactor,
        -globalCenter.z * scaleFactor,
      ],
    };
  }) as any[];
}

function parseBinarySTL(buffer: ArrayBuffer): THREE.BufferGeometry {
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
    offset += 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  return geometry;
}

// Parse OBJ text into SceneModel parts — one per object/group
export function parseOBJ(text: string, filename: string): SceneModel[] {
  const vertices: number[] = [];
  const normals: number[] = [];

  interface ObjGroup {
    name: string;
    faces: { v: number[]; n: number[] }[];
  }

  const groups: ObjGroup[] = [];
  let currentGroup: ObjGroup = { name: filename.replace(/\.[^.]+$/, ""), faces: [] };

  const lines = text.split("\n");
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === "v") {
      vertices.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (parts[0] === "vn") {
      normals.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (parts[0] === "o" || parts[0] === "g") {
      if (currentGroup.faces.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = { name: parts.slice(1).join(" ") || "object", faces: [] };
    } else if (parts[0] === "f") {
      const fv: number[] = [];
      const fn: number[] = [];
      for (let i = 1; i < parts.length; i++) {
        const indices = parts[i].split("/");
        fv.push(parseInt(indices[0]) - 1);
        if (indices[2]) fn.push(parseInt(indices[2]) - 1);
      }
      currentGroup.faces.push({ v: fv, n: fn });
    }
  }
  if (currentGroup.faces.length > 0) {
    groups.push(currentGroup);
  }

  if (groups.length === 0) return [];

  // Build geometry per group
  const geometries = groups.map((g) => buildGeometryFromFaces(vertices, normals, g.faces));
  const { scaleFactor, globalCenter } = computeNormalization(geometries);

  return geometries.map((geometry, i) => {
    geometry.computeBoundingBox();

    return {
      id: nextId(),
      type: "box" as const,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
      color: IMPORT_COLORS[i % IMPORT_COLORS.length],
      label: groups[i].name.slice(0, 30),
      params: {},
      visible: true,
      group: filename.replace(/\.[^.]+$/, ""),
      _importedGeometry: geometry,
      _importedScale: scaleFactor,
      _importedCenter: [
        -globalCenter.x * scaleFactor,
        -globalCenter.y * scaleFactor,
        -globalCenter.z * scaleFactor,
      ],
    };
  }) as any[];
}
