import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Type, Image, Upload, Sparkles, Star, Heart, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type InputMode = "text" | "image" | "paper";

interface InputPanelProps {
  onGenerate: (input: { mode: InputMode; text?: string; imageFile?: File; paperFile?: File }) => void;
  isGenerating: boolean;
}

const TEXT_EXAMPLES = [
  "A spur gear with 20 teeth and a center hole",
  "An L-shaped mounting bracket with bolt holes",
  "A hollow box with 6 ventilation slots",
  "A cylinder pipe, hollow with thin walls",
];

export default function InputPanel({ onGenerate, isGenerating }: InputPanelProps) {
  const [mode, setMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [paperFile, setPaperFile] = useState<File | null>(null);
  const [paperContext, setPaperContext] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (mode === "paper" && file.type === "application/pdf") {
      setPaperFile(file);
    } else if (mode === "image" && file.type.startsWith("image/")) {
      setImageFile(file);
    }
  }, [mode]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (mode === "paper") setPaperFile(file);
      else setImageFile(file);
    }
  };

  const handleGenerate = () => {
    if (mode === "text" && text.trim()) onGenerate({ mode, text });
    else if (mode === "image" && imageFile) onGenerate({ mode, imageFile });
    else if (mode === "paper" && paperFile) onGenerate({ mode, paperFile, text: paperContext.trim() || undefined });
  };

  const canGenerate =
    mode === "text" ? text.trim().length > 0
    : mode === "image" ? !!imageFile
    : !!paperFile;

  const modes = [
    { key: "text" as const, label: "Text to CAD" },
    { key: "image" as const, label: "Image to CAD" },
    { key: "paper" as const, label: "Paper to CAD" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Mode Tabs */}
      <div className="flex gap-1 p-1 sm:p-1.5 rounded-2xl bg-muted mb-3 sm:mb-4">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`flex-1 flex items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-2.5 px-1.5 sm:px-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all ${
              mode === m.key
                ? "bg-card text-primary kawaii-shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            
            {m.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {mode === "text" ? (
          <motion.div
            key="text"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 flex flex-col gap-3"
          >
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Star className="w-3 h-3 text-primary" />
              Describe your 3D model
            </label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g., A gear with 20 teeth and a hole in the middle"
              className="flex-1 min-h-[120px] resize-none bg-muted/50 border-2 border-border focus:border-primary rounded-2xl text-sm p-4"
            />
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-bold">Try these</p>
              <div className="flex flex-wrap gap-1.5">
                {TEXT_EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setText(ex)}
                    className="text-xs px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground hover:bg-primary/15 hover:text-primary transition-colors border-2 border-transparent hover:border-primary/30 font-semibold"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        ) : mode === "image" ? (
          <motion.div
            key="image"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 flex flex-col gap-3"
          >
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Heart className="w-3 h-3 text-primary" />
              Upload your sketch
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`flex-1 min-h-[120px] flex flex-col items-center justify-center gap-3 rounded-2xl border-3 border-dashed transition-all cursor-pointer ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : imageFile
                  ? "border-primary/50 bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              {imageFile ? (
                <>
                  <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-primary/30">
                    <img src={URL.createObjectURL(imageFile)} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                  <p className="text-sm text-foreground font-bold">{imageFile.name}</p>
                  <p className="text-xs text-muted-foreground">Click to replace</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                    <Upload className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground font-semibold">
                    Drop here or <span className="text-primary">browse</span>
                  </p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, SVG up to 20MB</p>
                </>
              )}
            </div>
            <input id="file-input" type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
          </motion.div>
        ) : (
          <motion.div
            key="paper"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 flex flex-col gap-3"
          >
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <FileText className="w-3 h-3 text-primary" />
              Upload academic paper
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`min-h-[100px] flex flex-col items-center justify-center gap-3 rounded-2xl border-3 border-dashed transition-all cursor-pointer ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : paperFile
                  ? "border-primary/50 bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
              onClick={() => document.getElementById("paper-input")?.click()}
            >
              {paperFile ? (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm text-foreground font-bold truncate max-w-[200px]">{paperFile.name}</p>
                  <p className="text-xs text-muted-foreground">Click to replace</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                    <Upload className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground font-semibold">
                    Drop PDF here or <span className="text-primary">browse</span>
                  </p>
                  <p className="text-xs text-muted-foreground">PDF up to 20MB</p>
                </>
              )}
            </div>
            <input id="paper-input" type="file" accept="application/pdf" onChange={handleFileSelect} className="hidden" />

            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Focus area (optional)
            </label>
            <Textarea
              value={paperContext}
              onChange={(e) => setPaperContext(e.target.value)}
              placeholder="e.g., Generate the proposed heat exchanger design from Section 3"
              className="min-h-[70px] resize-none bg-muted/50 border-2 border-border focus:border-primary rounded-2xl text-sm p-3"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        onClick={handleGenerate}
        disabled={isGenerating || !canGenerate}
        className="mt-4 w-full h-12 rounded-2xl font-bold text-sm tracking-wide kawaii-shadow"
      >
        {isGenerating ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            {mode === "paper" ? "Analyzing paper..." : "Generating..."}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            {mode === "paper" ? "Generate from Paper" : "Generate CAD Model"}
          </span>
        )}
      </Button>
    </div>
  );
}
