import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Type, Image, Upload, Sparkles, ChevronDown } from "lucide-react";
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
    if (file && file.type.startsWith("image/")) {
      setImageFile(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setImageFile(file);
  };

  const handleGenerate = () => {
    if (mode === "text" && text.trim()) {
      onGenerate({ mode, text });
    } else if (mode === "image" && imageFile) {
      onGenerate({ mode, imageFile });
    }
  };

  const examples = [
    "A spur gear with 20 teeth, module 2mm, and 10mm central bore",
    "An L-shaped bracket with mounting holes, 50mm × 30mm × 3mm",
    "A cylindrical pipe fitting with threaded ends, 25mm diameter",
    "A simple enclosure box with ventilation slots, 100×60×40mm",
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Mode Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted mb-4">
        {(["text", "image"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-sm font-medium transition-all ${
              mode === m
                ? "bg-card text-primary glow-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "text" ? <Type className="w-4 h-4" /> : <Image className="w-4 h-4" />}
            {m === "text" ? "Text to CAD" : "Image to CAD"}
          </button>
        ))}
      </div>

      {/* Input Area */}
      <AnimatePresence mode="wait">
        {mode === "text" ? (
          <motion.div
            key="text"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 flex flex-col gap-3"
          >
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              Describe your 3D model
            </label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g., A gear with 20 teeth and a central hole of 10mm diameter..."
              className="flex-1 min-h-[140px] resize-none bg-muted border-border focus:border-primary focus:ring-primary/20 font-mono text-sm"
            />
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-mono">Examples:</p>
              <div className="flex flex-wrap gap-1.5">
                {examples.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setText(ex)}
                    className="text-xs px-2.5 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-primary/10 hover:text-primary transition-colors border border-border"
                  >
                    {ex.slice(0, 40)}…
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
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              Upload sketch or engineering drawing
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`flex-1 min-h-[180px] flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed transition-all cursor-pointer ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : imageFile
                  ? "border-primary/50 bg-primary/5"
                  : "border-border hover:border-muted-foreground"
              }`}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              {imageFile ? (
                <>
                  <div className="w-16 h-16 rounded-lg overflow-hidden border border-border">
                    <img
                      src={URL.createObjectURL(imageFile)}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-sm text-foreground font-medium">{imageFile.name}</p>
                  <p className="text-xs text-muted-foreground">Click to replace</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drop image here or <span className="text-primary">browse</span>
                  </p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, SVG up to 20MB</p>
                </>
              )}
            </div>
            <input
              id="file-input"
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={isGenerating || (mode === "text" ? !text.trim() : !imageFile)}
        className="mt-4 w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 glow-primary font-semibold text-sm tracking-wide"
      >
        {isGenerating ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            Generating Model…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Generate 3D Model
          </span>
        )}
      </Button>
    </div>
  );
}
