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
  // Sphere
  // uses radius, segments
  // Cone
  radiusTop?: number;
  radiusBottom?: number;
  // Wedge / ramp
  angle?: number;
  // Torus
  tube?: number;
  // Plate / disc — flat cylinder, uses radius + thickness
}

export interface SceneModel {
  id: string;
  type: "gear" | "bracket" | "box" | "cylinder" | "sphere" | "cone" | "wedge" | "torus" | "tube" | "plate";
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
  onSelectModel: (id: string | null, additive?: boolean) => void;
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
        <SceneModelComponent key={m.id} model={m} isSelected={selectedModelIds.has(m.id)} onSelect={(e) => onSelectModel(m.id, e.ctrlKey || e.metaKey || e.shiftKey)} />
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
