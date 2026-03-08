import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Star, X, Layers, Trash2, Wrench, Loader2, Ruler, Crosshair } from "lucide-react";
import mascotImg from "@/assets/mascot.png";
import InputPanel from "@/components/InputPanel";
import ModelViewer, { type SceneModel, type ModelViewerHandle } from "@/components/ModelViewer";
import ExportDropdown from "@/components/ExportDropdown";
import GenerationProgress from "@/components/GenerationProgress";
import PropertiesPanel from "@/components/PropertiesPanel";
import CadDrawingPanel from "@/components/CadDrawingPanel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUndoHistory } from "@/hooks/use-undo-history";

const DEFAULT_COLORS: Record<string, string> = {
  gear: "#f9a8d4",
  bracket: "#c4b5fd",
  box: "#d8b4fe",
  cylinder: "#a5f3fc",
};

const stages = [
  "Asking AI to understand",
  "Parsing geometry",
  "Building mesh",
  "Adding details",
  "Almost done",
];

let modelIdCounter = 0;

export default function Index() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAssembling, setIsAssembling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [showInput, setShowInput] = useState(false);
  const { current: models, push: pushModels, undo, redo, canUndo, canRedo } = useUndoHistory<SceneModel[]>([]);

  const modelsRef = useRef(models);
  modelsRef.current = models;

  const setModels = useCallback((updater: SceneModel[] | ((prev: SceneModel[]) => SceneModel[])) => {
    pushModels(typeof updater === "function" ? updater(modelsRef.current) : updater);
  }, [pushModels]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [showDrawing, setShowDrawing] = useState(false);
  const [assemblyInstructions, setAssemblyInstructions] = useState<string | null>(null);
  const viewerRef = useRef<ModelViewerHandle>(null);

  const selectedModel = models.find((m) => m.id === selectedModelId) || null;

  const handleUpdateModel = useCallback((id: string, updates: Partial<SceneModel>) => {
    setModels((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  }, []);

  const handleGenerate = useCallback(
    async (input: { mode: string; text?: string; imageFile?: File }) => {
      setIsGenerating(true);
      setProgress(0);

      let step = 0;
      const interval = setInterval(() => {
        step++;
        if (step <= 20) {
          setProgress(Math.min((step / 25) * 100, 80));
          setStage(stages[Math.min(Math.floor(step / 4), stages.length - 2)]);
        }
      }, 150);

      let type: SceneModel["type"] = "box";
      let label = input.text?.slice(0, 30) || "model";

      try {
        if (input.mode === "text" && input.text) {
          const { data, error } = await supabase.functions.invoke("parse-cad-text", {
            body: { text: input.text },
          });
          if (!error && data?.type) {
            type = data.type;
            label = data.label || label;
          } else {
            type = localInferType(input.text);
          }
        } else {
          type = "box";
          label = "Uploaded model";
        }
      } catch {
        type = localInferType(input.text);
      }

      clearInterval(interval);
      setProgress(100);
      setStage(stages[stages.length - 1]);

      setTimeout(() => {
        const offset = models.length * 2.5;
        const newModel: SceneModel = {
          id: `model-${++modelIdCounter}`,
          type,
          position: [offset, 0.5, 0],
          scale: [1, 1, 1],
          color: DEFAULT_COLORS[type] || "#d8b4fe",
          label,
        };
        setModels((prev) => [...prev, newModel]);
        setSelectedModelId(newModel.id);
        setShowInput(false);
        setIsGenerating(false);
        toast.success(`${type} generated!`);
      }, 300);
    },
    [models.length]
  );

  const handleAssemble = useCallback(async () => {
    if (models.length < 2) {
      toast.error("Need at least 2 parts to assemble");
      return;
    }

    setIsAssembling(true);
    setAssemblyInstructions(null);

    try {
      const { data, error } = await supabase.functions.invoke("assemble-parts", {
        body: { models },
      });

      if (error) {
        console.error("Assembly error:", error);
        toast.error("Assembly failed");
        setIsAssembling(false);
        return;
      }

      // Apply new positions and scales
      if (data?.parts) {
        setModels((prev) =>
          prev.map((m, index) => {
            const update = data.parts.find((p: any) => p.id === m.id) || data.parts[index];
            if (update) {
              return {
                ...m,
                position: (update.new_position || m.position) as [number, number, number],
                scale: (update.new_scale || m.scale) as [number, number, number],
              };
            }
            return m;
          })
        );

        for (let i = 0; i < data.parts.length; i++) {
          const part = data.parts[i];
          if (part.modification && part.modification !== "Aligned for assembly") {
            const model = models[i];
            toast.info(`${model?.type || "Part"}: ${part.modification}`);
          }
        }
      }

      if (data?.additional_parts?.length > 0) {
        const newParts: SceneModel[] = data.additional_parts.map((p: any) => ({
          id: `model-${++modelIdCounter}`,
          type: p.type as SceneModel["type"],
          position: p.position as [number, number, number],
          scale: p.scale as [number, number, number],
          color: DEFAULT_COLORS[p.type] || "#fde68a",
          label: p.label,
        }));
        setModels((prev) => [...prev, ...newParts]);
        toast.success(`Added ${newParts.length} extra part(s) for assembly`);
      }

      if (data?.instructions) {
        setAssemblyInstructions(data.instructions);
      }

      toast.success("Assembly complete!");
    } catch (err) {
      console.error("Assembly error:", err);
      toast.error("Assembly failed");
    }

    setIsAssembling(false);
  }, [models]);

  const localInferType = (text?: string): SceneModel["type"] => {
    if (!text) return "box";
    const t = text.toLowerCase();
    if (t.includes("gear")) return "gear";
    if (t.includes("bracket") || t.includes("l-shape")) return "bracket";
    if (t.includes("cylinder") || t.includes("pipe")) return "cylinder";
    return "box";
  };

  const handleDeleteSelected = () => {
    if (!selectedModelId) return;
    setModels((prev) => prev.filter((m) => m.id !== selectedModelId));
    setSelectedModelId(null);
  };

  const getScene = () => viewerRef.current?.getScene() ?? null;

  return (
    <div className="h-screen w-screen overflow-hidden bg-background relative">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 h-12 bg-card/70 backdrop-blur-md border-b-2 border-border">
        <div className="flex items-center gap-2.5">
          <img src={mascotImg} alt="EveCAD mascot" className="w-8 h-8 rounded-xl" />
          <span className="font-extrabold text-lg tracking-tight text-foreground">
            Eve<span className="text-gradient-primary">CAD</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {models.length >= 2 && (
            <button
              onClick={handleAssemble}
              disabled={isAssembling}
              className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors px-2.5 py-1.5 rounded-xl border-2 border-border hover:border-primary/40 bg-card/60 disabled:opacity-50"
            >
              {isAssembling ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Wrench className="w-3 h-3" />
              )}
              Assemble
            </button>
          )}
          {models.length > 0 && (
            <button
              onClick={() => setShowDrawing(!showDrawing)}
              className={`flex items-center gap-1.5 text-[10px] font-bold transition-colors px-2.5 py-1.5 rounded-xl border-2 bg-card/60 ${
                showDrawing
                  ? "border-primary/40 text-primary"
                  : "border-border text-muted-foreground hover:text-primary hover:border-primary/40"
              }`}
            >
              <Ruler className="w-3 h-3" />
              Drawing
            </button>
          )}
          <ExportDropdown hasModel={models.length > 0} getScene={getScene} />
        </div>
      </header>

      {/* Full-screen 3D Viewport */}
      <div className="absolute inset-0 pt-12">
        <ModelViewer
          ref={viewerRef}
          models={models}
          selectedModelId={selectedModelId}
          onSelectModel={setSelectedModelId}
        />
      </div>

      {/* Properties Panel */}
      <AnimatePresence>
        {selectedModel && !showInput && (
          <PropertiesPanel
            model={selectedModel}
            onUpdate={handleUpdateModel}
            onClose={() => setSelectedModelId(null)}
          />
        )}
      </AnimatePresence>

      {/* CAD Drawing Panel */}
      <AnimatePresence>
        {showDrawing && (
          <CadDrawingPanel models={models} onClose={() => setShowDrawing(false)} />
        )}
      </AnimatePresence>

      {/* Assembly instructions overlay */}
      <AnimatePresence>
        {assemblyInstructions && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-30 max-w-md"
          >
            <div className="p-3 rounded-2xl border-2 border-primary/30 bg-card/90 backdrop-blur-md kawaii-shadow flex items-start gap-2">
              <Wrench className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs font-bold text-foreground">{assemblyInstructions}</p>
              <button
                onClick={() => setAssemblyInstructions(null)}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
        <div className="absolute bottom-6 left-4 z-30 flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
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
              <span
                className="w-3 h-3 rounded-full shrink-0 border border-border"
                style={{ backgroundColor: m.color }}
              />
              <span className="capitalize">{m.type}</span>
              <span className="text-muted-foreground truncate max-w-[80px]">{m.label}</span>
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

      {/* Recenter button */}
      <button
        onClick={() => viewerRef.current?.resetCamera()}
        className="absolute bottom-[5.5rem] right-7 z-40 w-10 h-10 rounded-xl bg-card/90 border-2 border-border text-muted-foreground hover:text-primary hover:border-primary/40 flex items-center justify-center transition-all"
        title="Recenter view"
      >
        <Crosshair className="w-4 h-4" />
      </button>

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
                  <Star className="w-4 h-4 text-primary" /> Add a Part
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
    </div>
  );
}
