import { useState } from "react";
import { motion } from "framer-motion";
import { Palette, X, Settings2, Ruler, Move3D } from "lucide-react";
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

// Conversion factors to internal units (1 internal unit = 1 cm)
const TO_INTERNAL: Record<Unit, number> = {
  mm: 0.1,
  cm: 1,
  m: 100,
  in: 2.54,
  ft: 30.48,
};

function toDisplay(internal: number, unit: Unit): number {
  return parseFloat((internal / TO_INTERNAL[unit]).toFixed(4));
}

function toInternal(display: number, unit: Unit): number {
  return display * TO_INTERNAL[unit];
}

interface ParamDef {
  key: keyof ModelParams;
  label: string;
  type: "number" | "int";
  min?: number;
  max?: number;
  step?: number;
  default: number;
  hasDimension: boolean; // whether this uses the unit system
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
};

interface PropertiesPanelProps {
  model: SceneModel;
  onUpdate: (id: string, updates: Partial<SceneModel>) => void;
  onClose: () => void;
}

export default function PropertiesPanel({ model, onUpdate, onClose }: PropertiesPanelProps) {
  const [unit, setUnit] = useState<Unit>("mm");

  const handlePositionChange = (axis: 0 | 1 | 2, value: number) => {
    const newPos: [number, number, number] = [...model.position];
    newPos[axis] = toInternal(value, unit);
    onUpdate(model.id, { position: newPos });
  };

  const handleParamChange = (key: keyof ModelParams, value: number) => {
    onUpdate(model.id, {
      params: { ...(model.params || {}), [key]: value },
    });
  };

  const paramDefs = PARAM_DEFS[model.type] || [];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute top-16 right-4 z-30 w-64 max-h-[calc(100vh-5rem)] overflow-y-auto"
    >
      <div className="p-4 rounded-2xl border-2 border-border bg-card/95 backdrop-blur-md kawaii-shadow space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-extrabold text-foreground capitalize flex items-center gap-1.5">
            {model.type}
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Unit selector */}
        <div className="flex items-center gap-2">
          <Ruler className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Unit</span>
          <div className="flex gap-0.5 ml-auto">
            {UNITS.map((u) => (
              <button
                key={u.value}
                onClick={() => setUnit(u.value)}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-lg transition-all ${
                  unit === u.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>

        {/* Geometry / Dimensions */}
        {paramDefs.length > 0 && (
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Settings2 className="w-3 h-3" /> Dimensions
            </label>
            <div className="space-y-1.5">
              {paramDefs.map((p) => {
                const rawVal = (model.params?.[p.key] as number) ?? p.default;
                const displayVal = p.hasDimension ? toDisplay(rawVal, unit) : rawVal;

                return (
                  <div key={p.key} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground w-16 shrink-0">{p.label}</span>
                    <input
                      type="number"
                      min={p.hasDimension ? toDisplay(p.min ?? 0, unit) : p.min}
                      max={p.hasDimension ? toDisplay(p.max ?? 100, unit) : p.max}
                      step={p.type === "int" ? 1 : (p.hasDimension ? toDisplay(p.step ?? 0.1, unit) || 0.01 : p.step)}
                      value={p.type === "int" ? displayVal : parseFloat(displayVal.toFixed(3))}
                      onChange={(e) => {
                        const v = p.type === "int" ? parseInt(e.target.value) : parseFloat(e.target.value);
                        if (isNaN(v)) return;
                        handleParamChange(p.key, p.hasDimension ? toInternal(v, unit) : v);
                      }}
                      className="flex-1 h-7 rounded-lg bg-muted border border-border text-xs font-bold text-foreground text-center px-2 focus:border-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[10px] font-bold text-muted-foreground w-6 text-right">
                      {p.hasDimension ? unit : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scale Controls */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Scaling className="w-3 h-3" /> Scale
          </label>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground w-6">All</span>
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.1"
                value={model.scale[0]}
                onChange={(e) => handleUniformScale(parseFloat(e.target.value))}
                className="flex-1 h-1.5 rounded-full appearance-none bg-muted accent-primary"
              />
              <span className="text-[10px] font-bold text-foreground w-8 text-right">{model.scale[0].toFixed(1)}x</span>
            </div>
            {(["X", "Y", "Z"] as const).map((axis, i) => (
              <div key={axis} className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-muted-foreground w-6">{axis}</span>
                <input
                  type="range"
                  min="0.2"
                  max="3"
                  step="0.1"
                  value={model.scale[i]}
                  onChange={(e) => handleScaleChange(i as 0 | 1 | 2, parseFloat(e.target.value))}
                  className="flex-1 h-1.5 rounded-full appearance-none bg-muted accent-primary"
                />
                <span className="text-[10px] font-bold text-foreground w-8 text-right">{model.scale[i].toFixed(1)}x</span>
              </div>
            ))}
          </div>
        </div>

        {/* Color Picker */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Palette className="w-3 h-3" /> Color
          </label>
          <div className="grid grid-cols-6 gap-1.5">
            {KAWAII_COLORS.map((c) => (
              <button
                key={c.hex}
                onClick={() => onUpdate(model.id, { color: c.hex })}
                title={c.name}
                className={`w-7 h-7 rounded-xl border-2 transition-all hover:scale-110 ${
                  model.color === c.hex
                    ? "border-foreground scale-110 ring-2 ring-primary/30"
                    : "border-transparent"
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          {model.label}
        </p>
      </div>
    </motion.div>
  );
}
