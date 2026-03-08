import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Box, Layers, Zap, Heart, Star, Sparkles } from "lucide-react";
import InputPanel from "@/components/InputPanel";
import ModelViewer from "@/components/ModelViewer";
import ExportPanel from "@/components/ExportPanel";
import GenerationProgress from "@/components/GenerationProgress";

type ModelType = "gear" | "bracket" | "box" | "cylinder" | "default";

const stages = [
  "Reading your wishes~ ✨",
  "Sketching geometry~ 📐",
  "Building mesh~ 🏗️",
  "Adding sparkles~ ✨",
  "Almost done~ 🎀",
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
      {/* Floating decorations */}
      <div className="fixed top-20 left-10 text-2xl opacity-20 animate-bounce pointer-events-none">⭐</div>
      <div className="fixed top-40 right-16 text-3xl opacity-15 animate-pulse pointer-events-none">🌸</div>
      <div className="fixed bottom-32 left-20 text-2xl opacity-20 animate-bounce pointer-events-none" style={{ animationDelay: "0.5s" }}>💫</div>
      <div className="fixed bottom-20 right-32 text-xl opacity-15 animate-pulse pointer-events-none" style={{ animationDelay: "1s" }}>✨</div>

      {/* Header */}
      <header className="border-b-2 border-border backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-primary/15 border-2 border-primary/30 flex items-center justify-center">
              <Box className="w-4 h-4 text-primary" />
            </div>
            <span className="font-extrabold text-xl tracking-tight text-foreground">
              CAD<span className="text-gradient-primary">Gen</span>
            </span>
            <span className="hidden sm:inline-block text-xs font-bold px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground border-2 border-border">
              ✨ alpha
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground font-bold">
            <span className="hidden md:flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" /> AI-Powered
            </span>
            <span className="hidden md:flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-primary" /> Made with love
            </span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 h-[calc(100vh-8rem)]">
          {/* Left Panel */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col gap-4 overflow-y-auto"
          >
            <div className="p-5 rounded-3xl border-2 border-border bg-card kawaii-shadow flex-1 flex flex-col">
              <InputPanel onGenerate={handleGenerate} isGenerating={isGenerating} />
            </div>
            <div className="p-5 rounded-3xl border-2 border-border bg-card kawaii-shadow space-y-4">
              {isGenerating && <GenerationProgress progress={progress} stage={stage} />}
              <ExportPanel hasModel={hasModel} />
            </div>
          </motion.div>

          {/* 3D Viewport */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="relative rounded-3xl border-2 border-border overflow-hidden bg-card kawaii-shadow"
          >
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 py-2.5 bg-card/80 backdrop-blur-sm border-b-2 border-border">
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-primary" />
                {hasModel ? `${modelType.toUpperCase()} ✅` : "Ready to create~ ✨"}
              </span>
              <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
                <span>🖱️ Orbit</span>
                <span className="text-border">·</span>
                <span>🔍 Zoom</span>
                <span className="text-border">·</span>
                <span>✋ Pan</span>
              </div>
            </div>

            {isGenerating && (
              <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
                <div className="absolute inset-x-0 h-0.5 animate-scan-line" style={{ background: "linear-gradient(90deg, transparent, hsl(330 80% 65% / 0.6), transparent)" }} />
              </div>
            )}

            <ModelViewer modelType={modelType} />
          </motion.div>
        </div>
      </main>
    </div>
  );
}
