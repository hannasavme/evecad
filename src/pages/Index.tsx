import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Box, Layers, Zap, Github } from "lucide-react";
import InputPanel from "@/components/InputPanel";
import ModelViewer from "@/components/ModelViewer";
import ExportPanel from "@/components/ExportPanel";
import GenerationProgress from "@/components/GenerationProgress";

type ModelType = "gear" | "bracket" | "box" | "cylinder" | "default";

const stages = [
  "Parsing input…",
  "Analyzing geometry…",
  "Generating mesh…",
  "Optimizing topology…",
  "Finalizing model…",
];

export default function Index() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [modelType, setModelType] = useState<ModelType>("default");
  const [hasModel, setHasModel] = useState(false);

  const inferModelType = (text?: string): ModelType => {
    if (!text) return "box";
    const t = text.toLowerCase();
    if (t.includes("gear")) return "gear";
    if (t.includes("bracket") || t.includes("l-shape")) return "bracket";
    if (t.includes("cylinder") || t.includes("pipe")) return "cylinder";
    if (t.includes("box") || t.includes("enclosure")) return "box";
    return "gear";
  };

  const handleGenerate = useCallback(
    (input: { mode: string; text?: string; imageFile?: File }) => {
      setIsGenerating(true);
      setProgress(0);
      setHasModel(false);

      const target = inferModelType(input.text);
      let step = 0;

      const interval = setInterval(() => {
        step++;
        const p = Math.min((step / 25) * 100, 100);
        setProgress(p);
        setStage(stages[Math.min(Math.floor(step / 5), stages.length - 1)]);

        if (step >= 25) {
          clearInterval(interval);
          setIsGenerating(false);
          setModelType(target);
          setHasModel(true);
        }
      }, 120);
    },
    []
  );

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <header className="border-b border-border backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Box className="w-4 h-4 text-primary" />
            </div>
            <span className="font-bold text-lg tracking-tight text-foreground">
              CAD<span className="text-gradient-primary">Gen</span>
            </span>
            <span className="hidden sm:inline-block text-xs font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
              v0.1 alpha
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
            <span className="hidden md:flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-primary" /> AI-Powered
            </span>
            <span className="hidden md:flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-accent" /> Multi-Format
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 h-[calc(100vh-8rem)]">
          {/* Left Panel */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col gap-4 overflow-y-auto"
          >
            <div className="p-5 rounded-xl border border-border bg-card flex-1 flex flex-col">
              <InputPanel onGenerate={handleGenerate} isGenerating={isGenerating} />
            </div>

            {/* Progress / Export */}
            <div className="p-5 rounded-xl border border-border bg-card space-y-4">
              {isGenerating && (
                <GenerationProgress progress={progress} stage={stage} />
              )}
              <ExportPanel hasModel={hasModel} />
            </div>
          </motion.div>

          {/* 3D Viewport */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="relative rounded-xl border border-border overflow-hidden bg-card"
          >
            {/* Viewport Header */}
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-card/80 backdrop-blur-sm border-b border-border">
              <span className="text-xs font-mono text-muted-foreground">
                VIEWPORT — {hasModel ? modelType.toUpperCase() : "READY"}
              </span>
              <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                <span>Orbit: LMB</span>
                <span className="text-border">|</span>
                <span>Zoom: Scroll</span>
                <span className="text-border">|</span>
                <span>Pan: RMB</span>
              </div>
            </div>

            {/* Scan line animation during generation */}
            {isGenerating && (
              <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
                <div className="absolute inset-x-0 h-px bg-primary/60 animate-scan-line" />
              </div>
            )}

            <ModelViewer modelType={modelType} />
          </motion.div>
        </div>
      </main>
    </div>
  );
}
