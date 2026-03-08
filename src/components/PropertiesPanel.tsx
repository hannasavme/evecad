import { motion } from "framer-motion";
import { Scaling, Palette, X } from "lucide-react";
import type { SceneModel } from "@/components/ModelViewer";

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

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute top-16 right-4 z-30 w-64"
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

        {/* Size Controls */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Scaling className="w-3 h-3" /> Size
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
