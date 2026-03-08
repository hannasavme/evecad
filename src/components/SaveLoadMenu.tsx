import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Save, FolderOpen, Trash2, Loader2, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import type { SceneModel } from "@/components/ModelViewer";

interface SavedProject {
  id: string;
  name: string;
  models_data: SceneModel[];
  updated_at: string;
}

interface SaveLoadMenuProps {
  models: SceneModel[];
  onLoad: (models: SceneModel[]) => void;
  currentProjectId: string | null;
  onProjectChange: (id: string | null, name: string) => void;
  projectName: string;
}

export default function SaveLoadMenu({ models, onLoad, currentProjectId, onProjectChange, projectName }: SaveLoadMenuProps) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const fetchProjects = async () => {
    if (!user) return;
    setLoadingProjects(true);
    const { data, error } = await supabase
      .from("saved_models")
      .select("id, name, models_data, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    setLoadingProjects(false);
    if (!error && data) {
      setProjects(data as unknown as SavedProject[]);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    
    if (currentProjectId) {
      const { error } = await supabase
        .from("saved_models")
        .update({ models_data: JSON.parse(JSON.stringify(models)), updated_at: new Date().toISOString() })
        .eq("id", currentProjectId);
      setSaving(false);
      if (error) {
        toast.error("Failed to save");
      } else {
        toast.success("Project saved!");
        fetchProjects();
      }
    } else {
      const { data, error } = await supabase
        .from("saved_models")
        .insert({ user_id: user.id, name: projectName, models_data: models as unknown as Record<string, unknown>[] })
        .select("id")
        .single();
      setSaving(false);
      if (error) {
        toast.error("Failed to save");
      } else {
        onProjectChange(data.id, projectName);
        toast.success("Project saved!");
        fetchProjects();
      }
    }
  };

  const handleSaveNew = async () => {
    if (!user) return;
    setSaving(true);
    const name = `Project ${projects.length + 1}`;
    const { data, error } = await supabase
      .from("saved_models")
      .insert({ user_id: user.id, name, models_data: models as unknown as Record<string, unknown>[] })
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      toast.error("Failed to save");
    } else {
      onProjectChange(data.id, name);
      toast.success("Saved as new project!");
      fetchProjects();
    }
  };

  const handleLoad = (project: SavedProject) => {
    onLoad(project.models_data);
    onProjectChange(project.id, project.name);
    toast.success(`Loaded "${project.name}"`);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from("saved_models").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
    } else {
      if (currentProjectId === id) onProjectChange(null, "Untitled Project");
      toast.success("Project deleted");
      fetchProjects();
    }
  };

  if (!user) return null;

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleSave}
        disabled={saving || models.length === 0}
        className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors px-2 py-1.5 rounded-xl border-2 border-border hover:border-primary/40 bg-card/60 disabled:opacity-50 shrink-0"
        title="Save project"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
        <span className="hidden sm:inline">Save</span>
      </button>

      <DropdownMenu onOpenChange={(open) => open && fetchProjects()}>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors px-2 py-1.5 rounded-xl border-2 border-border hover:border-primary/40 bg-card/60 shrink-0">
            <FolderOpen className="w-3 h-3" />
            <span className="hidden sm:inline">Load</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs">Your Projects</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {currentProjectId && models.length > 0 && (
            <>
              <DropdownMenuItem onClick={handleSaveNew} className="text-xs">
                <Plus className="w-3 h-3 mr-2" /> Save as New
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {loadingProjects ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : projects.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No saved projects</p>
          ) : (
            projects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() => handleLoad(p)}
                className="text-xs flex items-center justify-between group"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-bold truncate">{p.name}</span>
                  <span className="text-muted-foreground text-[10px]">
                    {new Date(p.updated_at).toLocaleDateString()}
                  </span>
                </div>
                <button
                  onClick={(e) => handleDelete(p.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-destructive hover:bg-destructive/10 rounded transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
