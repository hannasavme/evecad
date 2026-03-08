import { useState } from "react";
import { motion } from "framer-motion";
import { Palette, X, Settings2, Ruler, Move3D, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { SceneModel, ModelParams } from "@/components/ModelViewer";

const KAWAII_COLORS = [
  { name: "Sakura", hex: "#f9a8d4" },
  { name: "Lavender", hex: "#c4b5fd" },
  { name: "Lilac", hex: "#d8b4fe" },
  { name: "Sky", hex: "#a5f3fc" },
  { name: "Mint", hex: "#86efac" },
  { name: "Peach", hex: "#fdba74" },
  { name: "Lemon", hex: "#fde68a" },
  { name: "Rose", hex: "#fda4af" },
  { name: "Periwinkle", hex: "#a5b4fc" },
  { name: "Bubblegum", hex: "#f0abfc" },
  { name: "Coral", hex: "#fb7185" },
  { name: "Cream", hex: "#fef3c7" },
];

type Unit = "mm" | "cm" | "m" | "in" | "ft";
const UNITS: { value: Unit; label: string }[] = [
  { value: "mm", label: "mm" },
  { value: "cm", label: "cm" },
  { value: "m", label: "m" },
  { value: "in", label: "in" },
  { value: "ft", label: "ft" },
];

const TO_INTERNAL: Record<Unit, number> = { mm: 0.1, cm: 1, m: 100, in: 2.54, ft: 30.48 };
function toDisplay(internal: number, unit: Unit): number { return parseFloat((internal / TO_INTERNAL[unit]).toFixed(4)); }
function toInternal(display: number, unit: Unit): number { return display * TO_INTERNAL[unit]; }

interface ParamDef {
  key: keyof ModelParams;
  label: string;
  type: "number" | "int";
  min?: number;
  max?: number;
  step?: number;
  default: number;
  hasDimension: boolean;
}

const PARAM_DEFS: Record<string, ParamDef[]> = {
  gear: [
    { key: "teeth", label: "Teeth", type: "int", min: 4, max: 80, step: 1, default: 16, hasDimension: false },
    { key: "holeDiameter", label: "Hole ⌀", type: "number", min: 0, max: 2, step: 0.01, default: 0.35, hasDimension: true },
    { key: "thickness", label: "Thickness", type: "number", min: 0.05, max: 3, step: 0.01, default: 0.4, hasDimension: true },
  ],
  bracket: [
    { key: "armLength", label: "Arm len.", type: "number", min: 0.1, max: 5, step: 0.1, default: 1.0, hasDimension: true },
    { key: "thickness", label: "Thickness", type: "number", min: 0.02, max: 1, step: 0.01, default: 0.2, hasDimension: true },
    { key: "width", label: "Width", type: "number", min: 0.1, max: 4, step: 0.1, default: 0.8, hasDimension: true },
  ],
  box: [
    { key: "width", label: "Width", type: "number", min: 0.1, max: 10, step: 0.1, default: 1.2, hasDimension: true },
    { key: "height", label: "Height", type: "number", min: 0.1, max: 10, step: 0.1, default: 1.2, hasDimension: true },
    { key: "depth", label: "Depth", type: "number", min: 0.1, max: 10, step: 0.1, default: 1.2, hasDimension: true },
    { key: "slots", label: "Vent slots", type: "int", min: 0, max: 20, step: 1, default: 0, hasDimension: false },
    { key: "wallThickness", label: "Wall", type: "number", min: 0.01, max: 1, step: 0.01, default: 0.1, hasDimension: true },
  ],
  cylinder: [
    { key: "radius", label: "Radius", type: "number", min: 0.05, max: 5, step: 0.05, default: 0.8, hasDimension: true },
    { key: "height", label: "Height", type: "number", min: 0.1, max: 10, step: 0.1, default: 1.5, hasDimension: true },
    { key: "wallThickness", label: "Wall", type: "number", min: 0.01, max: 1, step: 0.01, default: 0.15, hasDimension: true },
    { key: "segments", label: "Smoothness", type: "int", min: 8, max: 64, step: 1, default: 32, hasDimension: false },
  ],
  sphere: [
    { key: "radius", label: "Radius", type: "number", min: 0.05, max: 5, step: 0.05, default: 0.8, hasDimension: true },
    { key: "segments", label: "Smoothness", type: "int", min: 8, max: 64, step: 1, default: 32, hasDimension: false },
  ],
  cone: [
    { key: "radiusTop", label: "Top R", type: "number", min: 0, max: 5, step: 0.05, default: 0, hasDimension: true },
    { key: "radiusBottom", label: "Bottom R", type: "number", min: 0.05, max: 5, step: 0.05, default: 0.8, hasDimension: true },
    { key: "height", label: "Height", type: "number", min: 0.1, max: 10, step: 0.1, default: 1.5, hasDimension: true },
    { key: "segments", label: "Smoothness", type: "int", min: 8, max: 64, step: 1, default: 32, hasDimension: false },
  ],
  wedge: [
    { key: "width", label: "Width", type: "number", min: 0.1, max: 10, step: 0.1, default: 1.0, hasDimension: true },
    { key: "height", label: "Height", type: "number", min: 0.1, max: 10, step: 0.1, default: 0.8, hasDimension: true },
    { key: "depth", label: "Depth", type: "number", min: 0.1, max: 10, step: 0.1, default: 1.5, hasDimension: true },
  ],
  torus: [
    { key: "radius", label: "Radius", type: "number", min: 0.1, max: 5, step: 0.05, default: 0.8, hasDimension: true },
    { key: "tube", label: "Tube R", type: "number", min: 0.01, max: 2, step: 0.01, default: 0.15, hasDimension: true },
    { key: "segments", label: "Smoothness", type: "int", min: 8, max: 64, step: 1, default: 32, hasDimension: false },
  ],
  tube: [
    { key: "radius", label: "Radius", type: "number", min: 0.05, max: 5, step: 0.05, default: 0.5, hasDimension: true },
    { key: "height", label: "Height", type: "number", min: 0.1, max: 10, step: 0.1, default: 2.0, hasDimension: true },
    { key: "wallThickness", label: "Wall", type: "number", min: 0.01, max: 1, step: 0.01, default: 0.08, hasDimension: true },
    { key: "segments", label: "Smoothness", type: "int", min: 8, max: 64, step: 1, default: 32, hasDimension: false },
  ],
  plate: [
    { key: "radius", label: "Radius", type: "number", min: 0.1, max: 10, step: 0.1, default: 1.0, hasDimension: true },
    { key: "thickness", label: "Thickness", type: "number", min: 0.01, max: 1, step: 0.01, default: 0.05, hasDimension: true },
    { key: "width", label: "Width", type: "number", min: 0.1, max: 10, step: 0.1, default: 1.0, hasDimension: true },
    { key: "depth", label: "Depth", type: "number", min: 0.1, max: 10, step: 0.1, default: 1.0, hasDimension: true },
  ],
  wheel: [
    { key: "radius", label: "Radius", type: "number", min: 0.1, max: 3, step: 0.05, default: 0.4, hasDimension: true },
    { key: "width", label: "Width", type: "number", min: 0.1, max: 1, step: 0.05, default: 0.25, hasDimension: true },
    { key: "spokes", label: "Spokes", type: "int", min: 3, max: 12, step: 1, default: 6, hasDimension: false },
    { key: "hubRadius", label: "Hub R", type: "number", min: 0.02, max: 1, step: 0.01, default: 0.12, hasDimension: true },
    { key: "treadDepth", label: "Tread", type: "number", min: 0.02, max: 0.1, step: 0.01, default: 0.04, hasDimension: true },
  ],
  camera: [
    { key: "lensRadius", label: "Lens R", type: "number", min: 0.03, max: 0.3, step: 0.01, default: 0.12, hasDimension: true },
    { key: "bodyWidth", label: "Body W", type: "number", min: 0.1, max: 0.6, step: 0.05, default: 0.3, hasDimension: true },
    { key: "bodyHeight", label: "Body H", type: "number", min: 0.08, max: 0.4, step: 0.02, default: 0.2, hasDimension: true },
    { key: "bodyDepth", label: "Body D", type: "number", min: 0.1, max: 0.5, step: 0.05, default: 0.25, hasDimension: true },
  ],
  antenna: [
    { key: "dishRadius", label: "Dish R", type: "number", min: 0.2, max: 2, step: 0.05, default: 0.5, hasDimension: true },
    { key: "mastHeight", label: "Mast H", type: "number", min: 0.5, max: 5, step: 0.1, default: 1.2, hasDimension: true },
    { key: "mastRadius", label: "Mast R", type: "number", min: 0.02, max: 0.1, step: 0.01, default: 0.03, hasDimension: true },
  ],
  drill: [
    { key: "bitLength", label: "Bit Len", type: "number", min: 0.5, max: 5, step: 0.1, default: 1.5, hasDimension: true },
    { key: "bitRadius", label: "Bit R", type: "number", min: 0.05, max: 0.5, step: 0.01, default: 0.12, hasDimension: true },
    { key: "spirals", label: "Spirals", type: "int", min: 2, max: 8, step: 1, default: 4, hasDimension: false },
  ],
  track: [
    { key: "trackLength", label: "Length", type: "number", min: 1, max: 6, step: 0.1, default: 2.0, hasDimension: true },
    { key: "trackWidth", label: "Width", type: "number", min: 0.1, max: 0.8, step: 0.05, default: 0.3, hasDimension: true },
    { key: "wheelCount", label: "Wheels", type: "int", min: 3, max: 8, step: 1, default: 4, hasDimension: false },
    { key: "radius", label: "Wheel R", type: "number", min: 0.1, max: 0.5, step: 0.05, default: 0.2, hasDimension: true },
  ],
  bolt: [
    { key: "headRadius", label: "Head R", type: "number", min: 0.1, max: 1, step: 0.05, default: 0.3, hasDimension: true },
    { key: "headHeight", label: "Head H", type: "number", min: 0.05, max: 0.5, step: 0.02, default: 0.15, hasDimension: true },
    { key: "shaftRadius", label: "Shaft R", type: "number", min: 0.03, max: 0.5, step: 0.01, default: 0.12, hasDimension: true },
    { key: "shaftLength", label: "Shaft L", type: "number", min: 0.3, max: 5, step: 0.1, default: 1.0, hasDimension: true },
    { key: "threadPitch", label: "Pitch", type: "number", min: 0.03, max: 0.3, step: 0.01, default: 0.1, hasDimension: true },
  ],
  nut: [
    { key: "nutRadius", label: "Radius", type: "number", min: 0.1, max: 1, step: 0.05, default: 0.3, hasDimension: true },
    { key: "nutHeight", label: "Height", type: "number", min: 0.05, max: 0.5, step: 0.02, default: 0.2, hasDimension: true },
    { key: "boreRadius", label: "Bore R", type: "number", min: 0.03, max: 0.5, step: 0.01, default: 0.12, hasDimension: true },
  ],
  screw: [
    { key: "headRadius", label: "Head R", type: "number", min: 0.05, max: 0.5, step: 0.02, default: 0.2, hasDimension: true },
    { key: "headHeight", label: "Head H", type: "number", min: 0.02, max: 0.3, step: 0.01, default: 0.08, hasDimension: true },
    { key: "shaftRadius", label: "Shaft R", type: "number", min: 0.02, max: 0.3, step: 0.01, default: 0.08, hasDimension: true },
    { key: "shaftLength", label: "Shaft L", type: "number", min: 0.2, max: 3, step: 0.05, default: 0.8, hasDimension: true },
  ],
  bearing: [
    { key: "outerRadius", label: "Outer R", type: "number", min: 0.2, max: 3, step: 0.05, default: 0.5, hasDimension: true },
    { key: "innerRadius", label: "Inner R", type: "number", min: 0.05, max: 1.5, step: 0.05, default: 0.2, hasDimension: true },
    { key: "bearingWidth", label: "Width", type: "number", min: 0.05, max: 1, step: 0.02, default: 0.2, hasDimension: true },
    { key: "ballCount", label: "Balls", type: "int", min: 4, max: 16, step: 1, default: 8, hasDimension: false },
  ],
  pulley: [
    { key: "radius", label: "Radius", type: "number", min: 0.2, max: 3, step: 0.05, default: 0.5, hasDimension: true },
    { key: "width", label: "Width", type: "number", min: 0.1, max: 1, step: 0.05, default: 0.3, hasDimension: true },
    { key: "grooveDepth", label: "Groove D", type: "number", min: 0.02, max: 0.3, step: 0.01, default: 0.08, hasDimension: true },
    { key: "grooveWidth", label: "Groove W", type: "number", min: 0.03, max: 0.5, step: 0.02, default: 0.12, hasDimension: true },
  ],
  shaft: [
    { key: "radius", label: "Radius", type: "number", min: 0.03, max: 1, step: 0.01, default: 0.1, hasDimension: true },
    { key: "height", label: "Length", type: "number", min: 0.3, max: 10, step: 0.1, default: 2.0, hasDimension: true },
  ],
  mug: [
    { key: "mugRadius", label: "Radius", type: "number", min: 0.2, max: 1.5, step: 0.05, default: 0.5, hasDimension: true },
    { key: "mugHeight", label: "Height", type: "number", min: 0.3, max: 2, step: 0.05, default: 0.8, hasDimension: true },
    { key: "handleSize", label: "Handle", type: "number", min: 0.1, max: 0.8, step: 0.05, default: 0.3, hasDimension: true },
    { key: "wallThickness", label: "Wall", type: "number", min: 0.02, max: 0.1, step: 0.01, default: 0.04, hasDimension: true },
  ],
  hammer: [
    { key: "handleLength", label: "Handle L", type: "number", min: 0.5, max: 3, step: 0.1, default: 1.5, hasDimension: true },
    { key: "handleRadius", label: "Handle R", type: "number", min: 0.03, max: 0.2, step: 0.01, default: 0.06, hasDimension: true },
    { key: "headWidth", label: "Head W", type: "number", min: 0.2, max: 1.5, step: 0.05, default: 0.6, hasDimension: true },
    { key: "headSize", label: "Head S", type: "number", min: 0.08, max: 0.5, step: 0.02, default: 0.18, hasDimension: true },
  ],
  handle: [
    { key: "knobRadius", label: "Knob R", type: "number", min: 0.05, max: 0.5, step: 0.02, default: 0.2, hasDimension: true },
    { key: "stemRadius", label: "Stem R", type: "number", min: 0.02, max: 0.2, step: 0.01, default: 0.06, hasDimension: true },
    { key: "stemHeight", label: "Stem H", type: "number", min: 0.1, max: 1, step: 0.05, default: 0.4, hasDimension: true },
  ],
};

interface PropertiesPanelProps {
  models: SceneModel[];
  onUpdate: (id: string, updates: Partial<SceneModel>) => void;
  onBatchUpdate: (ids: string[], updates: Partial<SceneModel>) => void;
  onClose: () => void;
}

export default function PropertiesPanel({ models: selectedModels, onUpdate, onBatchUpdate, onClose }: PropertiesPanelProps) {
  const [unit, setUnit] = useState<Unit>("mm");
  const isMulti = selectedModels.length > 1;
  const model = selectedModels[0];

  const handlePositionChange = (axis: 0 | 1 | 2, value: number) => {
    const newPos: [number, number, number] = [...model.position];
    newPos[axis] = toInternal(value, unit);
    onUpdate(model.id, { position: newPos });
  };

  const handleRotationChange = (axis: 0 | 1 | 2, value: number) => {
    const newRot: [number, number, number] = [...(model.rotation || [0, 0, 0])];
    newRot[axis] = value;
    onUpdate(model.id, { rotation: newRot });
  };

  const handleParamChange = (key: keyof ModelParams, value: number) => {
    onUpdate(model.id, { params: { ...(model.params || {}), [key]: value } });
  };

  const paramDefs = PARAM_DEFS[model.type] || [];

  const inputClass = "flex-1 h-7 rounded-lg bg-muted border border-border text-xs font-bold text-foreground text-center px-2 focus:border-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute top-16 right-4 z-30 w-64 max-h-[calc(100vh-5rem)] overflow-y-auto"
    >
      <div className="p-4 rounded-2xl border-2 border-border bg-card/95 backdrop-blur-md kawaii-shadow space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5" /> {isMulti ? `${selectedModels.length} selected` : "Properties"}
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {/* Unit selector */}
        <div className="flex items-center gap-2">
          <Ruler className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Unit</span>
          <div className="flex gap-0.5 ml-auto">
            {UNITS.map((u) => (
              <button key={u.value} onClick={() => setUnit(u.value)} className={`text-[10px] font-bold px-2 py-0.5 rounded-lg transition-all ${unit === u.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                {u.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dimensions — single select */}
        {!isMulti && paramDefs.length > 0 && (
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Settings2 className="w-3 h-3" /> Dimensions</label>
            <div className="space-y-1.5">
              {paramDefs.map((p) => {
                const rawVal = (model.params?.[p.key] as number) ?? p.default;
                const displayVal = p.hasDimension ? toDisplay(rawVal, unit) : rawVal;
                return (
                  <div key={p.key} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground w-16 shrink-0">{p.label}</span>
                    <input type="number" min={p.hasDimension ? toDisplay(p.min ?? 0, unit) : p.min} max={p.hasDimension ? toDisplay(p.max ?? 100, unit) : p.max} step={p.type === "int" ? 1 : (p.hasDimension ? toDisplay(p.step ?? 0.1, unit) || 0.01 : p.step)} value={p.type === "int" ? displayVal : parseFloat(displayVal.toFixed(3))} onChange={(e) => { const v = p.type === "int" ? parseInt(e.target.value) : parseFloat(e.target.value); if (isNaN(v)) return; handleParamChange(p.key, p.hasDimension ? toInternal(v, unit) : v); }} className={inputClass} />
                    <span className="text-[10px] font-bold text-muted-foreground w-6 text-right">{p.hasDimension ? unit : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Multi-select batch dimensions */}
        {isMulti && (
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Settings2 className="w-3 h-3" /> Batch Dimensions</label>
            <p className="text-[10px] text-muted-foreground">Set shared dimensions for all selected parts</p>
            {[
              { key: "width" as keyof ModelParams, label: "Width" },
              { key: "height" as keyof ModelParams, label: "Height" },
              { key: "depth" as keyof ModelParams, label: "Depth" },
            ].map((p) => (
              <div key={p.key} className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-muted-foreground w-16 shrink-0">{p.label}</span>
                <input type="number" step={unit === "mm" ? 1 : 0.1} placeholder="—" onChange={(e) => { const v = parseFloat(e.target.value); if (isNaN(v)) return; const internal = toInternal(v, unit); selectedModels.forEach((m) => onUpdate(m.id, { params: { ...m.params, [p.key]: internal } })); }} className={inputClass} />
                <span className="text-[10px] font-bold text-muted-foreground w-6 text-right">{unit}</span>
              </div>
            ))}
          </div>
        )}

        {/* Position — single select */}
        {!isMulti && (
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Move3D className="w-3 h-3" /> Position</label>
            <div className="space-y-1.5">
              {(["X", "Y", "Z"] as const).map((axis, i) => (
                <div key={axis} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground w-6">{axis}</span>
                  <input type="number" step={unit === "mm" ? 1 : 0.1} value={parseFloat(toDisplay(model.position[i], unit).toFixed(3))} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) handlePositionChange(i as 0 | 1 | 2, v); }} className={inputClass} />
                  <span className="text-[10px] font-bold text-muted-foreground w-6 text-right">{unit}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rotation — single select */}
        {!isMulti && (
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Rotation (°)</label>
            <div className="space-y-1.5">
              {(["Rx", "Ry", "Rz"] as const).map((axis, i) => (
                <div key={axis} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground w-6">{axis}</span>
                  <input type="number" step={5} value={parseFloat(((model.rotation || [0, 0, 0])[i]).toFixed(1))} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) handleRotationChange(i as 0 | 1 | 2, v); }} className={inputClass} />
                  <span className="text-[10px] font-bold text-muted-foreground w-6 text-right">°</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Color */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Palette className="w-3 h-3" /> Color {isMulti && "(apply to all)"}</label>
          <div className="grid grid-cols-6 gap-1.5">
            {KAWAII_COLORS.map((c) => (
              <button key={c.hex} onClick={() => { if (isMulti) onBatchUpdate(selectedModels.map((m) => m.id), { color: c.hex }); else onUpdate(model.id, { color: c.hex }); }} title={c.name} className={`w-7 h-7 rounded-xl border-2 transition-all hover:scale-110 ${!isMulti && model.color === c.hex ? "border-foreground scale-110 ring-2 ring-primary/30" : "border-transparent"}`} style={{ backgroundColor: c.hex }} />
            ))}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          {isMulti ? selectedModels.map((m) => m.label).join(", ") : model.label}
        </p>
      </div>
    </motion.div>
  );
}
