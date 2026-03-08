import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows, Float } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import * as THREE from "three";

interface ModelViewerProps {
  modelType?: "gear" | "bracket" | "box" | "cylinder" | "default";
}

function GearModel() {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    const teeth = 16;
    const outerR = 1.2;
    const innerR = 0.9;
    const toothDepth = 0.15;

    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const nextAngle = ((i + 1) / teeth) * Math.PI * 2;
      const midAngle1 = angle + (nextAngle - angle) * 0.25;
      const midAngle2 = angle + (nextAngle - angle) * 0.5;
      const midAngle3 = angle + (nextAngle - angle) * 0.75;

      const r1 = innerR;
      const r2 = outerR + toothDepth;

      if (i === 0) {
        shape.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
      }
      shape.lineTo(Math.cos(midAngle1) * r2, Math.sin(midAngle1) * r2);
      shape.lineTo(Math.cos(midAngle2) * r2, Math.sin(midAngle2) * r2);
      shape.lineTo(Math.cos(midAngle3) * r1, Math.sin(midAngle3) * r1);
      shape.lineTo(Math.cos(nextAngle) * r1, Math.sin(nextAngle) * r1);
    }

    const holePath = new THREE.Path();
    holePath.absellipse(0, 0, 0.35, 0.35, 0, Math.PI * 2, true, 0);
    shape.holes.push(holePath);

    const extrudeSettings = { depth: 0.4, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 };
    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }, []);

  return (
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
      <meshStandardMaterial color="#22d3ee" metalness={0.8} roughness={0.2} />
    </mesh>
  );
}

function BracketModel() {
  return (
    <group position={[0, 0.3, 0]}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[2, 0.2, 0.8]} />
        <meshStandardMaterial color="#34d399" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[-0.8, 0.5, 0]}>
        <boxGeometry args={[0.2, 1, 0.8]} />
        <meshStandardMaterial color="#34d399" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0.8, 0.5, 0]}>
        <boxGeometry args={[0.2, 1, 0.8]} />
        <meshStandardMaterial color="#34d399" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}

function DefaultModel() {
  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
      <mesh position={[0, 0.5, 0]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#34d399" metalness={0.6} roughness={0.2} wireframe />
      </mesh>
    </Float>
  );
}

function CylinderModel() {
  return (
    <group position={[0, 0.5, 0]}>
      <mesh>
        <cylinderGeometry args={[0.8, 0.8, 1.5, 32]} />
        <meshStandardMaterial color="#34d399" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 1.6, 32]} />
        <meshStandardMaterial color="hsl(220, 20%, 6%)" metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
}

function BoxModel() {
  return (
    <mesh position={[0, 0.5, 0]} rotation={[0.3, 0.5, 0]}>
      <boxGeometry args={[1.2, 1.2, 1.2]} />
      <meshStandardMaterial color="#34d399" metalness={0.6} roughness={0.3} />
    </mesh>
  );
}

function Scene({ modelType }: { modelType: string }) {
  const ModelComponent = {
    gear: GearModel,
    bracket: BracketModel,
    box: BoxModel,
    cylinder: CylinderModel,
    default: DefaultModel,
  }[modelType] || DefaultModel;

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={1} castShadow />
      <pointLight position={[-5, 3, -5]} intensity={0.5} color="#22d3ee" />
      <ModelComponent />
      <ContactShadows position={[0, -0.1, 0]} opacity={0.4} scale={10} blur={2} far={4} />
      <Environment preset="city" />
      <OrbitControls enablePan enableZoom enableRotate autoRotate autoRotateSpeed={1} />
      <gridHelper args={[10, 10, "#1e293b", "#0f172a"]} position={[0, -0.1, 0]} />
    </>
  );
}

export default function ModelViewer({ modelType = "default" }: ModelViewerProps) {
  return (
    <div className="w-full h-full rounded-lg overflow-hidden border border-border bg-background">
      <Canvas camera={{ position: [3, 2, 3], fov: 50 }} shadows>
        <Suspense fallback={null}>
          <Scene modelType={modelType} />
        </Suspense>
      </Canvas>
    </div>
  );
}
