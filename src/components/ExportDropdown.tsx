import { useState } from "react";
import { Download, FileBox, Printer, Eye } from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { exportSTL, exportOBJ, downloadBlob } from "@/lib/exporters";
import type * as THREE from "three";

const formats = [
  { id: "stl", label: "STL", desc: "3D Print", icon: Printer },
  { id: "obj", label: "OBJ", desc: "Preview", icon: Eye },
  { id: "step", label: "STEP", desc: "Pro CAD", icon: FileBox },
];

interface ExportDropdownProps {
  hasModel: boolean;
  getScene?: () => THREE.Scene | null;
}

export default function ExportDropdown({ hasModel, getScene }: ExportDropdownProps) {
  const [open, setOpen] = useState(false);

  const handleExport = (format: string) => {
    setOpen(false);

    if (format === "step") {
      toast.info("STEP export coming soon", {
        description: "STEP files require a CAD kernel. STL and OBJ are available now.",
      });
      return;
    }

    const scene = getScene?.();
    if (!scene) {
      toast.error("No scene available to export");
      return;
    }

    try {
      if (format === "stl") {
        const blob = exportSTL(scene);
        if (blob.size <= 84) {
          toast.error("No geometry found to export");
          return;
        }
        downloadBlob(blob, "evecad-model.stl");
        toast.success("STL downloaded", { description: "Ready for 3D printing" });
      } else if (format === "obj") {
        const blob = exportOBJ(scene);
        if (blob.size <= 30) {
          toast.error("No geometry found to export");
          return;
        }
        downloadBlob(blob, "evecad-model.obj");
        toast.success("OBJ downloaded", { description: "Ready for visualization" });
      }
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Export failed", { description: "Something went wrong during export." });
    }
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!hasModel}
        className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-2.5 py-1.5 rounded-xl border-2 border-border hover:border-primary/40 bg-card/60"
      >
        <Download className="w-3 h-3" />
        Export
      </button>

      <AnimatePresence>
        {open && hasModel && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1.5 z-50 bg-card border-2 border-border rounded-2xl p-2 kawaii-shadow-sm min-w-[160px]"
          >
            {formats.map((f) => (
              <button
                key={f.id}
                onClick={() => handleExport(f.id)}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-bold text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <f.icon className="w-3.5 h-3.5" />
                <span>{f.label}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{f.desc}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
