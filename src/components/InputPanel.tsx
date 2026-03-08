import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Type, Image, Upload, Sparkles, Star, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type InputMode = "text" | "image";

interface InputPanelProps {
  onGenerate: (input: { mode: InputMode; text?: string; imageFile?: File }) => void;
  isGenerating: boolean;
}

export default function InputPanel({ onGenerate, isGenerating }: InputPanelProps) {
  const [mode, setMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) setImageFile(file);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setImageFile(file);
  };

  const handleGenerate = () => {
    if (mode === "text" && text.trim()) onGenerate({ mode, text });
    else if (mode === "image" && imageFile) onGenerate({ mode, imageFile });
  };

  const examples = [
    "A cute spur gear with 20 teeth ⚙️",
    "An L-shaped bracket, 50mm × 30mm ✨",
    "A cylinder pipe with threaded ends 🔧",
    "A little box with ventilation slots 📦",
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Mode Tabs */}
      <div className="flex gap-1 p-1.5 rounded-2xl bg-muted mb-4">
        {(["text", "image"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold transition-all ${
              mode === m
                ? "bg-card text-primary kawaii-shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "text" ? <Type className="w-4 h-4" /> : <Image className="w-4 h-4" />}
            {m === "text" ? "Text → CAD ✏️" : "Image → CAD 🖼️"}
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
              placeholder="e.g., A cute gear with 20 teeth and a little hole in the middle~ ✨"
              className="flex-1 min-h-[120px] resize-none bg-muted/50 border-2 border-border focus:border-primary rounded-2xl text-sm p-4"
            />
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-bold">Try these! 💡</p>
              <div className="flex flex-wrap gap-1.5">
                {examples.map((ex, i) => (
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
        ) : (
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
              className={`flex-1 min-h-[160px] flex flex-col items-center justify-center gap-3 rounded-2xl border-3 border-dashed transition-all cursor-pointer ${
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
                  <p className="text-sm text-foreground font-bold">{imageFile.name} ✅</p>
                  <p className="text-xs text-muted-foreground">Click to replace~</p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center">
                    <Upload className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground font-semibold">
                    Drop here or <span className="text-primary">browse</span> 📎
                  </p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, SVG up to 20MB</p>
                </>
              )}
            </div>
            <input id="file-input" type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        onClick={handleGenerate}
        disabled={isGenerating || (mode === "text" ? !text.trim() : !imageFile)}
        className="mt-4 w-full h-12 rounded-2xl font-bold text-sm tracking-wide kawaii-shadow"
      >
        {isGenerating ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            Making magic~ ✨
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Generate 3D Model ✨
          </span>
        )}
      </Button>
    </div>
  );
}
