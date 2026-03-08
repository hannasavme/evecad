import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Box, Plus, Star, Sparkles, Heart, X, Layers, Trash2 } from "lucide-react";
import InputPanel from "@/components/InputPanel";
import ModelViewer, { type SceneModel } from "@/components/ModelViewer";
import ExportDropdown from "@/components/ExportDropdown";
import GenerationProgress from "@/components/GenerationProgress";

const stages = [
  "Reading your wishes~ ✨",
  "Sketching geometry~ 📐",
  "Building mesh~ 🏗️",
  "Adding sparkles~ ✨",
  "Almost done~ 🎀",
];

let modelIdCounter = 0;

export default function Index() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [models, setModels] = useState<SceneModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const inferModelType = (text?: string): SceneModel["type"] => {
    if (!text) return "box";
    const t = text.toLowerCase();
    if (t.includes("gear")) return "gear";
    if (t.includes("bracket") || t.includes("l-shape")) return "bracket";
    if (t.includes("cylinder") || t.includes("pipe")) return "cylinder";
    return "box";
  };

  const handleGenerate = useCallback(
    (input: { mode: string; text?: string; imageFile?: File }) => {
      setIsGenerating(true);
      setProgress(0);
      const type = inferModelType(input.text);
      const label = input.text?.slice(0, 30) || type;
      let step = 0;

      const interval = setInterval(() => {
        step++;
        setProgress(Math.min((step / 25) * 100, 100));
        setStage(stages[Math.min(Math.floor(step / 5), stages.length - 1)]);
        if (step >= 25) {
          clearInterval(interval);
          setIsGenerating(false);
          const offset = models.length * 2.5;
          const newModel: SceneModel = {
            id: `model-${++modelIdCounter}`,
            type,
            position: [offset, 0.5, 0],
            label,
          };
          setModels((prev) => [...prev, newModel]);
          setSelectedModelId(newModel.id);
          setShowInput(false);
        }
      }, 120);
    },
    [models.length]
  );

  const handleDeleteSelected = () => {
    if (!selectedModelId) return;
    setModels((prev) => prev.filter((m) => m.id !== selectedModelId));
    setSelectedModelId(null);
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-background relative">
      {/* Header — compact overlay */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 h-12 bg-card/70 backdrop-blur-md border-b-2 border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/15 border-2 border-primary/30 flex items-center justify-center">
            <Box className="w-4 h-4 text-primary" />
          </div>
          <span className="font-extrabold text-lg tracking-tight text-foreground">
            CAD<span className="text-gradient-primary">Gen</span>
          </span>
          <span className="hidden sm:inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border-2 border-border">
            ✨ alpha
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ExportDropdown hasModel={models.length > 0} />
        </div>
      </header>

      {/* Full-screen 3D Viewport */}
      <div className="absolute inset-0 pt-12">
        <ModelViewer
          models={models}
          selectedModelId={selectedModelId}
          onSelectModel={setSelectedModelId}
        />
      </div>

      {/* Generation progress overlay */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-80"
          >
            <div className="p-4 rounded-2xl border-2 border-border bg-card/90 backdrop-blur-md kawaii-shadow">
              <GenerationProgress progress={progress} stage={stage} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Models list — bottom left */}
      {models.length > 0 && (
        <div className="absolute bottom-6 left-4 z-30 flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
            <Layers className="w-3 h-3" /> Models ({models.length})
          </span>
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedModelId(m.id === selectedModelId ? null : m.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-2 ${
                selectedModelId === m.id
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-card/80 backdrop-blur-sm border-border text-foreground hover:border-primary/30"
              }`}
            >
              <span className="capitalize">{m.type}</span>
              <span className="text-muted-foreground truncate max-w-[100px]">{m.label}</span>
            </button>
          ))}
          {selectedModelId && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-destructive/10 border-2 border-destructive/30 text-destructive hover:bg-destructive/20 transition-all"
            >
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          )}
        </div>
      )}

      {/* Add model FAB */}
      <button
        onClick={() => setShowInput(!showInput)}
        className="absolute bottom-6 right-6 z-40 w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center kawaii-shadow hover:scale-105 transition-transform"
      >
        <AnimatePresence mode="wait">
          {showInput ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X className="w-6 h-6" />
            </motion.div>
          ) : (
            <motion.div key="add" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <Plus className="w-6 h-6" />
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* Floating input panel */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-24 right-6 z-40 w-[380px] max-h-[70vh] overflow-y-auto"
          >
            <div className="p-5 rounded-3xl border-2 border-border bg-card/95 backdrop-blur-md kawaii-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-primary" /> Add a Part ✨
                </span>
                <button onClick={() => setShowInput(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <InputPanel onGenerate={handleGenerate} isGenerating={isGenerating} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating decorations */}
      <div className="fixed top-20 left-10 text-2xl opacity-15 animate-bounce pointer-events-none">⭐</div>
      <div className="fixed top-40 right-16 text-3xl opacity-10 animate-pulse pointer-events-none">🌸</div>
    </div>
  );
}
