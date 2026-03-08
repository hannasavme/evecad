import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, Float, Grid } from "@react-three/drei";
import { Suspense, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import * as THREE from "three";

export interface ModelParams {
  // Gear
  teeth?: number;
  holeDiameter?: number;
  thickness?: number;
  // Bracket
  armLength?: number;
  width?: number;
  hasHoles?: boolean;
  // Box
  height?: number;
  depth?: number;
  slots?: number;
  slotDirection?: "x" | "z";
  hollow?: boolean;
  wallThickness?: number;
  // Cylinder
  radius?: number;
  segments?: number;
  // Cone
  radiusTop?: number;
  radiusBottom?: number;
  // Wedge
  angle?: number;
  // Torus
  tube?: number;
  // Wheel compound
  spokes?: number;
  hubRadius?: number;
  treadDepth?: number;
  // Camera compound
  lensRadius?: number;
  bodyWidth?: number;
  bodyHeight?: number;
  bodyDepth?: number;
  // Antenna compound
  dishRadius?: number;
  mastHeight?: number;
  mastRadius?: number;
  // Drill compound
  bitLength?: number;
  bitRadius?: number;
  spirals?: number;
  // Track compound
  trackLength?: number;
  trackWidth?: number;
  wheelCount?: number;
  // Bolt/Screw
  headRadius?: number;
  headHeight?: number;
  shaftRadius?: number;
  shaftLength?: number;
  threadPitch?: number;
  // Nut
  nutRadius?: number;
  nutHeight?: number;
  boreRadius?: number;
  // Bearing
  outerRadius?: number;
  innerRadius?: number;
  bearingWidth?: number;
  ballCount?: number;
  // Pulley
  grooveDepth?: number;
  grooveWidth?: number;
  // Mug
  mugRadius?: number;
  mugHeight?: number;
  handleSize?: number;
  // Hammer
  handleLength?: number;
  handleRadius?: number;
  headWidth?: number;
  headSize?: number;
  // Handle/Knob
  knobRadius?: number;
  knobHeight?: number;
  stemRadius?: number;
  stemHeight?: number;
  // Chassis
  chassisLength?: number;
  chassisWidth?: number;
  chassisThickness?: number;
  mountHoles?: number;
  // Rocker
  rockerLength?: number;
  rockerWidth?: number;
  rockerThickness?: number;
  // Bogie
  bogieLength?: number;
  bogieWidth?: number;
  bogieThickness?: number;
  // Knuckle
  knuckleRadius?: number;
  knuckleHeight?: number;
  boreSize?: number;
  // Motor
  motorRadius?: number;
  motorLength?: number;
  shaftDiameter?: number;
  // Standoff
  standoffRadius?: number;
  standoffHeight?: number;
  threadRadius?: number;
}

export type PrimitiveType = "gear" | "bracket" | "box" | "cylinder" | "sphere" | "cone" | "wedge" | "torus" | "tube" | "plate" | "wheel" | "camera" | "antenna" | "drill" | "track" | "bolt" | "nut" | "screw" | "bearing" | "pulley" | "shaft" | "mug" | "hammer" | "handle" | "chassis" | "rocker" | "bogie" | "knuckle" | "motor" | "standoff";

export interface SceneModel {
  id: string;
  type: PrimitiveType;
  position: [number, number, number];
  rotation?: [number, number, number]; // degrees
  scale: [number, number, number];
  color: string;
  label: string;
  params?: ModelParams;
  visible?: boolean;
  group?: string;
}

export interface ModelViewerHandle {
  getScene: () => THREE.Scene | null;
  resetCamera: () => void;
}

interface ModelViewerProps {
  models: SceneModel[];
  selectedModelIds: Set<string>;
  onSelectModel: (id: string | null, additive?: boolean, rangeSelect?: boolean) => void;
}

function degToRad(d: number) { return (d * Math.PI) / 180; }

// ─── Mesh Components ──────────────────────────────────

function GearMesh({ color, params }: { color: string; params?: ModelParams }) {
  const teeth = params?.teeth || 16;
  const holeDiam = params?.holeDiameter ?? 0.35;
  const thickness = params?.thickness ?? 0.4;

  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    const innerR = 0.9;
    const toothDepth = 0.15;
    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const nextAngle = ((i + 1) / teeth) * Math.PI * 2;
      const m1 = angle + (nextAngle - angle) * 0.25;
      const m2 = angle + (nextAngle - angle) * 0.5;
      const m3 = angle + (nextAngle - angle) * 0.75;
      const r1 = innerR, r2 = 1.2 + toothDepth;
      if (i === 0) shape.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
      shape.lineTo(Math.cos(m1) * r2, Math.sin(m1) * r2);
      shape.lineTo(Math.cos(m2) * r2, Math.sin(m2) * r2);
      shape.lineTo(Math.cos(m3) * r1, Math.sin(m3) * r1);
      shape.lineTo(Math.cos(nextAngle) * r1, Math.sin(nextAngle) * r1);
    }
    if (holeDiam > 0) {
      const hole = new THREE.Path();
      hole.absellipse(0, 0, holeDiam, holeDiam, 0, Math.PI * 2, true, 0);
      shape.holes.push(hole);
    }
    return new THREE.ExtrudeGeometry(shape, {
      depth: thickness, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3,
    });
  }, [teeth, holeDiam, thickness]);

  return (
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
    </mesh>
  );
}

function BracketMesh({ color, params }: { color: string; params?: ModelParams }) {
  const armLen = params?.armLength ?? 1.0;
  const thick = params?.thickness ?? 0.2;
  const w = params?.width ?? 0.8;
  const hasHoles = params?.hasHoles ?? false;
  const baseW = armLen * 2;

  return (
    <group>
      <mesh><boxGeometry args={[baseW, thick, w]} /><meshStandardMaterial color={color} metalness={0.3} roughness={0.4} /></mesh>
      <mesh position={[-(baseW / 2 - thick / 2), armLen / 2, 0]}><boxGeometry args={[thick, armLen, w]} /><meshStandardMaterial color={color} metalness={0.3} roughness={0.4} /></mesh>
      <mesh position={[(baseW / 2 - thick / 2), armLen / 2, 0]}><boxGeometry args={[thick, armLen, w]} /><meshStandardMaterial color={color} metalness={0.3} roughness={0.4} /></mesh>
      {hasHoles && (
        <>
          <mesh position={[-(baseW / 4), thick / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.08, 0.08, thick + 0.02, 16]} /><meshStandardMaterial color="#333" metalness={0.5} roughness={0.3} /></mesh>
          <mesh position={[(baseW / 4), thick / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.08, 0.08, thick + 0.02, 16]} /><meshStandardMaterial color="#333" metalness={0.5} roughness={0.3} /></mesh>
        </>
      )}
    </group>
  );
}

function CylinderMesh({ color, params }: { color: string; params?: ModelParams }) {
  const r = params?.radius ?? 0.8;
  const h = params?.height ?? 1.5;
  const isHollow = params?.hollow ?? false;
  const wall = params?.wallThickness ?? 0.15;
  const seg = params?.segments ?? 32;

  return (
    <group>
      <mesh><cylinderGeometry args={[r, r, h, seg]} /><meshStandardMaterial color={color} metalness={0.3} roughness={0.4} /></mesh>
      {isHollow && (
        <mesh><cylinderGeometry args={[r - wall, r - wall, h + 0.02, seg]} /><meshStandardMaterial color="#1a1a2e" metalness={0.2} roughness={0.5} /></mesh>
      )}
    </group>
  );
}

function BoxMesh({ color, params }: { color: string; params?: ModelParams }) {
  const w = params?.width ?? 1.2;
  const h = params?.height ?? 1.2;
  const d = params?.depth ?? 1.2;
  const slotCount = params?.slots ?? 0;
  const slotDir = params?.slotDirection ?? "x";
  const isHollow = params?.hollow ?? false;
  const wall = params?.wallThickness ?? 0.1;

  const slotElements = useMemo(() => {
    if (slotCount <= 0) return null;
    const slots: JSX.Element[] = [];
    const slotW = slotDir === "x" ? w * 0.6 : 0.05;
    const slotD = slotDir === "z" ? d * 0.6 : 0.05;
    const slotH = 0.06;
    const spacing = h / (slotCount + 1);
    for (let i = 0; i < slotCount; i++) {
      const yPos = -h / 2 + spacing * (i + 1);
      slots.push(<mesh key={`sf${i}`} position={[0, yPos, d / 2 + 0.001]}><boxGeometry args={[slotW, slotH, 0.05]} /><meshStandardMaterial color="#1a1a2e" metalness={0.1} roughness={0.8} /></mesh>);
      slots.push(<mesh key={`sb${i}`} position={[0, yPos, -(d / 2 + 0.001)]}><boxGeometry args={[slotW, slotH, 0.05]} /><meshStandardMaterial color="#1a1a2e" metalness={0.1} roughness={0.8} /></mesh>);
    }
    return slots;
  }, [slotCount, slotDir, w, h, d]);

  return (
    <group>
      <mesh><boxGeometry args={[w, h, d]} /><meshStandardMaterial color={color} metalness={0.2} roughness={0.4} /></mesh>
      {isHollow && <mesh position={[0, wall, 0]}><boxGeometry args={[w - wall * 2, h, d - wall * 2]} /><meshStandardMaterial color="#1a1a2e" metalness={0.1} roughness={0.5} /></mesh>}
      {slotElements}
    </group>
  );
}

function SphereMesh({ color, params }: { color: string; params?: ModelParams }) {
  const r = params?.radius ?? 0.8;
  const seg = params?.segments ?? 32;
  return (
    <mesh><sphereGeometry args={[r, seg, seg]} /><meshStandardMaterial color={color} metalness={0.3} roughness={0.4} /></mesh>
  );
}

function ConeMesh({ color, params }: { color: string; params?: ModelParams }) {
  const rTop = params?.radiusTop ?? 0;
  const rBot = params?.radiusBottom ?? params?.radius ?? 0.8;
  const h = params?.height ?? 1.5;
  const seg = params?.segments ?? 32;
  return (
    <mesh><cylinderGeometry args={[rTop, rBot, h, seg]} /><meshStandardMaterial color={color} metalness={0.3} roughness={0.4} /></mesh>
  );
}

function WedgeMesh({ color, params }: { color: string; params?: ModelParams }) {
  const w = params?.width ?? 1.0;
  const h = params?.height ?? 0.8;
  const d = params?.depth ?? 1.5;

  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(d, 0);
    shape.lineTo(d, 0);
    shape.lineTo(0, h);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  }, [w, h, d]);

  return (
    <mesh geometry={geometry} position={[-d / 2, -h / 2, -w / 2]}>
      <meshStandardMaterial color={color} metalness={0.2} roughness={0.4} />
    </mesh>
  );
}

function TorusMesh({ color, params }: { color: string; params?: ModelParams }) {
  const r = params?.radius ?? 0.8;
  const tubeR = params?.tube ?? 0.15;
  const seg = params?.segments ?? 32;
  return (
    <mesh><torusGeometry args={[r, tubeR, 16, seg]} /><meshStandardMaterial color={color} metalness={0.3} roughness={0.4} /></mesh>
  );
}

function TubeMesh({ color, params }: { color: string; params?: ModelParams }) {
  const r = params?.radius ?? 0.5;
  const h = params?.height ?? 2.0;
  const wall = params?.wallThickness ?? 0.08;
  const seg = params?.segments ?? 32;
  return (
    <group>
      <mesh><cylinderGeometry args={[r, r, h, seg]} /><meshStandardMaterial color={color} metalness={0.3} roughness={0.4} transparent opacity={0.85} /></mesh>
      <mesh><cylinderGeometry args={[r - wall, r - wall, h + 0.01, seg]} /><meshStandardMaterial color="#1a1a2e" metalness={0.2} roughness={0.5} /></mesh>
    </group>
  );
}

function PlateMesh({ color, params }: { color: string; params?: ModelParams }) {
  const r = params?.radius ?? 1.0;
  const thick = params?.thickness ?? 0.05;
  const seg = params?.segments ?? 32;
  const w = params?.width;
  const d = params?.depth;

  if (w && d) {
    return <mesh><boxGeometry args={[w, thick, d]} /><meshStandardMaterial color={color} metalness={0.2} roughness={0.4} /></mesh>;
  }
  return <mesh><cylinderGeometry args={[r, r, thick, seg]} /><meshStandardMaterial color={color} metalness={0.2} roughness={0.4} /></mesh>;
}

// ─── Compound Detailed Primitives ──────────────────────────

function WheelMesh({ color, params }: { color: string; params?: ModelParams }) {
  const r = params?.radius ?? 0.4;
  const w = params?.width ?? 0.25;
  const spokes = params?.spokes ?? 6;
  const hubR = params?.hubRadius ?? r * 0.3;
  const treadD = params?.treadDepth ?? 0.04;
  const seg = params?.segments ?? 32;

  const treadGeometry = useMemo(() => {
    const treads: JSX.Element[] = [];
    const treadCount = 24;
    for (let i = 0; i < treadCount; i++) {
      const angle = (i / treadCount) * Math.PI * 2;
      treads.push(
        <mesh key={i} position={[Math.cos(angle) * (r - treadD / 2), Math.sin(angle) * (r - treadD / 2), 0]}
          rotation={[0, 0, angle]}>
          <boxGeometry args={[treadD * 2, treadD, w * 0.85]} />
          <meshStandardMaterial color="#333" metalness={0.6} roughness={0.3} />
        </mesh>
      );
    }
    return treads;
  }, [r, w, treadD]);

  const spokeElements = useMemo(() => {
    const elements: JSX.Element[] = [];
    for (let i = 0; i < spokes; i++) {
      const angle = (i / spokes) * Math.PI * 2;
      const spokeLen = r - hubR - 0.02;
      const cx = Math.cos(angle) * (hubR + spokeLen / 2);
      const cy = Math.sin(angle) * (hubR + spokeLen / 2);
      elements.push(
        <mesh key={i} position={[cx, cy, 0]} rotation={[0, 0, angle]}>
          <boxGeometry args={[spokeLen, r * 0.08, w * 0.3]} />
          <meshStandardMaterial color={color} metalness={0.5} roughness={0.3} />
        </mesh>
      );
    }
    return elements;
  }, [spokes, r, hubR, color, w]);

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {/* Outer tire */}
      <mesh><torusGeometry args={[r, w * 0.4, 16, seg]} /><meshStandardMaterial color="#555" metalness={0.4} roughness={0.6} /></mesh>
      {/* Inner rim */}
      <mesh><torusGeometry args={[r * 0.75, w * 0.12, 12, seg]} /><meshStandardMaterial color={color} metalness={0.6} roughness={0.2} /></mesh>
      {/* Hub */}
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[hubR, hubR, w * 0.5, seg]} /><meshStandardMaterial color={color} metalness={0.7} roughness={0.2} /></mesh>
      {/* Hub cap */}
      <mesh position={[0, 0, w * 0.25]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[hubR * 0.7, hubR * 0.7, 0.03, seg]} /><meshStandardMaterial color="#ddd" metalness={0.8} roughness={0.1} /></mesh>
      {/* Axle hole */}
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[hubR * 0.2, hubR * 0.2, w * 0.6, 12]} /><meshStandardMaterial color="#222" metalness={0.5} roughness={0.3} /></mesh>
      {/* Spokes */}
      {spokeElements}
      {/* Treads */}
      {treadGeometry}
    </group>
  );
}

function CameraMesh({ color, params }: { color: string; params?: ModelParams }) {
  const lensR = params?.lensRadius ?? 0.12;
  const bw = params?.bodyWidth ?? 0.3;
  const bh = params?.bodyHeight ?? 0.2;
  const bd = params?.bodyDepth ?? 0.25;

  return (
    <group>
      {/* Camera body */}
      <mesh><boxGeometry args={[bw, bh, bd]} /><meshStandardMaterial color={color} metalness={0.4} roughness={0.3} /></mesh>
      {/* Top detail strip */}
      <mesh position={[0, bh / 2 + 0.01, 0]}><boxGeometry args={[bw * 0.8, 0.02, bd * 0.6]} /><meshStandardMaterial color="#333" metalness={0.5} roughness={0.3} /></mesh>
      {/* Lens barrel */}
      <mesh position={[0, 0, bd / 2 + lensR * 0.8]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[lensR, lensR * 1.1, lensR * 1.6, 24]} />
        <meshStandardMaterial color="#222" metalness={0.6} roughness={0.2} />
      </mesh>
      {/* Lens glass */}
      <mesh position={[0, 0, bd / 2 + lensR * 1.8]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[lensR * 0.8, lensR * 0.8, 0.02, 24]} />
        <meshStandardMaterial color="#87CEEB" metalness={0.9} roughness={0.05} transparent opacity={0.7} />
      </mesh>
      {/* Lens ring */}
      <mesh position={[0, 0, bd / 2 + lensR * 1.6]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[lensR * 0.95, 0.01, 8, 24]} />
        <meshStandardMaterial color="#999" metalness={0.7} roughness={0.2} />
      </mesh>
      {/* Indicator LED */}
      <mesh position={[bw / 2 - 0.03, bh / 2 - 0.03, bd / 2 + 0.005]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshStandardMaterial color="#ff3333" emissive="#ff0000" emissiveIntensity={0.5} />
      </mesh>
      {/* Mounting bracket */}
      <mesh position={[0, -bh / 2 - 0.04, 0]}><cylinderGeometry args={[0.03, 0.04, 0.08, 12]} /><meshStandardMaterial color="#666" metalness={0.5} roughness={0.3} /></mesh>
    </group>
  );
}

function AntennaMesh({ color, params }: { color: string; params?: ModelParams }) {
  const dishR = params?.dishRadius ?? params?.radius ?? 0.5;
  const mastH = params?.mastHeight ?? params?.height ?? 1.2;
  const mastR = params?.mastRadius ?? 0.03;

  const dishGeometry = useMemo(() => {
    // Parabolic dish shape
    const points: THREE.Vector2[] = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = t * dishR;
      const y = (t * t) * dishR * 0.3; // parabolic curve
      points.push(new THREE.Vector2(x, y));
    }
    return new THREE.LatheGeometry(points, 32);
  }, [dishR]);

  return (
    <group>
      {/* Mast */}
      <mesh position={[0, mastH / 2, 0]}><cylinderGeometry args={[mastR, mastR * 1.3, mastH, 12]} /><meshStandardMaterial color="#888" metalness={0.6} roughness={0.3} /></mesh>
      {/* Mast joint */}
      <mesh position={[0, mastH, 0]}><sphereGeometry args={[mastR * 2.5, 12, 12]} /><meshStandardMaterial color="#666" metalness={0.5} roughness={0.3} /></mesh>
      {/* Dish */}
      <mesh geometry={dishGeometry} position={[0, mastH + dishR * 0.15, 0]} rotation={[Math.PI, 0, 0]}>
        <meshStandardMaterial color={color} metalness={0.7} roughness={0.2} side={THREE.DoubleSide} />
      </mesh>
      {/* Feed horn */}
      <mesh position={[0, mastH + dishR * 0.4, 0]}><cylinderGeometry args={[mastR * 0.8, mastR * 2, dishR * 0.15, 8]} /><meshStandardMaterial color="#555" metalness={0.6} roughness={0.3} /></mesh>
      {/* Feed support struts */}
      {[0, 120, 240].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const strutLen = dishR * 0.4;
        return (
          <mesh key={angle} position={[Math.cos(rad) * dishR * 0.35, mastH + dishR * 0.25, Math.sin(rad) * dishR * 0.35]}
            rotation={[Math.sin(rad) * 0.5, 0, -Math.cos(rad) * 0.5]}>
            <cylinderGeometry args={[mastR * 0.3, mastR * 0.3, strutLen, 6]} />
            <meshStandardMaterial color="#777" metalness={0.5} roughness={0.3} />
          </mesh>
        );
      })}
      {/* Base mount */}
      <mesh position={[0, -0.02, 0]}><cylinderGeometry args={[mastR * 4, mastR * 5, 0.04, 16]} /><meshStandardMaterial color="#666" metalness={0.4} roughness={0.4} /></mesh>
    </group>
  );
}

function DrillMesh({ color, params }: { color: string; params?: ModelParams }) {
  const bitLen = params?.bitLength ?? params?.height ?? 1.5;
  const bitR = params?.bitRadius ?? params?.radius ?? 0.12;
  const spirals = params?.spirals ?? 4;

  const spiralGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * spirals * Math.PI * 2;
      const r = bitR * (1 - t * 0.3); // taper
      points.push(new THREE.Vector3(Math.cos(angle) * r, -t * bitLen, Math.sin(angle) * r));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, steps, bitR * 0.12, 6, false);
  }, [bitLen, bitR, spirals]);

  return (
    <group>
      {/* Motor housing */}
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[bitR * 2.5, bitR * 2.5, 0.4, 16]} /><meshStandardMaterial color={color} metalness={0.4} roughness={0.3} /></mesh>
      {/* Housing top cap */}
      <mesh position={[0, 0.42, 0]}><cylinderGeometry args={[bitR * 2, bitR * 2.5, 0.04, 16]} /><meshStandardMaterial color="#555" metalness={0.5} roughness={0.3} /></mesh>
      {/* Chuck */}
      <mesh position={[0, -0.02, 0]}><cylinderGeometry args={[bitR * 1.8, bitR * 1.2, 0.12, 12]} /><meshStandardMaterial color="#444" metalness={0.6} roughness={0.2} /></mesh>
      {/* Drill bit core */}
      <mesh position={[0, -bitLen / 2 - 0.08, 0]}><cylinderGeometry args={[bitR * 0.4, bitR * 0.15, bitLen, 12]} /><meshStandardMaterial color="#999" metalness={0.8} roughness={0.15} /></mesh>
      {/* Spiral flutes */}
      <mesh geometry={spiralGeometry} position={[0, -0.08, 0]}>
        <meshStandardMaterial color="#bbb" metalness={0.7} roughness={0.2} />
      </mesh>
      {/* Drill tip */}
      <mesh position={[0, -bitLen - 0.08, 0]}><coneGeometry args={[bitR * 0.5, bitR * 1.5, 8]} /><meshStandardMaterial color="#ccc" metalness={0.8} roughness={0.15} /></mesh>
    </group>
  );
}

function TrackMesh({ color, params }: { color: string; params?: ModelParams }) {
  const trackLen = params?.trackLength ?? params?.width ?? 2.0;
  const trackW = params?.trackWidth ?? params?.depth ?? 0.3;
  const wheelCount = params?.wheelCount ?? 4;
  const wheelR = params?.radius ?? 0.2;

  const trackPads = useMemo(() => {
    const pads: JSX.Element[] = [];
    const padCount = Math.floor(trackLen * 8);
    const totalLen = trackLen + Math.PI * wheelR * 2;
    for (let i = 0; i < padCount; i++) {
      const t = i / padCount;
      const pos = t * totalLen;
      let x: number, y: number, rot: number;
      if (pos < trackLen / 2) {
        x = -trackLen / 2 + pos; y = -wheelR; rot = 0;
      } else if (pos < trackLen / 2 + Math.PI * wheelR) {
        const a = (pos - trackLen / 2) / wheelR;
        x = trackLen / 2 + Math.sin(a) * wheelR;
        y = -wheelR + wheelR - Math.cos(a) * wheelR;
        rot = a;
      } else if (pos < trackLen + Math.PI * wheelR) {
        x = trackLen / 2 - (pos - trackLen / 2 - Math.PI * wheelR);
        y = wheelR; rot = Math.PI;
      } else {
        const a = (pos - trackLen - Math.PI * wheelR) / wheelR;
        x = -trackLen / 2 - Math.sin(a) * wheelR;
        y = wheelR - wheelR + Math.cos(a) * wheelR;
        rot = Math.PI + a;
      }
      pads.push(
        <mesh key={i} position={[x, y, 0]} rotation={[0, 0, rot]}>
          <boxGeometry args={[0.06, 0.03, trackW]} />
          <meshStandardMaterial color="#444" metalness={0.5} roughness={0.4} />
        </mesh>
      );
    }
    return pads;
  }, [trackLen, trackW, wheelR]);

  return (
    <group>
      {/* Track wheels */}
      {Array.from({ length: wheelCount }).map((_, i) => {
        const x = -trackLen / 2 + (trackLen / (wheelCount - 1)) * i;
        return (
          <group key={i} position={[x, -wheelR, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[wheelR * 0.8, wheelR * 0.8, trackW * 0.7, 16]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[wheelR * 0.6, 0.02, 8, 16]} /><meshStandardMaterial color="#666" metalness={0.6} roughness={0.2} /></mesh>
          </group>
        );
      })}
      {/* Top/bottom track bands */}
      <mesh position={[0, -wheelR, 0]}><boxGeometry args={[trackLen, 0.025, trackW]} /><meshStandardMaterial color="#333" metalness={0.4} roughness={0.5} /></mesh>
      <mesh position={[0, wheelR, 0]}><boxGeometry args={[trackLen, 0.025, trackW]} /><meshStandardMaterial color="#333" metalness={0.4} roughness={0.5} /></mesh>
      {/* Drive sprocket (front) */}
      <mesh position={[trackLen / 2, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[wheelR, wheelR, trackW * 0.8, 16]} /><meshStandardMaterial color={color} metalness={0.6} roughness={0.2} /></mesh>
      {/* Idler (rear) */}
      <mesh position={[-trackLen / 2, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[wheelR * 0.9, wheelR * 0.9, trackW * 0.8, 16]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
      {/* Track pads */}
      {trackPads}
    </group>
  );
}

// ─── Standard Mechanical Compound Primitives ──────────────

function BoltMesh({ color, params }: { color: string; params?: ModelParams }) {
  const headR = params?.headRadius ?? 0.3;
  const headH = params?.headHeight ?? 0.15;
  const shaftR = params?.shaftRadius ?? 0.12;
  const shaftL = params?.shaftLength ?? 1.0;
  const pitch = params?.threadPitch ?? 0.1;
  const seg = params?.segments ?? 6; // hex head

  const threadGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const steps = Math.floor(shaftL / pitch) * 12;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * Math.floor(shaftL / pitch) * Math.PI * 2;
      const r = shaftR * 1.15;
      points.push(new THREE.Vector3(Math.cos(angle) * r, -t * shaftL, Math.sin(angle) * r));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, steps, shaftR * 0.08, 4, false);
  }, [shaftR, shaftL, pitch]);

  return (
    <group>
      {/* Hex head */}
      <mesh position={[0, headH / 2, 0]}><cylinderGeometry args={[headR, headR, headH, seg]} /><meshStandardMaterial color={color} metalness={0.7} roughness={0.2} flatShading /></mesh>
      {/* Head chamfer */}
      <mesh position={[0, headH, 0]}><cylinderGeometry args={[headR * 0.85, headR, 0.02, seg]} /><meshStandardMaterial color={color} metalness={0.7} roughness={0.2} flatShading /></mesh>
      {/* Shaft */}
      <mesh position={[0, -shaftL / 2, 0]}><cylinderGeometry args={[shaftR, shaftR, shaftL, 16]} /><meshStandardMaterial color={color} metalness={0.6} roughness={0.25} /></mesh>
      {/* Thread spiral */}
      <mesh geometry={threadGeometry}><meshStandardMaterial color={color} metalness={0.65} roughness={0.2} /></mesh>
      {/* Tip chamfer */}
      <mesh position={[0, -shaftL - 0.03, 0]}><coneGeometry args={[shaftR, 0.06, 16]} /><meshStandardMaterial color={color} metalness={0.6} roughness={0.25} /></mesh>
    </group>
  );
}

function NutMesh({ color, params }: { color: string; params?: ModelParams }) {
  const r = params?.nutRadius ?? params?.radius ?? 0.3;
  const h = params?.nutHeight ?? params?.height ?? 0.2;
  const bore = params?.boreRadius ?? r * 0.4;

  return (
    <group>
      {/* Hex body */}
      <mesh><cylinderGeometry args={[r, r, h, 6]} /><meshStandardMaterial color={color} metalness={0.7} roughness={0.2} flatShading /></mesh>
      {/* Top chamfer */}
      <mesh position={[0, h / 2 + 0.01, 0]}><cylinderGeometry args={[r * 0.85, r, 0.02, 6]} /><meshStandardMaterial color={color} metalness={0.7} roughness={0.2} flatShading /></mesh>
      {/* Bottom chamfer */}
      <mesh position={[0, -h / 2 - 0.01, 0]}><cylinderGeometry args={[r, r * 0.85, 0.02, 6]} /><meshStandardMaterial color={color} metalness={0.7} roughness={0.2} flatShading /></mesh>
      {/* Bore hole */}
      <mesh><cylinderGeometry args={[bore, bore, h + 0.05, 16]} /><meshStandardMaterial color="#222" metalness={0.5} roughness={0.3} /></mesh>
      {/* Thread rings inside */}
      {Array.from({ length: Math.floor(h / 0.06) }).map((_, i) => (
        <mesh key={i} position={[0, -h / 2 + 0.03 + i * 0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[bore * 1.05, 0.008, 4, 16]} />
          <meshStandardMaterial color="#555" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function ScrewMesh({ color, params }: { color: string; params?: ModelParams }) {
  const headR = params?.headRadius ?? 0.2;
  const headH = params?.headHeight ?? 0.08;
  const shaftR = params?.shaftRadius ?? 0.08;
  const shaftL = params?.shaftLength ?? 0.8;

  return (
    <group>
      {/* Flat/Phillips head */}
      <mesh position={[0, headH / 2, 0]}><cylinderGeometry args={[headR, headR, headH, 24]} /><meshStandardMaterial color={color} metalness={0.7} roughness={0.2} /></mesh>
      {/* Phillips cross slot */}
      <mesh position={[0, headH + 0.001, 0]}><boxGeometry args={[headR * 1.2, 0.015, headR * 0.15]} /><meshStandardMaterial color="#333" metalness={0.5} roughness={0.3} /></mesh>
      <mesh position={[0, headH + 0.001, 0]}><boxGeometry args={[headR * 0.15, 0.015, headR * 1.2]} /><meshStandardMaterial color="#333" metalness={0.5} roughness={0.3} /></mesh>
      {/* Shaft */}
      <mesh position={[0, -shaftL / 2, 0]}><cylinderGeometry args={[shaftR, shaftR * 0.6, shaftL, 16]} /><meshStandardMaterial color={color} metalness={0.6} roughness={0.25} /></mesh>
      {/* Thread ridges */}
      {Array.from({ length: Math.floor(shaftL / 0.05) }).map((_, i) => (
        <mesh key={i} position={[0, -i * 0.05 - 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[shaftR * 1.1 * (1 - i * 0.01), 0.006, 4, 16]} />
          <meshStandardMaterial color={color} metalness={0.65} roughness={0.2} />
        </mesh>
      ))}
      {/* Pointed tip */}
      <mesh position={[0, -shaftL - 0.04, 0]}><coneGeometry args={[shaftR * 0.6, 0.08, 16]} /><meshStandardMaterial color={color} metalness={0.6} roughness={0.25} /></mesh>
    </group>
  );
}

function BearingMesh({ color, params }: { color: string; params?: ModelParams }) {
  const outerR = params?.outerRadius ?? params?.radius ?? 0.5;
  const innerR = params?.innerRadius ?? outerR * 0.4;
  const w = params?.bearingWidth ?? params?.width ?? 0.2;
  const ballCount = params?.ballCount ?? 8;
  const ballR = (outerR - innerR) * 0.25;
  const raceR = (outerR + innerR) / 2;

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {/* Outer ring */}
      <mesh><torusGeometry args={[outerR, w * 0.35, 16, 32]} /><meshStandardMaterial color={color} metalness={0.8} roughness={0.15} /></mesh>
      {/* Inner ring */}
      <mesh><torusGeometry args={[innerR, w * 0.3, 16, 32]} /><meshStandardMaterial color={color} metalness={0.8} roughness={0.15} /></mesh>
      {/* Balls */}
      {Array.from({ length: ballCount }).map((_, i) => {
        const angle = (i / ballCount) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(angle) * raceR, Math.sin(angle) * raceR, 0]}>
            <sphereGeometry args={[ballR, 16, 16]} />
            <meshStandardMaterial color="#ddd" metalness={0.9} roughness={0.05} />
          </mesh>
        );
      })}
      {/* Cage ring */}
      <mesh><torusGeometry args={[raceR, 0.008, 8, 32]} /><meshStandardMaterial color="#c9a84c" metalness={0.6} roughness={0.3} /></mesh>
      {/* Bore */}
      <mesh><cylinderGeometry args={[innerR * 0.85, innerR * 0.85, w * 0.6, 24]} /><meshStandardMaterial color="#333" metalness={0.5} roughness={0.3} /></mesh>
    </group>
  );
}

function PulleyMesh({ color, params }: { color: string; params?: ModelParams }) {
  const r = params?.radius ?? 0.5;
  const w = params?.width ?? 0.3;
  const grooveD = params?.grooveDepth ?? 0.08;
  const grooveW = params?.grooveWidth ?? w * 0.4;
  const hubR = params?.hubRadius ?? r * 0.25;

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {/* Outer flange left */}
      <mesh position={[0, 0, w / 2]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[r, r, 0.03, 32]} /><meshStandardMaterial color={color} metalness={0.6} roughness={0.25} /></mesh>
      {/* Outer flange right */}
      <mesh position={[0, 0, -w / 2]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[r, r, 0.03, 32]} /><meshStandardMaterial color={color} metalness={0.6} roughness={0.25} /></mesh>
      {/* Groove body */}
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[r - grooveD, r - grooveD, grooveW, 32]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
      {/* Hub */}
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[hubR, hubR, w, 16]} /><meshStandardMaterial color="#888" metalness={0.6} roughness={0.25} /></mesh>
      {/* Spokes */}
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const spokeLen = (r - grooveD) - hubR;
        return (
          <mesh key={deg} position={[Math.cos(rad) * (hubR + spokeLen / 2), Math.sin(rad) * (hubR + spokeLen / 2), 0]}>
            <boxGeometry args={[spokeLen, r * 0.06, w * 0.4]} />
            <meshStandardMaterial color={color} metalness={0.5} roughness={0.3} />
          </mesh>
        );
      })}
      {/* Bore */}
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[hubR * 0.4, hubR * 0.4, w + 0.02, 12]} /><meshStandardMaterial color="#222" metalness={0.5} roughness={0.3} /></mesh>
    </group>
  );
}

function ShaftMesh({ color, params }: { color: string; params?: ModelParams }) {
  const r = params?.radius ?? params?.shaftRadius ?? 0.1;
  const h = params?.height ?? params?.shaftLength ?? 2.0;

  return (
    <group>
      {/* Main shaft */}
      <mesh><cylinderGeometry args={[r, r, h, 24]} /><meshStandardMaterial color={color} metalness={0.7} roughness={0.2} /></mesh>
      {/* Keyway slot */}
      <mesh position={[r * 0.7, 0, 0]}><boxGeometry args={[r * 0.3, h * 0.6, r * 0.3]} /><meshStandardMaterial color="#555" metalness={0.5} roughness={0.3} /></mesh>
      {/* Chamfer top */}
      <mesh position={[0, h / 2 + 0.01, 0]}><coneGeometry args={[r, 0.03, 24]} /><meshStandardMaterial color={color} metalness={0.7} roughness={0.2} /></mesh>
      {/* Chamfer bottom */}
      <mesh position={[0, -h / 2 - 0.01, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[r, 0.03, 24]} /><meshStandardMaterial color={color} metalness={0.7} roughness={0.2} /></mesh>
    </group>
  );
}

function MugMesh({ color, params }: { color: string; params?: ModelParams }) {
  const r = params?.mugRadius ?? params?.radius ?? 0.5;
  const h = params?.mugHeight ?? params?.height ?? 0.8;
  const handleS = params?.handleSize ?? 0.3;
  const wall = params?.wallThickness ?? 0.04;

  return (
    <group>
      {/* Outer body */}
      <mesh position={[0, h / 2, 0]}><cylinderGeometry args={[r, r * 0.9, h, 32]} /><meshStandardMaterial color={color} metalness={0.3} roughness={0.5} /></mesh>
      {/* Inner cavity */}
      <mesh position={[0, h / 2 + wall, 0]}><cylinderGeometry args={[r - wall, r * 0.9 - wall, h - wall, 32]} /><meshStandardMaterial color="#f5f0e8" metalness={0.1} roughness={0.6} /></mesh>
      {/* Bottom */}
      <mesh position={[0, wall / 2, 0]}><cylinderGeometry args={[r * 0.9 - wall, r * 0.9 - wall, wall, 32]} /><meshStandardMaterial color={color} metalness={0.3} roughness={0.5} /></mesh>
      {/* Handle */}
      <mesh position={[r + handleS * 0.4, h * 0.55, 0]} rotation={[0, 0, 0]}>
        <torusGeometry args={[handleS, handleS * 0.15, 8, 16, Math.PI]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.5} />
      </mesh>
      {/* Rim highlight */}
      <mesh position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[r, wall * 0.6, 8, 32]} /><meshStandardMaterial color={color} metalness={0.4} roughness={0.4} /></mesh>
    </group>
  );
}

function HammerMesh({ color, params }: { color: string; params?: ModelParams }) {
  const handleL = params?.handleLength ?? params?.height ?? 1.5;
  const handleR = params?.handleRadius ?? 0.06;
  const headW = params?.headWidth ?? params?.width ?? 0.6;
  const headS = params?.headSize ?? 0.18;

  return (
    <group>
      {/* Handle */}
      <mesh position={[0, -handleL / 2, 0]}><cylinderGeometry args={[handleR, handleR * 1.2, handleL, 12]} /><meshStandardMaterial color="#8B6914" metalness={0.2} roughness={0.7} /></mesh>
      {/* Handle grip rings */}
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh key={i} position={[0, -handleL + 0.15 + i * 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[handleR * 1.3, 0.008, 6, 12]} />
          <meshStandardMaterial color="#654321" metalness={0.2} roughness={0.6} />
        </mesh>
      ))}
      {/* Head body */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[headS, headS, headW, 16]} /><meshStandardMaterial color={color} metalness={0.7} roughness={0.2} /></mesh>
      {/* Flat striking face */}
      <mesh position={[headW / 2 + 0.01, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[headS * 0.95, headS * 0.95, 0.02, 16]} /><meshStandardMaterial color="#ccc" metalness={0.8} roughness={0.1} /></mesh>
      {/* Peen (ball end) */}
      <mesh position={[-headW / 2 - headS * 0.3, 0, 0]}><sphereGeometry args={[headS * 0.7, 12, 12]} /><meshStandardMaterial color={color} metalness={0.7} roughness={0.2} /></mesh>
      {/* Wedge insert */}
      <mesh position={[0, headS * 0.6, 0]}><boxGeometry args={[0.02, headS * 0.3, 0.02]} /><meshStandardMaterial color="#aa8833" metalness={0.5} roughness={0.4} /></mesh>
    </group>
  );
}

function HandleMesh({ color, params }: { color: string; params?: ModelParams }) {
  const knobR = params?.knobRadius ?? params?.radius ?? 0.2;
  const knobH = params?.knobHeight ?? 0.15;
  const stemR = params?.stemRadius ?? knobR * 0.3;
  const stemH = params?.stemHeight ?? params?.height ?? 0.4;

  return (
    <group>
      {/* Knob top */}
      <mesh position={[0, stemH + knobH / 2, 0]}><sphereGeometry args={[knobR, 16, 16]} /><meshStandardMaterial color={color} metalness={0.4} roughness={0.4} /></mesh>
      {/* Knob ring */}
      <mesh position={[0, stemH, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[knobR * 0.8, knobR * 0.08, 8, 24]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
      {/* Stem */}
      <mesh position={[0, stemH / 2, 0]}><cylinderGeometry args={[stemR, stemR * 1.1, stemH, 16]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
      {/* Base flange */}
      <mesh position={[0, -0.02, 0]}><cylinderGeometry args={[stemR * 2.5, stemR * 2.5, 0.04, 16]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
      {/* Screw indicator */}
      <mesh position={[0, -0.05, 0]}><cylinderGeometry args={[stemR * 0.4, stemR * 0.4, 0.03, 8]} /><meshStandardMaterial color="#555" metalness={0.6} roughness={0.3} /></mesh>
    </group>
  );
}

// ─── Rover Compound Primitives ──────────────────────────

function ChassisMesh({ color, params }: { color: string; params?: ModelParams }) {
  const l = params?.chassisLength ?? params?.depth ?? 3.0;
  const w = params?.chassisWidth ?? params?.width ?? 2.0;
  const t = params?.chassisThickness ?? params?.thickness ?? 0.15;
  const holes = params?.mountHoles ?? 8;

  const holeElements = useMemo(() => {
    const els: JSX.Element[] = [];
    const cols = Math.ceil(holes / 2);
    for (let i = 0; i < holes; i++) {
      const row = i % 2;
      const col = Math.floor(i / 2);
      const hx = -w * 0.35 + (row * w * 0.7);
      const hz = -l * 0.4 + col * (l * 0.8 / Math.max(cols - 1, 1));
      els.push(
        <mesh key={i} position={[hx, t / 2 + 0.001, hz]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.06, t + 0.01, 12]} />
          <meshStandardMaterial color="#333" metalness={0.5} roughness={0.3} />
        </mesh>
      );
    }
    return els;
  }, [holes, w, l, t]);

  return (
    <group>
      {/* Main plate */}
      <mesh position={[0, t / 2, 0]}><boxGeometry args={[w, t, l]} /><meshStandardMaterial color={color} metalness={0.4} roughness={0.4} /></mesh>
      {/* Raised edge rails */}
      <mesh position={[-w / 2 + 0.05, t + 0.04, 0]}><boxGeometry args={[0.1, 0.08, l * 0.9]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
      <mesh position={[w / 2 - 0.05, t + 0.04, 0]}><boxGeometry args={[0.1, 0.08, l * 0.9]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
      {/* Cross braces */}
      <mesh position={[0, -0.03, l * 0.25]}><boxGeometry args={[w * 0.8, 0.04, 0.08]} /><meshStandardMaterial color={color} metalness={0.4} roughness={0.4} /></mesh>
      <mesh position={[0, -0.03, -l * 0.25]}><boxGeometry args={[w * 0.8, 0.04, 0.08]} /><meshStandardMaterial color={color} metalness={0.4} roughness={0.4} /></mesh>
      {/* Corner gussets */}
      {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (w / 2 - 0.08), t / 2, sz * (l / 2 - 0.08)]}>
          <boxGeometry args={[0.15, t + 0.02, 0.15]} />
          <meshStandardMaterial color={color} metalness={0.5} roughness={0.3} />
        </mesh>
      ))}
      {/* Mount holes */}
      {holeElements}
    </group>
  );
}

function RockerMesh({ color, params }: { color: string; params?: ModelParams }) {
  const l = params?.rockerLength ?? params?.armLength ?? 2.0;
  const w = params?.rockerWidth ?? params?.width ?? 0.3;
  const t = params?.rockerThickness ?? params?.thickness ?? 0.12;

  return (
    <group>
      {/* Main arm beam */}
      <mesh><boxGeometry args={[w, t, l]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
      {/* Reinforcement rib */}
      <mesh position={[0, t / 2 + 0.02, 0]}><boxGeometry args={[w * 0.3, 0.04, l * 0.8]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
      {/* Pivot joint at differential end */}
      <mesh position={[0, 0, -l / 2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[t * 0.8, t * 0.8, w * 1.3, 16]} />
        <meshStandardMaterial color="#999" metalness={0.7} roughness={0.2} />
      </mesh>
      {/* Pivot bore */}
      <mesh position={[0, 0, -l / 2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[t * 0.25, t * 0.25, w * 1.4, 12]} />
        <meshStandardMaterial color="#333" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Bogie pivot at wheel end */}
      <mesh position={[0, 0, l / 2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[t * 0.6, t * 0.6, w * 1.1, 16]} />
        <meshStandardMaterial color="#999" metalness={0.7} roughness={0.2} />
      </mesh>
      {/* Bogie bore */}
      <mesh position={[0, 0, l / 2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[t * 0.2, t * 0.2, w * 1.2, 12]} />
        <meshStandardMaterial color="#333" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Middle wheel mount point */}
      <mesh position={[0, -t / 2 - 0.05, l * 0.15]}>
        <cylinderGeometry args={[t * 0.5, t * 0.5, 0.1, 12]} />
        <meshStandardMaterial color="#888" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

function BogieMesh({ color, params }: { color: string; params?: ModelParams }) {
  const l = params?.bogieLength ?? params?.armLength ?? 1.2;
  const w = params?.bogieWidth ?? params?.width ?? 0.25;
  const t = params?.bogieThickness ?? params?.thickness ?? 0.1;

  return (
    <group>
      {/* Main arm */}
      <mesh><boxGeometry args={[w, t, l]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
      {/* Pivot joint center */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[t * 0.7, t * 0.7, w * 1.2, 16]} />
        <meshStandardMaterial color="#999" metalness={0.7} roughness={0.2} />
      </mesh>
      {/* Wheel mount - front */}
      <mesh position={[0, -t / 2 - 0.04, l / 2 - 0.05]}>
        <cylinderGeometry args={[t * 0.45, t * 0.45, 0.08, 12]} />
        <meshStandardMaterial color="#888" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Wheel mount - rear */}
      <mesh position={[0, -t / 2 - 0.04, -l / 2 + 0.05]}>
        <cylinderGeometry args={[t * 0.45, t * 0.45, 0.08, 12]} />
        <meshStandardMaterial color="#888" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Side plates */}
      <mesh position={[w / 2 + 0.01, 0, 0]}><boxGeometry args={[0.02, t * 1.5, l * 0.6]} /><meshStandardMaterial color={color} metalness={0.4} roughness={0.4} /></mesh>
      <mesh position={[-w / 2 - 0.01, 0, 0]}><boxGeometry args={[0.02, t * 1.5, l * 0.6]} /><meshStandardMaterial color={color} metalness={0.4} roughness={0.4} /></mesh>
    </group>
  );
}

function KnuckleMesh({ color, params }: { color: string; params?: ModelParams }) {
  const r = params?.knuckleRadius ?? params?.radius ?? 0.2;
  const h = params?.knuckleHeight ?? params?.height ?? 0.4;
  const bore = params?.boreSize ?? r * 0.35;

  return (
    <group>
      {/* Main housing */}
      <mesh><cylinderGeometry args={[r, r * 1.1, h, 20]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
      {/* Steering bore (vertical) */}
      <mesh><cylinderGeometry args={[bore, bore, h + 0.02, 12]} /><meshStandardMaterial color="#333" metalness={0.5} roughness={0.3} /></mesh>
      {/* Axle bore (horizontal) */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[bore * 0.8, bore * 0.8, r * 2.5, 12]} />
        <meshStandardMaterial color="#444" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Top flange */}
      <mesh position={[0, h / 2, 0]}><cylinderGeometry args={[r * 1.3, r, 0.05, 20]} /><meshStandardMaterial color={color} metalness={0.6} roughness={0.2} /></mesh>
      {/* Bottom flange */}
      <mesh position={[0, -h / 2, 0]}><cylinderGeometry args={[r, r * 1.3, 0.05, 20]} /><meshStandardMaterial color={color} metalness={0.6} roughness={0.2} /></mesh>
      {/* Mounting ears */}
      <mesh position={[r * 1.1, h * 0.15, 0]}><boxGeometry args={[0.08, h * 0.4, r * 0.5]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
      <mesh position={[-r * 1.1, h * 0.15, 0]}><boxGeometry args={[0.08, h * 0.4, r * 0.5]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
      {/* Bolt holes on ears */}
      <mesh position={[r * 1.1, h * 0.15, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.025, 0.025, 0.1, 8]} />
        <meshStandardMaterial color="#222" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[-r * 1.1, h * 0.15, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.025, 0.025, 0.1, 8]} />
        <meshStandardMaterial color="#222" metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  );
}

function MotorMesh({ color, params }: { color: string; params?: ModelParams }) {
  const r = params?.motorRadius ?? params?.radius ?? 0.2;
  const l = params?.motorLength ?? params?.height ?? 0.6;
  const sr = params?.shaftDiameter ? params.shaftDiameter / 2 : r * 0.15;

  return (
    <group>
      {/* Motor body */}
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[r, r, l, 24]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
      {/* Gearbox housing */}
      <mesh position={[0, 0, l / 2 + r * 0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[r * 1.8, r * 1.0, r * 1.8]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.4} />
      </mesh>
      {/* Output shaft */}
      <mesh position={[0, 0, l / 2 + r * 1.0 + sr]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[sr, sr, r * 0.8, 12]} />
        <meshStandardMaterial color="#aaa" metalness={0.8} roughness={0.1} />
      </mesh>
      {/* Shaft flat */}
      <mesh position={[sr * 0.8, 0, l / 2 + r * 1.0 + sr]}>
        <boxGeometry args={[sr * 0.3, sr * 1.5, r * 0.7]} />
        <meshStandardMaterial color="#888" metalness={0.7} roughness={0.2} />
      </mesh>
      {/* Rear cap */}
      <mesh position={[0, 0, -l / 2 - 0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r * 0.9, r * 0.9, 0.04, 24]} />
        <meshStandardMaterial color="#777" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Terminals */}
      <mesh position={[r * 0.3, r * 0.5, -l * 0.3]}><boxGeometry args={[0.04, 0.15, 0.04]} /><meshStandardMaterial color="#c4a000" metalness={0.8} roughness={0.2} /></mesh>
      <mesh position={[-r * 0.3, r * 0.5, -l * 0.3]}><boxGeometry args={[0.04, 0.15, 0.04]} /><meshStandardMaterial color="#c4a000" metalness={0.8} roughness={0.2} /></mesh>
      {/* Mount tabs */}
      <mesh position={[r + 0.02, 0, 0]}><boxGeometry args={[0.06, 0.04, l * 0.15]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
      <mesh position={[-r - 0.02, 0, 0]}><boxGeometry args={[0.06, 0.04, l * 0.15]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.3} /></mesh>
    </group>
  );
}

function StandoffMesh({ color, params }: { color: string; params?: ModelParams }) {
  const r = params?.standoffRadius ?? params?.radius ?? 0.08;
  const h = params?.standoffHeight ?? params?.height ?? 0.4;
  const tr = params?.threadRadius ?? r * 0.4;

  return (
    <group>
      {/* Main hex body */}
      <mesh><cylinderGeometry args={[r, r, h, 6]} /><meshStandardMaterial color={color} metalness={0.7} roughness={0.2} /></mesh>
      {/* Top thread */}
      <mesh position={[0, h / 2 + 0.06, 0]}><cylinderGeometry args={[tr, tr, 0.12, 12]} /><meshStandardMaterial color="#aaa" metalness={0.8} roughness={0.1} /></mesh>
      {/* Bottom thread */}
      <mesh position={[0, -h / 2 - 0.06, 0]}><cylinderGeometry args={[tr, tr, 0.12, 12]} /><meshStandardMaterial color="#aaa" metalness={0.8} roughness={0.1} /></mesh>
      {/* Thread grooves top */}
      {Array.from({ length: 3 }).map((_, i) => (
        <mesh key={`t${i}`} position={[0, h / 2 + 0.02 + i * 0.035, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[tr, 0.005, 4, 12]} />
          <meshStandardMaterial color="#888" metalness={0.7} roughness={0.2} />
        </mesh>
      ))}
      {/* Thread grooves bottom */}
      {Array.from({ length: 3 }).map((_, i) => (
        <mesh key={`b${i}`} position={[0, -h / 2 - 0.02 - i * 0.035, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[tr, 0.005, 4, 12]} />
          <meshStandardMaterial color="#888" metalness={0.7} roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

const meshMap: Record<string, React.FC<{ color: string; params?: ModelParams }>> = {
  gear: GearMesh,
  bracket: BracketMesh,
  box: BoxMesh,
  cylinder: CylinderMesh,
  sphere: SphereMesh,
  cone: ConeMesh,
  wedge: WedgeMesh,
  torus: TorusMesh,
  tube: TubeMesh,
  plate: PlateMesh,
  wheel: WheelMesh,
  camera: CameraMesh,
  antenna: AntennaMesh,
  drill: DrillMesh,
  track: TrackMesh,
  bolt: BoltMesh,
  nut: NutMesh,
  screw: ScrewMesh,
  bearing: BearingMesh,
  pulley: PulleyMesh,
  shaft: ShaftMesh,
  mug: MugMesh,
  hammer: HammerMesh,
  handle: HandleMesh,
  chassis: ChassisMesh,
  rocker: RockerMesh,
  bogie: BogieMesh,
  knuckle: KnuckleMesh,
  motor: MotorMesh,
  standoff: StandoffMesh,
};

// ─── Scene Components ──────────────────────────────────

function ImportedMesh({ model }: { model: any }) {
  const geo = model._importedGeometry as THREE.BufferGeometry;
  const s = model._importedScale as number;
  const c = model._importedCenter as [number, number, number];
  return (
    <group scale={[s, s, s]} position={c}>
      <mesh geometry={geo}>
        <meshStandardMaterial color={model.color} metalness={0.3} roughness={0.4} />
      </mesh>
    </group>
  );
}

function SceneModelComponent({ model, isSelected, onSelect }: { model: SceneModel; isSelected: boolean; onSelect: (e: MouseEvent) => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const MeshComp = meshMap[model.type] || BoxMesh;
  const rot = model.rotation || [0, 0, 0];
  const isImported = !!(model as any)._importedGeometry;

  return (
    <group
      ref={groupRef}
      position={model.position}
      rotation={[degToRad(rot[0]), degToRad(rot[1]), degToRad(rot[2])]}
      scale={model.scale}
      onClick={(e) => { e.stopPropagation(); onSelect(e.nativeEvent); }}
    >
      {isImported ? <ImportedMesh model={model} /> : <MeshComp color={model.color} params={model.params} />}
      {isSelected && (
        <mesh><sphereGeometry args={[2, 16, 16]} /><meshBasicMaterial color="#f9a8d4" transparent opacity={0.05} wireframe /></mesh>
      )}
    </group>
  );
}

function SceneCapture({ onSceneReady, onControlsReady }: { onSceneReady: (scene: THREE.Scene) => void; onControlsReady: (reset: () => void) => void }) {
  const { scene, camera } = useThree();
  useEffect(() => { onSceneReady(scene); }, [scene, onSceneReady]);
  useEffect(() => {
    onControlsReady(() => { camera.position.set(4, 3, 4); camera.lookAt(0, 0, 0); });
  }, [camera, onControlsReady]);
  return null;
}

function Scene({ models, selectedModelIds, onSelectModel }: ModelViewerProps) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <pointLight position={[-5, 3, -5]} intensity={0.4} color="#f9a8d4" />
      <pointLight position={[5, 2, 3]} intensity={0.3} color="#a5f3fc" />

      {models.filter(m => m.visible !== false).map((m) => (
        <SceneModelComponent key={m.id} model={m} isSelected={selectedModelIds.has(m.id)} onSelect={(e) => onSelectModel(m.id, e.ctrlKey || e.metaKey, e.shiftKey)} />
      ))}

      {models.length === 0 && (
        <Float speed={2} rotationIntensity={0.5} floatIntensity={0.8}>
          <mesh position={[0, 0.5, 0]}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#f9a8d4" metalness={0.2} roughness={0.3} wireframe /></mesh>
        </Float>
      )}

      <Grid position={[0, -0.1, 0]} args={[200, 200]} cellSize={1} cellThickness={0.5} cellColor="#f0abfc" sectionSize={5} sectionThickness={1} sectionColor="#e9d5ff" fadeDistance={80} fadeStrength={1.5} infiniteGrid />
      <Environment preset="apartment" />
      <OrbitControls enablePan enableZoom enableRotate autoRotate={models.length === 0} autoRotateSpeed={1.5} />
    </>
  );
}

const ModelViewer = forwardRef<ModelViewerHandle, ModelViewerProps>(
  ({ models, selectedModelIds, onSelectModel }, ref) => {
    const sceneRef = useRef<THREE.Scene | null>(null);
    const resetRef = useRef<(() => void) | null>(null);

    useImperativeHandle(ref, () => ({
      getScene: () => sceneRef.current,
      resetCamera: () => resetRef.current?.(),
    }));

    return (
      <div className="w-full h-full">
        <Canvas camera={{ position: [4, 3, 4], fov: 50 }} shadows onPointerMissed={() => onSelectModel(null)}>
          <Suspense fallback={null}>
            <SceneCapture onSceneReady={(s) => { sceneRef.current = s; }} onControlsReady={(fn) => { resetRef.current = fn; }} />
            <Scene models={models} selectedModelIds={selectedModelIds} onSelectModel={onSelectModel} />
          </Suspense>
        </Canvas>
      </div>
    );
  }
);

ModelViewer.displayName = "ModelViewer";
export default ModelViewer;
