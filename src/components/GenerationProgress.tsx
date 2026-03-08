import { motion } from "framer-motion";

interface GenerationProgressProps {
  progress: number;
  stage: string;
}

export default function GenerationProgress({ progress, stage }: GenerationProgressProps) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-xs font-mono text-primary">{stage}</span>
        <span className="text-xs font-mono text-muted-foreground">{Math.round(progress)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
          style={{ boxShadow: "0 0 10px hsl(160 84% 44% / 0.5)" }}
        />
      </div>
    </div>
  );
}
