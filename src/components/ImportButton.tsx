import { useRef } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { parseSTL, parseOBJ } from "@/lib/importers";
import type { SceneModel } from "@/components/ModelViewer";

interface ImportButtonProps {
  onImport: (models: SceneModel[]) => void;
}

export default function ImportButton({ onImport }: ImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    console.log("[Import] File selected:", file.name, "ext:", ext, "size:", file.size);

    try {
      if (ext === "stl") {
        const buffer = await file.arrayBuffer();
        console.log("[Import] STL buffer size:", buffer.byteLength);
        const models = parseSTL(buffer, file.name);
        console.log("[Import] Parsed STL models:", models.length, models);
        onImport(models);
        toast.success(`Imported ${file.name}`, { description: "STL loaded into scene" });
      } else if (ext === "obj") {
        const text = await file.text();
        console.log("[Import] OBJ text length:", text.length);
        const models = parseOBJ(text, file.name);
        console.log("[Import] Parsed OBJ models:", models.length, models);
        onImport(models);
        toast.success(`Imported ${file.name}`, { description: "OBJ loaded into scene" });
      } else {
        toast.error("Unsupported format", { description: "Please upload .stl or .obj files" });
      }
    } catch (err) {
      console.error("[Import] Error:", err);
      toast.error("Import failed", { description: String(err) });
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".stl,.obj"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors px-2.5 py-1.5 rounded-xl border-2 border-border hover:border-primary/40 bg-card/60"
      >
        <Upload className="w-3 h-3" />
        Import
      </button>
    </>
  );
}
