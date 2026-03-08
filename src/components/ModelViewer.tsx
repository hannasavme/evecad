import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, Float, Grid } from "@react-three/drei";
import { Suspense, useMemo, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";
import * as THREE from "three";

export interface SceneModel {
  id: string;
  type: "gear" | "bracket" | "box" | "cylinder";
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  label: string;
}

export interface ModelViewerHandle {
  getScene: () => THREE.Scene | null;
  resetCamera: () => void;
}

interface ModelViewerProps {
  models: SceneModel[];
  selectedModelId: string | null;
  onSelectModel: (id: string | null) => void;
}

function GearMesh({ color }: { color: string }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    const teeth = 16;
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
    const hole = new THREE.Path();
    hole.absellipse(0, 0, 0.35, 0.35, 0, Math.PI * 2, true, 0);
    shape.holes.push(hole);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 });
  }, []);
  return <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]}><meshStandardMaterial color={color} metalness={0.3} roughness={0.4} /></mesh>;
}

function BracketMesh({ color }: { color: string }) {
  return (
    <group>
      <mesh><boxGeometry args={[2, 0.2, 0.8]} /><meshStandardMaterial color={color} metalness={0.3} roughness={0.4} /></mesh>
      <mesh position={[-0.8, 0.5, 0]}><boxGeometry args={[0.2, 1, 0.8]} /><meshStandardMaterial color={color} metalness={0.3} roughness={0.4} /></mesh>
      <mesh position={[0.8, 0.5, 0]}><boxGeometry args={[0.2, 1, 0.8]} /><meshStandardMaterial color={color} metalness={0.3} roughness={0.4} /></mesh>
    </group>
  );
}

function CylinderMesh({ color }: { color: string }) {
  return (
    <group>
      <mesh><cylinderGeometry args={[0.8, 0.8, 1.5, 32]} /><meshStandardMaterial color={color} metalness={0.3} roughness={0.4} /></mesh>
      <mesh><cylinderGeometry args={[0.3, 0.3, 1.6, 32]} /><meshStandardMaterial color={color} metalness={0.2} roughness={0.5} opacity={0.3} transparent /></mesh>
    </group>
  );
}

function BoxMesh({ color }: { color: string }) {
  return (
    <mesh><boxGeometry args={[1.2, 1.2, 1.2]} /><meshStandardMaterial color={color} metalness={0.2} roughness={0.4} /></mesh>
  );
}

const meshMap: Record<string, React.FC<{ color: string }>> = { gear: GearMesh, bracket: BracketMesh, box: BoxMesh, cylinder: CylinderMesh };

function SceneModelComponent({ model, isSelected, onSelect }: { model: SceneModel; isSelected: boolean; onSelect: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const MeshComp = meshMap[model.type] || BoxMesh;

  return (
    <group
      ref={groupRef}
      position={model.position}
      scale={model.scale}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      <MeshComp color={model.color} />
      {isSelected && (
        <mesh>
          <sphereGeometry args={[2, 16, 16]} />
          <meshBasicMaterial color="#f9a8d4" transparent opacity={0.05} wireframe />
        </mesh>
      )}
    </group>
  );
}

function SceneCapture({ onSceneReady, onControlsReady }: { onSceneReady: (scene: THREE.Scene) => void; onControlsReady: (reset: () => void) => void }) {
  const { scene, camera } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    onSceneReady(scene);
  }, [scene, onSceneReady]);

  useEffect(() => {
    if (controlsRef.current) {
      onControlsReady(() => {
        camera.position.set(4, 3, 4);
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      });
    }
  }, [camera, onControlsReady]);

  return null;
}

function Scene({ models, selectedModelId, onSelectModel }: ModelViewerProps) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <pointLight position={[-5, 3, -5]} intensity={0.4} color="#f9a8d4" />
      <pointLight position={[5, 2, 3]} intensity={0.3} color="#a5f3fc" />

      {models.map((m) => (
        <SceneModelComponent
          key={m.id}
          model={m}
          isSelected={selectedModelId === m.id}
          onSelect={() => onSelectModel(m.id)}
        />
      ))}

      {models.length === 0 && (
        <Float speed={2} rotationIntensity={0.5} floatIntensity={0.8}>
          <mesh position={[0, 0.5, 0]}>
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial color="#f9a8d4" metalness={0.2} roughness={0.3} wireframe />
          </mesh>
        </Float>
      )}

      <Grid
        position={[0, -0.1, 0]}
        args={[200, 200]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#f0abfc"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#e9d5ff"
        fadeDistance={80}
        fadeStrength={1.5}
        infiniteGrid
      />
      <Environment preset="apartment" />
      <OrbitControls enablePan enableZoom enableRotate autoRotate={models.length === 0} autoRotateSpeed={1.5} />
    </>
  );
}

const ModelViewer = forwardRef<ModelViewerHandle, ModelViewerProps>(
  ({ models, selectedModelId, onSelectModel }, ref) => {
    const sceneRef = useRef<THREE.Scene | null>(null);
    const resetRef = useRef<(() => void) | null>(null);

    useImperativeHandle(ref, () => ({
      getScene: () => sceneRef.current,
      resetCamera: () => resetRef.current?.(),
    }));

    return (
      <div className="w-full h-full">
        <Canvas
          camera={{ position: [4, 3, 4], fov: 50 }}
          shadows
          onPointerMissed={() => onSelectModel(null)}
        >
          <Suspense fallback={null}>
            <SceneCapture
              onSceneReady={(s) => { sceneRef.current = s; }}
              onControlsReady={(fn) => { resetRef.current = fn; }}
            />
            <Scene models={models} selectedModelId={selectedModelId} onSelectModel={onSelectModel} />
          </Suspense>
        </Canvas>
      </div>
    );
  }
);

ModelViewer.displayName = "ModelViewer";

export default ModelViewer;
