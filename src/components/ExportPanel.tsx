import { Download, FileBox, Printer, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const formats = [
  { id: "step", label: "STEP", desc: "Professional CAD", icon: FileBox },
  { id: "stl", label: "STL", desc: "3D Printing", icon: Printer },
  { id: "obj", label: "OBJ", desc: "Visualization", icon: Eye },
];

interface ExportPanelProps {
  hasModel: boolean;
}

export default function ExportPanel({ hasModel }: ExportPanelProps) {
  const handleExport = (format: string) => {
    toast.success(`${format.toUpperCase()} export started`, {
      description: "Connect a backend to enable real CAD file generation.",
    });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
        Export Format
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {formats.map((f) => (
          <button
            key={f.id}
            onClick={() => handleExport(f.id)}
            disabled={!hasModel}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border bg-secondary/50 hover:bg-primary/10 hover:border-primary/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed group"
          >
            <f.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-xs font-semibold text-foreground">{f.label}</span>
            <span className="text-[10px] text-muted-foreground">{f.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
