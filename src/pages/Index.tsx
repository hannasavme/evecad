import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Star, X, Layers, Trash2, Wrench, Loader2, Ruler, Crosshair, Pencil, Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import mascotImg from "@/assets/mascot.png";
import InputPanel, { type InputMode } from "@/components/InputPanel";
import ModelViewer, { type SceneModel, type ModelViewerHandle } from "@/components/ModelViewer";
import ExportDropdown from "@/components/ExportDropdown";
import ImportButton from "@/components/ImportButton";
import GenerationProgress from "@/components/GenerationProgress";
import PropertiesPanel from "@/components/PropertiesPanel";
import CadDrawingPanel from "@/components/CadDrawingPanel";
import UserMenu from "@/components/UserMenu";
import SaveLoadMenu from "@/components/SaveLoadMenu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUndoHistory } from "@/hooks/use-undo-history";
import { useAuth } from "@/hooks/useAuth";
import { useAuthGate } from "@/hooks/useAuthGate";

const DEFAULT_COLORS: Record<string, string> = {
  gear: "#f9a8d4",
  bracket: "#f9a8d4",
  box: "#f9a8d4",
  cylinder: "#f9a8d4",
};

const stages = [
  "Researching real-world structure",
  "Analyzing components",
  "Parsing geometry",
  "Building mesh",
  "Adding details",
  "Almost done",
];

let modelIdCounter = 0;

export default function Index() {
  const { user } = useAuth();
  const { needsAuth, requireAuth } = useAuthGate();
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled Project");
  const [showProperties, setShowProperties] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAssembling, setIsAssembling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [showInput, setShowInput] = useState(false);
  const { current: models, push: pushModels, pushImmediate, undo, redo, canUndo, canRedo } = useUndoHistory<SceneModel[]>([]);

  const modelsRef = useRef(models);
  modelsRef.current = models;

  // Debounced setter for continuous changes (sliders)
  const setModels = useCallback((updater: SceneModel[] | ((prev: SceneModel[]) => SceneModel[])) => {
    pushModels(typeof updater === "function" ? updater(modelsRef.current) : updater);
  }, [pushModels]);

  // Immediate setter for discrete changes (add, delete, assemble)
  const setModelsImmediate = useCallback((updater: SceneModel[] | ((prev: SceneModel[]) => SceneModel[])) => {
    pushImmediate(typeof updater === "function" ? updater(modelsRef.current) : updater);
  }, [pushImmediate]);

  // Show sign-in prompt for returning unauthenticated users
  useEffect(() => {
    if (needsAuth) {
      toast.info("Welcome back! Sign in to save your work", {
        description: "Create a free account to save projects, export models, and more.",
        duration: 8000,
        action: {
          label: "Sign in",
          onClick: () => {
            window.location.href = "/auth";
          },
        },
      });
    }
  }, [needsAuth]);

  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState("");
  const [showDrawing, setShowDrawing] = useState(false);
  const [assemblyInstructions, setAssemblyInstructions] = useState<string | null>(null);
  const viewerRef = useRef<ModelViewerHandle>(null);

  const selectedModels = models.filter((m) => selectedModelIds.has(m.id));

  const handleSelectModel = useCallback((id: string | null, additive?: boolean, rangeSelect?: boolean) => {
    if (id === null) {
      setSelectedModelIds(new Set());
      return;
    }
    setSelectedModelIds((prev) => {
      // Shift+click: select range between last selected and clicked
      if (rangeSelect && prev.size > 0) {
        const currentModels = modelsRef.current;
        const ids = currentModels.map((m) => m.id);
        const clickedIndex = ids.indexOf(id);
        const lastSelectedId = Array.from(prev).pop()!;
        const lastIndex = ids.indexOf(lastSelectedId);
        if (clickedIndex >= 0 && lastIndex >= 0) {
          const start = Math.min(clickedIndex, lastIndex);
          const end = Math.max(clickedIndex, lastIndex);
          const next = new Set(prev);
          for (let i = start; i <= end; i++) {
            next.add(ids[i]);
          }
          return next;
        }
      }
      if (additive) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      return new Set([id]);
    });
  }, []);

  const handleUpdateModel = useCallback((id: string, updates: Partial<SceneModel>) => {
    setModels((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  }, [setModels]);

  const handleBatchUpdate = useCallback((ids: string[], updates: Partial<SceneModel>) => {
    setModels((prev) => prev.map((m) => ids.includes(m.id) ? { ...m, ...updates } : m));
  }, [setModels]);

  const handleGenerate = useCallback(
    async (input: { mode: InputMode; text?: string; imageFile?: File; paperFile?: File }) => {
      setIsGenerating(true);
      setProgress(0);

      let step = 0;
      const paperMode = input.mode === "paper";
      const interval = setInterval(() => {
        step++;
        if (step <= (paperMode ? 40 : 20)) {
          setProgress(Math.min((step / (paperMode ? 50 : 25)) * 100, 80));
          if (paperMode) {
            const paperStages = ["Uploading paper", "Reading content", "Extracting design info", "Analyzing structure", "Decomposing into parts", "Building mesh", "Almost done"];
            setStage(paperStages[Math.min(Math.floor(step / 6), paperStages.length - 2)]);
          } else {
            setStage(stages[Math.min(Math.floor(step / 4), stages.length - 2)]);
          }
        }
      }, paperMode ? 200 : 150);

      try {
        let data: any;
        let error: any;

        if (input.mode === "paper" && input.paperFile) {
          // Paper mode — use FormData for the parse-paper function
          const formData = new FormData();
          formData.append("file", input.paperFile);
          if (input.text) formData.append("focusArea", input.text);

          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-paper`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: formData,
            }
          );

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            error = errData.error || "Failed to analyze paper";
            if (response.status === 429) error = "Rate limited, please try again later";
            if (response.status === 402) error = "AI credits depleted";
          } else {
            data = await response.json();
          }
        } else {
          // Text / Image mode
          const body: Record<string, any> = {};
          if (input.mode === "text" && input.text) {
            body.text = input.text;
          } else if (input.mode === "image" && input.imageFile) {
            const base64 = await fileToBase64(input.imageFile);
            body.imageBase64 = base64;
          }
          const result = await supabase.functions.invoke("parse-cad-text", { body });
          data = result.data;
          error = result.error;
        }

        clearInterval(interval);
        setProgress(100);
        setStage(stages[stages.length - 1]);

        if (error || !data?.parts?.length) {
          if (input.mode === "paper") {
            clearInterval(interval);
            setIsGenerating(false);
            toast.error(typeof error === "string" ? error : "Could not extract a design from this paper. Try specifying a focus area.");
            return;
          }
          // Fallback single part
          const type = localInferType(input.text);
          const offset = modelsRef.current.length * 2.5;
          const newModel: SceneModel = {
            id: `model-${++modelIdCounter}`,
            type,
            position: [offset, 0.5, 0],
            scale: [1, 1, 1],
            color: DEFAULT_COLORS[type] || "#f9a8d4",
            label: input.text?.slice(0, 30) || "model",
            visible: true,
          };
          setTimeout(() => {
            setModelsImmediate((prev) => [...prev, newModel]);
            handleSelectModel(newModel.id);
            setShowInput(false);
            setIsGenerating(false);
            toast.success(`${type} generated!`);
          }, 300);
          return;
        }

        // Calculate offset so new assembly doesn't overlap existing models
        const existing = modelsRef.current;
        let offsetX = 0;
        if (existing.length > 0) {
          let maxX = -Infinity;
          existing.forEach((m) => {
            const x = m.position[0] + (m.params?.width ?? 1.5) * m.scale[0];
            if (x > maxX) maxX = x;
          });
          // Also check how far the new parts extend in negative X
          let minNewX = Infinity;
          data.parts.forEach((p: any) => {
            const px = p.position?.[0] ?? 0;
            if (px < minNewX) minNewX = px;
          });
          offsetX = maxX - minNewX + 3; // 3 unit gap between assemblies
        }

        const parts: SceneModel[] = data.parts.map((p: any) => ({
          id: `model-${++modelIdCounter}`,
          type: p.type as SceneModel["type"],
          position: [
            (p.position?.[0] ?? 0) + offsetX,
            p.position?.[1] ?? 0.5,
            p.position?.[2] ?? 0,
          ] as [number, number, number],
          rotation: (p.rotation || [0, 0, 0]) as [number, number, number],
          scale: [1, 1, 1] as [number, number, number],
          color: p.color || DEFAULT_COLORS[p.type] || "#f9a8d4",
          label: p.label || p.type,
          params: p.params || {},
          visible: true,
          group: data.assemblyName || undefined,
        }));

        setTimeout(() => {
          setModelsImmediate((prev) => [...prev, ...parts]);
          if (parts.length > 0) handleSelectModel(parts[0].id);
          setShowInput(false);
          setIsGenerating(false);
          if (parts.length > 1) {
            toast.success(`${data.assemblyName || "Assembly"}: ${parts.length} parts generated!`);
            if (data.paperSummary) {
              toast.info(data.paperSummary, { duration: 6000 });
            }
          } else {
            toast.success(`${parts[0].type} generated!`);
          }
        }, 300);
      } catch {
        clearInterval(interval);
        const type = localInferType(input.text);
        const offset = modelsRef.current.length * 2.5;
        const newModel: SceneModel = {
          id: `model-${++modelIdCounter}`,
          type,
          position: [offset, 0.5, 0],
          scale: [1, 1, 1],
          color: DEFAULT_COLORS[type] || "#f9a8d4",
          label: input.text?.slice(0, 30) || "model",
          visible: true,
        };
        setModelsImmediate((prev) => [...prev, newModel]);
        handleSelectModel(newModel.id);
        setShowInput(false);
        setIsGenerating(false);
        toast.success(`${type} generated!`);
      }
    },
    []
  );

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

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
        setModelsImmediate((prev) =>
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
          color: DEFAULT_COLORS[p.type] || "#f9a8d4",
          label: p.label,
        }));
        setModelsImmediate((prev) => [...prev, ...newParts]);
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
    if (selectedModelIds.size === 0) return;
    setModelsImmediate((prev) => prev.filter((m) => !selectedModelIds.has(m.id)));
    setSelectedModelIds(new Set());
  };

  const getScene = () => viewerRef.current?.getScene() ?? null;

  return (
    <div className="h-screen w-screen overflow-hidden bg-background relative">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-2 sm:px-4 h-12 bg-card/70 backdrop-blur-md border-b-2 border-border">
        <div className="flex items-center gap-2">
          <img src={mascotImg} alt="EveCAD mascot" className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl" />
          <span className="font-extrabold text-base sm:text-lg tracking-tight text-foreground">
            Eve<span className="text-gradient-primary">CAD</span>
          </span>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
          {models.length >= 2 && (
            <button
              onClick={handleAssemble}
              disabled={isAssembling}
              className="flex items-center gap-1 sm:gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors px-2 sm:px-2.5 py-1.5 rounded-xl border-2 border-border hover:border-primary/40 bg-card/60 disabled:opacity-50 shrink-0"
            >
              {isAssembling ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Wrench className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">Assemble</span>
            </button>
          )}
          {selectedModels.length > 0 && (
            <button
              onClick={() => setShowProperties(!showProperties)}
              className={`flex items-center gap-1 sm:gap-1.5 text-[10px] font-bold transition-colors px-2 sm:px-2.5 py-1.5 rounded-xl border-2 bg-card/60 shrink-0 ${
                showProperties
                  ? "border-primary/40 text-primary"
                  : "border-border text-muted-foreground hover:text-primary hover:border-primary/40"
              }`}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span className="hidden sm:inline">Properties</span>
            </button>
          )}
          {models.length > 0 && (
            <button
              onClick={() => setShowDrawing(!showDrawing)}
              className={`flex items-center gap-1 sm:gap-1.5 text-[10px] font-bold transition-colors px-2 sm:px-2.5 py-1.5 rounded-xl border-2 bg-card/60 shrink-0 ${
                showDrawing
                  ? "border-primary/40 text-primary"
                  : "border-border text-muted-foreground hover:text-primary hover:border-primary/40"
              }`}
            >
              <Ruler className="w-3 h-3" />
              <span className="hidden sm:inline">Drawing</span>
            </button>
          )}
          <ImportButton onImport={(imported) => setModelsImmediate((prev) => [...prev, ...imported])} />
          <ExportDropdown hasModel={models.length > 0} getScene={getScene} onAuthRequired={() => requireAuth("export")} />
          {user && (
            <SaveLoadMenu
              models={models}
              onLoad={(loaded) => {
                pushImmediate(loaded);
              }}
              currentProjectId={currentProjectId}
              onProjectChange={(id, name) => {
                setCurrentProjectId(id);
                setProjectName(name);
              }}
              projectName={projectName}
            />
          )}
          <UserMenu />
        </div>
      </header>

      {/* Full-screen 3D Viewport */}
      <div className="absolute inset-0 pt-12">
        <ModelViewer
          ref={viewerRef}
          models={models}
          selectedModelIds={selectedModelIds}
          onSelectModel={handleSelectModel}
        />
      </div>

      {/* Properties Panel — only when toggled from top bar */}
      <AnimatePresence>
        {showProperties && selectedModels.length > 0 && !showInput && (
          <PropertiesPanel
            models={selectedModels}
            onUpdate={handleUpdateModel}
            onBatchUpdate={handleBatchUpdate}
            onClose={() => setShowProperties(false)}
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
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(20rem,calc(100vw-2rem))]"
          >
            <div className="p-4 rounded-2xl border-2 border-border bg-card/90 backdrop-blur-md kawaii-shadow">
              <GenerationProgress progress={progress} stage={stage} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Models list — bottom left */}
      {models.length > 0 && (
        <div className="absolute bottom-4 sm:bottom-6 left-2 sm:left-4 z-30 flex flex-col gap-1.5 max-h-[40vh] sm:max-h-[50vh] max-w-[200px] sm:max-w-none overflow-y-auto p-2 sm:p-3 rounded-2xl border-2 border-border bg-card/90 backdrop-blur-md">
          <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
            <Layers className="w-3 h-3" /> Models ({models.length})
          </span>
          {/* Group headers */}
          {(() => {
            const groups = new Map<string, SceneModel[]>();
            const ungrouped: SceneModel[] = [];
            models.forEach((m) => {
              if (m.group) {
                if (!groups.has(m.group)) groups.set(m.group, []);
                groups.get(m.group)!.push(m);
              } else {
                ungrouped.push(m);
              }
            });

            const renderModel = (m: SceneModel) => (
              <div key={m.id} className="flex items-center gap-0.5">
                {/* Visibility toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setModelsImmediate((prev) =>
                      prev.map((x) => x.id === m.id ? { ...x, visible: !(x.visible !== false ? true : false) } : x)
                    );
                  }}
                  className={`p-1 rounded-lg transition-colors shrink-0 ${
                    m.visible !== false ? "text-muted-foreground hover:text-primary" : "text-muted-foreground/30 hover:text-muted-foreground"
                  }`}
                  title={m.visible !== false ? "Hide" : "Show"}
                >
                  {m.visible !== false ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                </button>
                <button
                  onClick={(e) => {
                    const shift = e.shiftKey;
                    const additive = e.ctrlKey || e.metaKey;
                    handleSelectModel(m.id, additive, shift);
                  }}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-xl text-xs font-bold transition-all border-2 flex-1 min-w-0 ${
                    selectedModelIds.has(m.id)
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : m.visible !== false
                        ? "bg-card/80 backdrop-blur-sm border-border text-foreground hover:border-primary/30"
                        : "bg-card/40 backdrop-blur-sm border-border/50 text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0 border border-border"
                    style={{ backgroundColor: m.color, opacity: m.visible !== false ? 1 : 0.3 }}
                  />
                  <span className="capitalize shrink-0">{m.type}</span>
                  {editingLabelId === m.id ? (
                    <input
                      autoFocus
                      value={editingLabelValue}
                      onChange={(e) => setEditingLabelValue(e.target.value)}
                      onBlur={() => {
                        if (editingLabelValue.trim()) {
                          setModelsImmediate((prev) => prev.map((x) => x.id === m.id ? { ...x, label: editingLabelValue.trim() } : x));
                        }
                        setEditingLabelId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setEditingLabelId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-transparent border-b border-primary outline-none text-xs font-bold max-w-[80px] text-foreground"
                    />
                  ) : (
                    <span className="text-muted-foreground truncate max-w-[70px]">{m.label}</span>
                  )}
                </button>
                {selectedModelIds.has(m.id) && selectedModelIds.size === 1 && editingLabelId !== m.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingLabelId(m.id);
                      setEditingLabelValue(m.label);
                    }}
                    className="p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
                    title="Rename"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
            );

            return (
              <>
                {Array.from(groups.entries()).map(([groupName, groupModels]) => (
                  <div key={groupName} className="flex flex-col gap-1">
                    <span className="text-[9px] font-extrabold text-primary uppercase tracking-wider px-1 mt-1">
                      {groupName} ({groupModels.length})
                    </span>
                    {groupModels.map(renderModel)}
                  </div>
                ))}
                {ungrouped.map(renderModel)}
              </>
            );
          })()}
          {selectedModelIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-destructive/10 border-2 border-destructive/30 text-destructive hover:bg-destructive/20 transition-all"
            >
              <Trash2 className="w-3 h-3" /> Remove {selectedModelIds.size > 1 ? `(${selectedModelIds.size})` : ""}
            </button>
          )}
        </div>
      )}

      {/* Recenter button */}
      <button
        onClick={() => viewerRef.current?.resetCamera()}
        className="absolute bottom-20 sm:bottom-[5.5rem] right-5 sm:right-7 z-40 w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-card/90 border-2 border-border text-muted-foreground hover:text-primary hover:border-primary/40 flex items-center justify-center transition-all"
        title="Recenter view"
      >
        <Crosshair className="w-4 h-4" />
      </button>

      {/* Add model FAB */}
      <button
        onClick={() => setShowInput(!showInput)}
        className="absolute bottom-4 sm:bottom-6 right-4 sm:right-6 z-40 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center kawaii-shadow hover:scale-105 transition-transform"
      >
        <AnimatePresence mode="wait">
          {showInput ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </motion.div>
          ) : (
            <motion.div key="add" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
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
            className="absolute bottom-20 sm:bottom-24 right-4 sm:right-6 z-40 w-[min(380px,calc(100vw-2rem))] max-h-[65vh] sm:max-h-[70vh] overflow-y-auto"
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
