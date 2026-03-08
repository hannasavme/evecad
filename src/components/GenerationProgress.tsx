import { motion } from "framer-motion";

interface GenerationProgressProps {
  progress: number;
  stage: string;
}

export default function GenerationProgress({ progress, stage }: GenerationProgressProps) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-primary">{stage}</span>
        <span className="text-xs font-bold text-muted-foreground">{Math.round(progress)}%</span>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden border-2 border-border">
        <motion.div
          className="h-full rounded-full"
          style={{
            background: "linear-gradient(90deg, hsl(330 80% 65%), hsl(270 60% 75%), hsl(190 70% 70%))",
          }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
}
