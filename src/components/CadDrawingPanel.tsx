import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Download, Ruler, Eye, Plus, Type } from "lucide-react";
import type { SceneModel } from "@/components/ModelViewer";
import { toast } from "sonner";

interface Annotation {
  id: string;
  x: number;
  y: number;
  text: string;
}

let annotationId = 0;

interface CadDrawingPanelProps {
  models: SceneModel[];
  onClose: () => void;
}

// Dimensions for each shape type at scale 1
const SHAPE_DIMS: Record<string, { w: number; h: number; d: number; label: string }> = {
  box: { w: 1.2, h: 1.2, d: 1.2, label: "Box" },
  cylinder: { w: 1.6, h: 1.5, d: 1.6, label: "Cylinder" },
  gear: { w: 2.7, h: 0.4, d: 2.7, label: "Gear" },
  bracket: { w: 2.0, h: 1.2, d: 0.8, label: "Bracket" },
};

type ViewType = "front" | "top" | "side";

function getScaledDims(model: SceneModel) {
  const base = SHAPE_DIMS[model.type] || SHAPE_DIMS.box;
  return {
    w: base.w * model.scale[0],
    h: base.h * model.scale[1],
    d: base.d * model.scale[2],
    label: base.label,
  };
}

function dimStr(val: number) {
  return (val * 25.4).toFixed(1); // Convert units to mm for display
}

// Renders a single orthographic view as SVG elements
function OrthographicView({
  model,
  view,
  cx,
  cy,
  scale,
}: {
  model: SceneModel;
  view: ViewType;
  cx: number;
  cy: number;
  scale: number;
}) {
  const dims = getScaledDims(model);
  let vw: number, vh: number;

  if (view === "front") {
    vw = dims.w;
    vh = dims.h;
  } else if (view === "top") {
    vw = dims.w;
    vh = dims.d;
  } else {
    vw = dims.d;
    vh = dims.h;
  }

  const pw = vw * scale;
  const ph = vh * scale;
  const x = cx - pw / 2;
  const y = cy - ph / 2;

  const isCircular =
    model.type === "cylinder" && (view === "top" || view === "side" && false);
  const showCircle = model.type === "cylinder" && view === "top";
  const showGearProfile = model.type === "gear" && view === "top";

  const dimOffset = 18;
  const tickLen = 5;

  return (
    <g>
      {/* Shape outline */}
      {showCircle ? (
        <>
          <circle cx={cx} cy={cy} r={pw / 2} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={1.5} />
          {/* Center hole for cylinder */}
          <circle cx={cx} cy={cy} r={pw * 0.19} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={0.8} strokeDasharray="3 2" />
          {/* Center lines */}
          <line x1={cx - pw / 2 - 8} y1={cy} x2={cx + pw / 2 + 8} y2={cy} stroke="hsl(330, 80%, 65%)" strokeWidth={0.4} strokeDasharray="6 3" />
          <line x1={cx} y1={cy - ph / 2 - 8} x2={cx} y2={cy + ph / 2 + 8} stroke="hsl(330, 80%, 65%)" strokeWidth={0.4} strokeDasharray="6 3" />
        </>
      ) : showGearProfile ? (
        <>
          {/* Simplified gear top view */}
          <circle cx={cx} cy={cy} r={pw / 2} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={pw * 0.33} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={0.8} />
          <circle cx={cx} cy={cy} r={pw * 0.13} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={0.8} strokeDasharray="3 2" />
          {/* Teeth hint */}
          {Array.from({ length: 16 }).map((_, i) => {
            const angle = (i / 16) * Math.PI * 2;
            const r1 = pw * 0.33;
            const r2 = pw / 2;
            return (
              <line
                key={i}
                x1={cx + Math.cos(angle) * r1}
                y1={cy + Math.sin(angle) * r1}
                x2={cx + Math.cos(angle) * r2}
                y2={cy + Math.sin(angle) * r2}
                stroke="hsl(280, 30%, 25%)"
                strokeWidth={0.5}
              />
            );
          })}
          <line x1={cx - pw / 2 - 8} y1={cy} x2={cx + pw / 2 + 8} y2={cy} stroke="hsl(330, 80%, 65%)" strokeWidth={0.4} strokeDasharray="6 3" />
          <line x1={cx} y1={cy - ph / 2 - 8} x2={cx} y2={cy + ph / 2 + 8} stroke="hsl(330, 80%, 65%)" strokeWidth={0.4} strokeDasharray="6 3" />
        </>
      ) : (
        <>
          <rect
            x={x}
            y={y}
            width={pw}
            height={ph}
            fill="none"
            stroke="hsl(280, 30%, 25%)"
            strokeWidth={1.5}
          />
          {/* Center lines */}
          <line x1={cx} y1={y - 6} x2={cx} y2={y + ph + 6} stroke="hsl(330, 80%, 65%)" strokeWidth={0.4} strokeDasharray="6 3" />
          <line x1={x - 6} y1={cy} x2={x + pw + 6} y2={cy} stroke="hsl(330, 80%, 65%)" strokeWidth={0.4} strokeDasharray="6 3" />

          {/* Bracket detail: internal lines */}
          {model.type === "bracket" && view === "front" && (
            <>
              <line x1={x + pw * 0.1} y1={y} x2={x + pw * 0.1} y2={y + ph * 0.83} stroke="hsl(280, 30%, 25%)" strokeWidth={0.8} />
              <line x1={x + pw * 0.9} y1={y} x2={x + pw * 0.9} y2={y + ph * 0.83} stroke="hsl(280, 30%, 25%)" strokeWidth={0.8} />
              <line x1={x + pw * 0.1} y1={y + ph * 0.83} x2={x + pw * 0.9} y2={y + ph * 0.83} stroke="hsl(280, 30%, 25%)" strokeWidth={0.8} />
            </>
          )}

          {/* Cylinder front: show rounded ends hint */}
          {model.type === "cylinder" && view === "front" && (
            <>
              <line x1={cx} y1={y - 4} x2={cx} y2={y + ph + 4} stroke="hsl(330, 80%, 65%)" strokeWidth={0.4} strokeDasharray="6 3" />
              <ellipse cx={cx} cy={y} rx={pw / 2} ry={pw * 0.08} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={0.6} strokeDasharray="3 2" />
              <ellipse cx={cx} cy={y + ph} rx={pw / 2} ry={pw * 0.08} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={0.6} />
            </>
          )}
        </>
      )}

      {/* Dimension: width (bottom) */}
      <g className="dimension">
        <line x1={x} y1={y + ph + dimOffset} x2={x + pw} y2={y + ph + dimOffset} stroke="hsl(280, 15%, 55%)" strokeWidth={0.6} />
        <line x1={x} y1={y + ph + dimOffset - tickLen} x2={x} y2={y + ph + dimOffset + tickLen} stroke="hsl(280, 15%, 55%)" strokeWidth={0.6} />
        <line x1={x + pw} y1={y + ph + dimOffset - tickLen} x2={x + pw} y2={y + ph + dimOffset + tickLen} stroke="hsl(280, 15%, 55%)" strokeWidth={0.6} />
        {/* Extension lines */}
        <line x1={x} y1={y + ph + 2} x2={x} y2={y + ph + dimOffset + tickLen + 2} stroke="hsl(280, 15%, 55%)" strokeWidth={0.3} />
        <line x1={x + pw} y1={y + ph + 2} x2={x + pw} y2={y + ph + dimOffset + tickLen + 2} stroke="hsl(280, 15%, 55%)" strokeWidth={0.3} />
        <text x={cx} y={y + ph + dimOffset - 4} textAnchor="middle" fontSize={9} fill="hsl(280, 15%, 55%)" fontFamily="monospace">
          {dimStr(vw)} mm
        </text>
      </g>

      {/* Dimension: height (right) */}
      <g className="dimension">
        <line x1={x + pw + dimOffset} y1={y} x2={x + pw + dimOffset} y2={y + ph} stroke="hsl(280, 15%, 55%)" strokeWidth={0.6} />
        <line x1={x + pw + dimOffset - tickLen} y1={y} x2={x + pw + dimOffset + tickLen} y2={y} stroke="hsl(280, 15%, 55%)" strokeWidth={0.6} />
        <line x1={x + pw + dimOffset - tickLen} y1={y + ph} x2={x + pw + dimOffset + tickLen} y2={y + ph} stroke="hsl(280, 15%, 55%)" strokeWidth={0.6} />
        <line x1={x + pw + 2} y1={y} x2={x + pw + dimOffset + tickLen + 2} y2={y} stroke="hsl(280, 15%, 55%)" strokeWidth={0.3} />
        <line x1={x + pw + 2} y1={y + ph} x2={x + pw + dimOffset + tickLen + 2} y2={y + ph} stroke="hsl(280, 15%, 55%)" strokeWidth={0.3} />
        <text x={x + pw + dimOffset + 12} y={cy + 3} textAnchor="middle" fontSize={9} fill="hsl(280, 15%, 55%)" fontFamily="monospace" transform={`rotate(90, ${x + pw + dimOffset + 12}, ${cy})`}>
          {dimStr(vh)} mm
        </text>
      </g>
    </g>
  );
}

function EditableText({
  x, y, text, fontSize, fill, fontWeight, fontFamily, textAnchor, transform, onUpdate,
}: {
  x: number; y: number; text: string; fontSize: number; fill: string;
  fontWeight?: string; fontFamily?: string; textAnchor?: string; transform?: string;
  onUpdate: (newText: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);

  if (editing) {
    const inputW = Math.max(text.length * fontSize * 0.65, 60);
    const inputH = fontSize + 6;
    const fx = textAnchor === "middle" ? x - inputW / 2 : x;
    const fy = y - fontSize;

    return (
      <foreignObject x={fx} y={fy} width={inputW + 10} height={inputH + 4}>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => { setEditing(false); onUpdate(value); }}
          onKeyDown={(e) => { if (e.key === "Enter") { setEditing(false); onUpdate(value); } }}
          style={{
            width: "100%",
            height: "100%",
            fontSize: `${fontSize}px`,
            fontFamily: fontFamily || "monospace",
            fontWeight: fontWeight || "normal",
            background: "hsl(330, 30%, 97%)",
            border: "1px solid hsl(330, 80%, 65%)",
            borderRadius: 3,
            outline: "none",
            padding: "0 2px",
            color: fill,
          }}
        />
      </foreignObject>
    );
  }

  return (
    <text
      x={x} y={y}
      textAnchor={textAnchor}
      fontSize={fontSize}
      fontWeight={fontWeight}
      fill={fill}
      fontFamily={fontFamily}
      transform={transform}
      style={{ cursor: "text" }}
      onClick={() => setEditing(true)}
    >
      {value}
    </text>
  );
}

function DrawingSVG({
  models,
  showDimensions,
  annotations,
  onUpdateAnnotation,
  onDeleteAnnotation,
  titleText,
  onUpdateTitle,
  subtitleText,
  onUpdateSubtitle,
}: {
  models: SceneModel[];
  showDimensions: boolean;
  annotations: Annotation[];
  onUpdateAnnotation: (id: string, text: string) => void;
  onDeleteAnnotation: (id: string) => void;
  titleText: string;
  onUpdateTitle: (t: string) => void;
  subtitleText: string;
  onUpdateSubtitle: (t: string) => void;
}) {
  const svgWidth = 800;
  const svgHeight = 560;
  const viewPadding = 30;
  const scale = 55;

  const viewWidth = (svgWidth - viewPadding * 4) / 3;
  const rowHeight = 180;

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={svgWidth} height={svgHeight} fill="hsl(0, 0%, 100%)" />

      <rect x={8} y={8} width={svgWidth - 16} height={svgHeight - 16} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={1.5} />
      <rect x={12} y={12} width={svgWidth - 24} height={svgHeight - 24} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={0.5} />

      {/* Title block */}
      <rect x={svgWidth - 220} y={svgHeight - 50} width={208} height={38} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={1} />
      <EditableText
        x={svgWidth - 116} y={svgHeight - 32}
        text={titleText} fontSize={12} fontWeight="bold"
        fill="hsl(280, 30%, 25%)" fontFamily="monospace" textAnchor="middle"
        onUpdate={onUpdateTitle}
      />
      <EditableText
        x={svgWidth - 116} y={svgHeight - 18}
        text={subtitleText} fontSize={8}
        fill="hsl(280, 15%, 55%)" fontFamily="monospace" textAnchor="middle"
        onUpdate={onUpdateSubtitle}
      />

      {models.map((model, idx) => {
        const rowY = 60 + idx * rowHeight;
        const views: ViewType[] = ["front", "top", "side"];
        const viewLabels = ["FRONT", "TOP", "SIDE"];

        return (
          <g key={model.id}>
            <EditableText
              x={20} y={rowY - 8}
              text={`Part ${idx + 1}: ${model.label} (${model.type})`}
              fontSize={10} fontWeight="bold"
              fill="hsl(330, 80%, 65%)" fontFamily="monospace"
              onUpdate={() => {}}
            />

            {views.map((view, vi) => {
              const vCx = viewPadding + viewWidth * vi + viewWidth / 2;
              const vCy = rowY + rowHeight / 2 - 15;

              return (
                <g key={view}>
                  <text x={vCx} y={rowY + 2} textAnchor="middle" fontSize={8} fill="hsl(280, 15%, 55%)" fontFamily="monospace">
                    {viewLabels[vi]}
                  </text>
                  <OrthographicView model={model} view={view} cx={vCx} cy={vCy} scale={scale} />
                </g>
              );
            })}

            {idx < models.length - 1 && (
              <line
                x1={16} y1={rowY + rowHeight - 10}
                x2={svgWidth - 16} y2={rowY + rowHeight - 10}
                stroke="hsl(330, 25%, 88%)" strokeWidth={0.5} strokeDasharray="4 3"
              />
            )}
          </g>
        );
      })}

      {/* User annotations */}
      {annotations.map((a) => (
        <g key={a.id}>
          <rect x={a.x - 2} y={a.y - 11} width={Math.max(a.text.length * 5.5, 30)} height={14} rx={2} fill="hsl(45, 90%, 95%)" stroke="hsl(45, 70%, 70%)" strokeWidth={0.5} />
          <EditableText
            x={a.x} y={a.y}
            text={a.text} fontSize={9}
            fill="hsl(280, 30%, 25%)" fontFamily="monospace"
            onUpdate={(t) => {
              if (t.trim() === "") onDeleteAnnotation(a.id);
              else onUpdateAnnotation(a.id, t);
            }}
          />
        </g>
      ))}
    </svg>
  );
}

export default function CadDrawingPanel({ models, onClose }: CadDrawingPanelProps) {
  const [showDimensions, setShowDimensions] = useState(true);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [titleText, setTitleText] = useState("EveCAD Drawing");
  const [subtitleText, setSubtitleText] = useState(
    `${models.length} part${models.length !== 1 ? "s" : ""} — Scale 1:1 — mm`
  );
  const svgContainerRef = useRef<HTMLDivElement>(null);

  const addAnnotation = () => {
    const newA: Annotation = {
      id: `ann-${++annotationId}`,
      x: 30 + Math.random() * 200,
      y: 40 + Math.random() * 100,
      text: "Note: edit me",
    };
    setAnnotations((prev) => [...prev, newA]);
  };

  const updateAnnotation = useCallback((id: string, text: string) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, text } : a)));
  }, []);

  const deleteAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleExportSVG = () => {
    const svgEl = svgContainerRef.current?.querySelector("svg");
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "evecad-drawing.svg";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("SVG drawing downloaded");
  };

  const handleExportDXF = () => {
    // Simple DXF generation with lines and circles
    let dxf = "0\nSECTION\n2\nENTITIES\n";
    const scale = 25.4; // Convert to mm

    models.forEach((model) => {
      const dims = getScaledDims(model);
      const ox = model.position[0] * scale;
      const oy = model.position[2] * scale;

      if (model.type === "cylinder" || model.type === "gear") {
        const r = (dims.w / 2) * scale;
        dxf += `0\nCIRCLE\n8\n0\n10\n${ox}\n20\n${oy}\n40\n${r}\n`;
        if (model.type === "gear") {
          const innerR = (dims.w * 0.33 / 2) * scale;
          dxf += `0\nCIRCLE\n8\n0\n10\n${ox}\n20\n${oy}\n40\n${innerR}\n`;
        }
      } else {
        const hw = (dims.w / 2) * scale;
        const hd = (dims.d / 2) * scale;
        // Rectangle as 4 lines
        dxf += `0\nLINE\n8\n0\n10\n${ox - hw}\n20\n${oy - hd}\n11\n${ox + hw}\n21\n${oy - hd}\n`;
        dxf += `0\nLINE\n8\n0\n10\n${ox + hw}\n20\n${oy - hd}\n11\n${ox + hw}\n21\n${oy + hd}\n`;
        dxf += `0\nLINE\n8\n0\n10\n${ox + hw}\n20\n${oy + hd}\n11\n${ox - hw}\n21\n${oy + hd}\n`;
        dxf += `0\nLINE\n8\n0\n10\n${ox - hw}\n20\n${oy + hd}\n11\n${ox - hw}\n21\n${oy - hd}\n`;
      }
    });

    dxf += "0\nENDSEC\n0\nEOF\n";
    const blob = new Blob([dxf], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "evecad-drawing.dxf";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("DXF drawing downloaded");
  };

  if (models.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="absolute top-16 right-4 z-30 w-72"
      >
        <div className="p-4 rounded-2xl border-2 border-border bg-card/95 backdrop-blur-md kawaii-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
              <Ruler className="w-4 h-4 text-primary" /> CAD Drawing
            </span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground text-center py-6">
            Add some parts first to generate a drawing.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute top-14 left-2 right-2 bottom-2 z-40 flex flex-col"
    >
      <div className="flex-1 rounded-2xl border-2 border-border bg-card/98 backdrop-blur-md kawaii-shadow flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-border">
          <span className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
            <Ruler className="w-4 h-4 text-primary" /> CAD Drawing — {models.length} part{models.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDimensions(!showDimensions)}
              className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-xl border-2 transition-all ${
                showDimensions
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              <Eye className="w-3 h-3" /> Dimensions
            </button>
            <button
              onClick={handleExportSVG}
              className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-primary px-2.5 py-1.5 rounded-xl border-2 border-border hover:border-primary/40 transition-all"
            >
              <Download className="w-3 h-3" /> SVG
            </button>
            <button
              onClick={handleExportDXF}
              className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-primary px-2.5 py-1.5 rounded-xl border-2 border-border hover:border-primary/40 transition-all"
            >
              <Download className="w-3 h-3" /> DXF
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drawing area */}
        <div ref={svgContainerRef} className="flex-1 overflow-auto p-4 bg-muted/30">
          <DrawingSVG models={models} showDimensions={showDimensions} />
        </div>
      </div>
    </motion.div>
  );
}
