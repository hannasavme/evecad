import { Download, FileBox, Printer, Eye } from "lucide-react";
import { toast } from "sonner";

const formats = [
  { id: "step", label: "STEP", desc: "Pro CAD", icon: FileBox },
  { id: "stl", label: "STL", desc: "3D Print", icon: Printer },
  { id: "obj", label: "OBJ", desc: "Preview", icon: Eye },
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
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
        Export Format
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {formats.map((f) => (
          <button
            key={f.id}
            onClick={() => handleExport(f.id)}
            disabled={!hasModel}
            className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 border-border bg-card hover:bg-primary/5 hover:border-primary/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed group kawaii-shadow-sm"
          >
            <f.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-xs font-bold text-foreground">{f.label}</span>
            <span className="text-[10px] text-muted-foreground">{f.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
