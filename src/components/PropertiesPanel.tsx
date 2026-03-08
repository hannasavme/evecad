import { motion } from "framer-motion";
import { Scaling, Palette, X, Settings2, ToggleLeft, ToggleRight } from "lucide-react";
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

interface ParamDef {
  key: keyof ModelParams;
  label: string;
  type: "slider" | "toggle" | "int";
  min?: number;
  max?: number;
  step?: number;
  default: number | boolean;
}

const PARAM_DEFS: Record<string, ParamDef[]> = {
  gear: [
    { key: "teeth", label: "Teeth", type: "int", min: 6, max: 40, step: 1, default: 16 },
    { key: "holeDiameter", label: "Hole size", type: "slider", min: 0, max: 0.8, step: 0.05, default: 0.35 },
    { key: "thickness", label: "Thickness", type: "slider", min: 0.1, max: 1.5, step: 0.05, default: 0.4 },
  ],
  bracket: [
    { key: "armLength", label: "Arm length", type: "slider", min: 0.3, max: 3.0, step: 0.1, default: 1.0 },
    { key: "thickness", label: "Thickness", type: "slider", min: 0.05, max: 0.8, step: 0.05, default: 0.2 },
    { key: "width", label: "Width", type: "slider", min: 0.3, max: 2.0, step: 0.1, default: 0.8 },
    { key: "hasHoles", label: "Bolt holes", type: "toggle", default: false },
  ],
  box: [
    { key: "width", label: "Width", type: "slider", min: 0.3, max: 4.0, step: 0.1, default: 1.2 },
    { key: "height", label: "Height", type: "slider", min: 0.3, max: 4.0, step: 0.1, default: 1.2 },
    { key: "depth", label: "Depth", type: "slider", min: 0.3, max: 4.0, step: 0.1, default: 1.2 },
    { key: "slots", label: "Vent slots", type: "int", min: 0, max: 10, step: 1, default: 0 },
    { key: "hollow", label: "Hollow", type: "toggle", default: false },
    { key: "wallThickness", label: "Wall", type: "slider", min: 0.03, max: 0.4, step: 0.01, default: 0.1 },
  ],
  cylinder: [
    { key: "radius", label: "Radius", type: "slider", min: 0.1, max: 3.0, step: 0.05, default: 0.8 },
    { key: "height", label: "Height", type: "slider", min: 0.3, max: 4.0, step: 0.1, default: 1.5 },
    { key: "hollow", label: "Hollow", type: "toggle", default: false },
    { key: "wallThickness", label: "Wall", type: "slider", min: 0.03, max: 0.4, step: 0.01, default: 0.15 },
    { key: "segments", label: "Smoothness", type: "int", min: 8, max: 64, step: 4, default: 32 },
  ],
};

interface PropertiesPanelProps {
  model: SceneModel;
  onUpdate: (id: string, updates: Partial<SceneModel>) => void;
  onClose: () => void;
}

export default function PropertiesPanel({ model, onUpdate, onClose }: PropertiesPanelProps) {
  const handleScaleChange = (axis: 0 | 1 | 2, value: number) => {
    const newScale: [number, number, number] = [...model.scale];
    newScale[axis] = value;
    onUpdate(model.id, { scale: newScale });
  };

  const handleUniformScale = (value: number) => {
    onUpdate(model.id, { scale: [value, value, value] });
  };

  const handleParamChange = (key: keyof ModelParams, value: number | boolean | string) => {
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

        {/* Geometry / Dimensions */}
        {paramDefs.length > 0 && (
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Settings2 className="w-3 h-3" /> Dimensions
            </label>
            <div className="space-y-1.5">
              {paramDefs.map((p) => {
                const val = model.params?.[p.key] ?? p.default;

                if (p.type === "toggle") {
                  return (
                    <div key={p.key} className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-muted-foreground">{p.label}</span>
                      <button
                        onClick={() => handleParamChange(p.key, !val)}
                        className="text-primary"
                      >
                        {val ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={p.key} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground w-16 shrink-0">{p.label}</span>
                    <input
                      type="range"
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      value={val as number}
                      onChange={(e) => handleParamChange(p.key, p.type === "int" ? parseInt(e.target.value) : parseFloat(e.target.value))}
                      className="flex-1 h-1.5 rounded-full appearance-none bg-muted accent-primary"
                    />
                    <span className="text-[10px] font-bold text-foreground w-8 text-right">
                      {p.type === "int" ? val : (val as number).toFixed(2)}
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
