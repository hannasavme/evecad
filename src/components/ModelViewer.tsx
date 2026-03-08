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
    const innerR = 0.9;
    const toothDepth = 0.15;

    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const nextAngle = ((i + 1) / teeth) * Math.PI * 2;
      const midAngle1 = angle + (nextAngle - angle) * 0.25;
      const midAngle2 = angle + (nextAngle - angle) * 0.5;
      const midAngle3 = angle + (nextAngle - angle) * 0.75;
      const r1 = innerR;
      const r2 = 1.2 + toothDepth;
      if (i === 0) shape.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
      shape.lineTo(Math.cos(midAngle1) * r2, Math.sin(midAngle1) * r2);
      shape.lineTo(Math.cos(midAngle2) * r2, Math.sin(midAngle2) * r2);
      shape.lineTo(Math.cos(midAngle3) * r1, Math.sin(midAngle3) * r1);
      shape.lineTo(Math.cos(nextAngle) * r1, Math.sin(nextAngle) * r1);
    }
    const holePath = new THREE.Path();
    holePath.absellipse(0, 0, 0.35, 0.35, 0, Math.PI * 2, true, 0);
    shape.holes.push(holePath);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 });
  }, []);

  return (
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
      <meshStandardMaterial color="#f9a8d4" metalness={0.3} roughness={0.4} />
    </mesh>
  );
}

function BracketModel() {
  return (
    <group position={[0, 0.3, 0]}>
      <mesh><boxGeometry args={[2, 0.2, 0.8]} /><meshStandardMaterial color="#c4b5fd" metalness={0.3} roughness={0.4} /></mesh>
      <mesh position={[-0.8, 0.5, 0]}><boxGeometry args={[0.2, 1, 0.8]} /><meshStandardMaterial color="#c4b5fd" metalness={0.3} roughness={0.4} /></mesh>
      <mesh position={[0.8, 0.5, 0]}><boxGeometry args={[0.2, 1, 0.8]} /><meshStandardMaterial color="#c4b5fd" metalness={0.3} roughness={0.4} /></mesh>
    </group>
  );
}

function DefaultModel() {
  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.8}>
      <mesh position={[0, 0.5, 0]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#f9a8d4" metalness={0.2} roughness={0.3} wireframe />
      </mesh>
    </Float>
  );
}

function CylinderModel() {
  return (
    <group position={[0, 0.5, 0]}>
      <mesh><cylinderGeometry args={[0.8, 0.8, 1.5, 32]} /><meshStandardMaterial color="#a5f3fc" metalness={0.3} roughness={0.4} /></mesh>
      <mesh><cylinderGeometry args={[0.3, 0.3, 1.6, 32]} /><meshStandardMaterial color="#fef3c7" metalness={0.2} roughness={0.5} /></mesh>
    </group>
  );
}

function BoxModel() {
  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.3}>
      <mesh position={[0, 0.5, 0]} rotation={[0.3, 0.5, 0]}>
        <boxGeometry args={[1.2, 1.2, 1.2]} />
        <meshStandardMaterial color="#d8b4fe" metalness={0.2} roughness={0.4} />
      </mesh>
    </Float>
  );
}

function Scene({ modelType }: { modelType: string }) {
  const ModelComponent = { gear: GearModel, bracket: BracketModel, box: BoxModel, cylinder: CylinderModel, default: DefaultModel }[modelType] || DefaultModel;
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <pointLight position={[-5, 3, -5]} intensity={0.4} color="#f9a8d4" />
      <pointLight position={[5, 2, 3]} intensity={0.3} color="#a5f3fc" />
      <ModelComponent />
      <ContactShadows position={[0, -0.1, 0]} opacity={0.3} scale={10} blur={3} far={4} color="#f9a8d4" />
      <Environment preset="apartment" />
      <OrbitControls enablePan enableZoom enableRotate autoRotate autoRotateSpeed={1.5} />
      <gridHelper args={[10, 10, "#f0abfc", "#fce7f3"]} position={[0, -0.1, 0]} />
    </>
  );
}

export default function ModelViewer({ modelType = "default" }: ModelViewerProps) {
  return (
    <div className="w-full h-full rounded-2xl overflow-hidden border-2 border-border bg-card">
      <Canvas camera={{ position: [3, 2, 3], fov: 50 }} shadows>
        <Suspense fallback={null}>
          <Scene modelType={modelType} />
        </Suspense>
      </Canvas>
    </div>
  );
}
