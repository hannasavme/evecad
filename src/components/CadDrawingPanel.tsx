import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Download, Ruler, Eye, Type } from "lucide-react";
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

const SHAPE_DIMS: Record<string, { w: number; h: number; d: number }> = {
  box: { w: 1.2, h: 1.2, d: 1.2 },
  cylinder: { w: 1.6, h: 1.5, d: 1.6 },
  gear: { w: 2.7, h: 0.4, d: 2.7 },
  bracket: { w: 2.0, h: 1.2, d: 0.8 },
};

type ViewType = "front" | "top" | "side";

function getScaledDims(model: SceneModel) {
  const base = SHAPE_DIMS[model.type] || SHAPE_DIMS.box;
  return {
    w: base.w * model.scale[0],
    h: base.h * model.scale[1],
    d: base.d * model.scale[2],
  };
}

function dimStr(val: number) {
  return (val * 25.4).toFixed(1);
}

function OrthographicView({ model, view, cx, cy, scale }: { model: SceneModel; view: ViewType; cx: number; cy: number; scale: number }) {
  const dims = getScaledDims(model);
  let vw: number, vh: number;
  if (view === "front") { vw = dims.w; vh = dims.h; }
  else if (view === "top") { vw = dims.w; vh = dims.d; }
  else { vw = dims.d; vh = dims.h; }

  const pw = vw * scale;
  const ph = vh * scale;
  const x = cx - pw / 2;
  const y = cy - ph / 2;
  const showCircle = model.type === "cylinder" && view === "top";
  const showGearProfile = model.type === "gear" && view === "top";
  const dimOffset = 18;
  const tickLen = 5;

  return (
    <g>
      {showCircle ? (
        <>
          <circle cx={cx} cy={cy} r={pw / 2} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={pw * 0.19} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={0.8} strokeDasharray="3 2" />
          <line x1={cx - pw / 2 - 8} y1={cy} x2={cx + pw / 2 + 8} y2={cy} stroke="hsl(330, 80%, 65%)" strokeWidth={0.4} strokeDasharray="6 3" />
          <line x1={cx} y1={cy - ph / 2 - 8} x2={cx} y2={cy + ph / 2 + 8} stroke="hsl(330, 80%, 65%)" strokeWidth={0.4} strokeDasharray="6 3" />
        </>
      ) : showGearProfile ? (
        <>
          <circle cx={cx} cy={cy} r={pw / 2} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={pw * 0.33} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={0.8} />
          <circle cx={cx} cy={cy} r={pw * 0.13} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={0.8} strokeDasharray="3 2" />
          {Array.from({ length: 16 }).map((_, i) => {
            const angle = (i / 16) * Math.PI * 2;
            return (
              <line key={i} x1={cx + Math.cos(angle) * pw * 0.33} y1={cy + Math.sin(angle) * pw * 0.33} x2={cx + Math.cos(angle) * pw / 2} y2={cy + Math.sin(angle) * pw / 2} stroke="hsl(280, 30%, 25%)" strokeWidth={0.5} />
            );
          })}
          <line x1={cx - pw / 2 - 8} y1={cy} x2={cx + pw / 2 + 8} y2={cy} stroke="hsl(330, 80%, 65%)" strokeWidth={0.4} strokeDasharray="6 3" />
          <line x1={cx} y1={cy - ph / 2 - 8} x2={cx} y2={cy + ph / 2 + 8} stroke="hsl(330, 80%, 65%)" strokeWidth={0.4} strokeDasharray="6 3" />
        </>
      ) : (
        <>
          <rect x={x} y={y} width={pw} height={ph} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={1.5} />
          <line x1={cx} y1={y - 6} x2={cx} y2={y + ph + 6} stroke="hsl(330, 80%, 65%)" strokeWidth={0.4} strokeDasharray="6 3" />
          <line x1={x - 6} y1={cy} x2={x + pw + 6} y2={cy} stroke="hsl(330, 80%, 65%)" strokeWidth={0.4} strokeDasharray="6 3" />
          {model.type === "bracket" && view === "front" && (
            <>
              <line x1={x + pw * 0.1} y1={y} x2={x + pw * 0.1} y2={y + ph * 0.83} stroke="hsl(280, 30%, 25%)" strokeWidth={0.8} />
              <line x1={x + pw * 0.9} y1={y} x2={x + pw * 0.9} y2={y + ph * 0.83} stroke="hsl(280, 30%, 25%)" strokeWidth={0.8} />
              <line x1={x + pw * 0.1} y1={y + ph * 0.83} x2={x + pw * 0.9} y2={y + ph * 0.83} stroke="hsl(280, 30%, 25%)" strokeWidth={0.8} />
            </>
          )}
          {model.type === "cylinder" && view === "front" && (
            <>
              <ellipse cx={cx} cy={y} rx={pw / 2} ry={pw * 0.08} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={0.6} strokeDasharray="3 2" />
              <ellipse cx={cx} cy={y + ph} rx={pw / 2} ry={pw * 0.08} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={0.6} />
            </>
          )}
        </>
      )}

      {/* Dimension: width */}
      <g>
        <line x1={x} y1={y + ph + dimOffset} x2={x + pw} y2={y + ph + dimOffset} stroke="hsl(280, 15%, 55%)" strokeWidth={0.6} />
        <line x1={x} y1={y + ph + dimOffset - tickLen} x2={x} y2={y + ph + dimOffset + tickLen} stroke="hsl(280, 15%, 55%)" strokeWidth={0.6} />
        <line x1={x + pw} y1={y + ph + dimOffset - tickLen} x2={x + pw} y2={y + ph + dimOffset + tickLen} stroke="hsl(280, 15%, 55%)" strokeWidth={0.6} />
        <line x1={x} y1={y + ph + 2} x2={x} y2={y + ph + dimOffset + tickLen + 2} stroke="hsl(280, 15%, 55%)" strokeWidth={0.3} />
        <line x1={x + pw} y1={y + ph + 2} x2={x + pw} y2={y + ph + dimOffset + tickLen + 2} stroke="hsl(280, 15%, 55%)" strokeWidth={0.3} />
        <text x={cx} y={y + ph + dimOffset - 4} textAnchor="middle" fontSize={9} fill="hsl(280, 15%, 55%)" fontFamily="monospace">{dimStr(vw)} mm</text>
      </g>

      {/* Dimension: height */}
      <g>
        <line x1={x + pw + dimOffset} y1={y} x2={x + pw + dimOffset} y2={y + ph} stroke="hsl(280, 15%, 55%)" strokeWidth={0.6} />
        <line x1={x + pw + dimOffset - tickLen} y1={y} x2={x + pw + dimOffset + tickLen} y2={y} stroke="hsl(280, 15%, 55%)" strokeWidth={0.6} />
        <line x1={x + pw + dimOffset - tickLen} y1={y + ph} x2={x + pw + dimOffset + tickLen} y2={y + ph} stroke="hsl(280, 15%, 55%)" strokeWidth={0.6} />
        <line x1={x + pw + 2} y1={y} x2={x + pw + dimOffset + tickLen + 2} y2={y} stroke="hsl(280, 15%, 55%)" strokeWidth={0.3} />
        <line x1={x + pw + 2} y1={y + ph} x2={x + pw + dimOffset + tickLen + 2} y2={y + ph} stroke="hsl(280, 15%, 55%)" strokeWidth={0.3} />
        <text x={x + pw + dimOffset + 12} y={cy + 3} textAnchor="middle" fontSize={9} fill="hsl(280, 15%, 55%)" fontFamily="monospace" transform={`rotate(90, ${x + pw + dimOffset + 12}, ${cy})`}>{dimStr(vh)} mm</text>
      </g>
    </g>
  );
}

function EditableText({ x, y, text, fontSize, fill, fontWeight, fontFamily, textAnchor, onUpdate }: {
  x: number; y: number; text: string; fontSize: number; fill: string;
  fontWeight?: string; fontFamily?: string; textAnchor?: string;
  onUpdate: (newText: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);

  if (editing) {
    const inputW = Math.max(value.length * fontSize * 0.65, 60);
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
            width: "100%", height: "100%", fontSize: `${fontSize}px`,
            fontFamily: fontFamily || "monospace", fontWeight: fontWeight || "normal",
            background: "hsl(330, 30%, 97%)", border: "1px solid hsl(330, 80%, 65%)",
            borderRadius: 3, outline: "none", padding: "0 2px", color: fill,
          }}
        />
      </foreignObject>
    );
  }

  return (
    <text x={x} y={y} textAnchor={textAnchor} fontSize={fontSize} fontWeight={fontWeight} fill={fill} fontFamily={fontFamily} style={{ cursor: "text" }} onClick={() => setEditing(true)}>
      {value}
    </text>
  );
}

function DrawingSVG({ models, annotations, onUpdateAnnotation, onDeleteAnnotation, titleText, onUpdateTitle, subtitleText, onUpdateSubtitle }: {
  models: SceneModel[];
  annotations: Annotation[];
  onUpdateAnnotation: (id: string, text: string) => void;
  onDeleteAnnotation: (id: string) => void;
  titleText: string; onUpdateTitle: (t: string) => void;
  subtitleText: string; onUpdateSubtitle: (t: string) => void;
}) {
  const svgWidth = 1190;
  const svgHeight = 842;
  const margin = 20;
  const scl = 60;
  const tbW = 180;
  const tbH = 140;
  const tbX = svgWidth - margin - tbW;
  const tbY = svgHeight - margin - tbH;
  const tbRowH = 20;
  const drawAreaW = svgWidth - margin * 2 - tbW - 20;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <rect width={svgWidth} height={svgHeight} fill="hsl(0, 0%, 100%)" />
      <rect x={margin} y={margin} width={svgWidth - margin * 2} height={svgHeight - margin * 2} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={2} />
      <rect x={margin + 4} y={margin + 4} width={svgWidth - margin * 2 - 8} height={svgHeight - margin * 2 - 8} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={0.5} />

      {/* ISO 7200 Title Block */}
      <rect x={tbX} y={tbY} width={tbW} height={tbH} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={1.5} />
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <line key={i} x1={tbX} y1={tbY + tbRowH * i} x2={tbX + tbW} y2={tbY + tbRowH * i} stroke="hsl(280, 30%, 25%)" strokeWidth={0.5} />
      ))}
      <line x1={tbX + 60} y1={tbY} x2={tbX + 60} y2={tbY + tbH} stroke="hsl(280, 30%, 25%)" strokeWidth={0.5} />

      {["Drawing", "Drawn by", "Date", "Scale", "Material", "Tolerance", "Projection"].map((label, row) => (
        <text key={label} x={tbX + 5} y={tbY + row * tbRowH + 14} fontSize={8} fill="hsl(280, 15%, 55%)" fontFamily="monospace">{label}</text>
      ))}

      <EditableText x={tbX + 65} y={tbY + 14} text={titleText} fontSize={10} fontWeight="bold" fill="hsl(280, 30%, 25%)" fontFamily="monospace" onUpdate={onUpdateTitle} />
      <EditableText x={tbX + 65} y={tbY + tbRowH + 14} text="EveCAD" fontSize={9} fill="hsl(280, 30%, 25%)" fontFamily="monospace" onUpdate={() => {}} />
      <EditableText x={tbX + 65} y={tbY + tbRowH * 2 + 14} text={today} fontSize={9} fill="hsl(280, 30%, 25%)" fontFamily="monospace" onUpdate={() => {}} />
      <EditableText x={tbX + 65} y={tbY + tbRowH * 3 + 14} text="1:1" fontSize={9} fill="hsl(280, 30%, 25%)" fontFamily="monospace" onUpdate={() => {}} />
      <EditableText x={tbX + 65} y={tbY + tbRowH * 4 + 14} text="General" fontSize={9} fill="hsl(280, 30%, 25%)" fontFamily="monospace" onUpdate={() => {}} />
      <EditableText x={tbX + 65} y={tbY + tbRowH * 5 + 14} text="ISO 2768-m" fontSize={9} fill="hsl(280, 30%, 25%)" fontFamily="monospace" onUpdate={() => {}} />

      {/* First-angle projection symbol */}
      <g transform={`translate(${tbX + 100}, ${tbY + tbRowH * 6 + 10})`}>
        <line x1={-8} y1={-5} x2={-8} y2={5} stroke="hsl(280, 30%, 25%)" strokeWidth={1} />
        <line x1={-8} y1={-5} x2={8} y2={-3} stroke="hsl(280, 30%, 25%)" strokeWidth={1} />
        <line x1={-8} y1={5} x2={8} y2={3} stroke="hsl(280, 30%, 25%)" strokeWidth={1} />
        <line x1={8} y1={-3} x2={8} y2={3} stroke="hsl(280, 30%, 25%)" strokeWidth={1} />
        <circle cx={20} cy={0} r={5} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={1} />
        <circle cx={20} cy={0} r={2} fill="none" stroke="hsl(280, 30%, 25%)" strokeWidth={0.5} />
        <line x1={20} y1={-7} x2={20} y2={7} stroke="hsl(330, 80%, 65%)" strokeWidth={0.3} strokeDasharray="2 1" />
        <line x1={13} y1={0} x2={27} y2={0} stroke="hsl(330, 80%, 65%)" strokeWidth={0.3} strokeDasharray="2 1" />
      </g>

      <EditableText x={tbX + tbW / 2} y={tbY - 8} text={subtitleText} fontSize={8} fill="hsl(280, 15%, 55%)" fontFamily="monospace" textAnchor="middle" onUpdate={onUpdateSubtitle} />

      {/* Parts — First-angle projection (EU/ISO) */}
      {models.map((model, idx) => {
        const partStartY = margin + 40 + idx * 350;
        const frontCx = margin + drawAreaW * 0.3;
        const frontCy = partStartY + 100;
        const sideCx = margin + drawAreaW * 0.65;
        const sideCy = frontCy;
        const topCx = frontCx;
        const topCy = frontCy + 160;

        return (
          <g key={model.id}>
            <EditableText x={margin + 10} y={partStartY - 5} text={`Part ${idx + 1}: ${model.label} (${model.type})`} fontSize={10} fontWeight="bold" fill="hsl(330, 80%, 65%)" fontFamily="monospace" onUpdate={() => {}} />

            <text x={frontCx} y={partStartY + 8} textAnchor="middle" fontSize={8} fill="hsl(280, 15%, 55%)" fontFamily="monospace">FRONT VIEW</text>
            <text x={sideCx} y={partStartY + 8} textAnchor="middle" fontSize={8} fill="hsl(280, 15%, 55%)" fontFamily="monospace">RIGHT SIDE VIEW</text>
            <text x={topCx} y={frontCy + 75} textAnchor="middle" fontSize={8} fill="hsl(280, 15%, 55%)" fontFamily="monospace">TOP VIEW</text>

            <OrthographicView model={model} view="front" cx={frontCx} cy={frontCy} scale={scl} />
            <OrthographicView model={model} view="side" cx={sideCx} cy={sideCy} scale={scl} />
            <OrthographicView model={model} view="top" cx={topCx} cy={topCy} scale={scl} />

            <line x1={frontCx + 80} y1={frontCy} x2={sideCx - 80} y2={sideCy} stroke="hsl(280, 15%, 55%)" strokeWidth={0.3} strokeDasharray="4 3" />
            <line x1={frontCx} y1={frontCy + 60} x2={topCx} y2={topCy - 60} stroke="hsl(280, 15%, 55%)" strokeWidth={0.3} strokeDasharray="4 3" />

            {idx < models.length - 1 && (
              <line x1={margin + 4} y1={partStartY + 310} x2={svgWidth - margin - 4} y2={partStartY + 310} stroke="hsl(330, 25%, 88%)" strokeWidth={0.5} strokeDasharray="4 3" />
            )}
          </g>
        );
      })}

      {/* User annotations */}
      {annotations.map((a) => (
        <g key={a.id}>
          <rect x={a.x - 2} y={a.y - 11} width={Math.max(a.text.length * 5.5, 30)} height={14} rx={2} fill="hsl(45, 90%, 95%)" stroke="hsl(45, 70%, 70%)" strokeWidth={0.5} />
          <EditableText x={a.x} y={a.y} text={a.text} fontSize={9} fill="hsl(280, 30%, 25%)" fontFamily="monospace" onUpdate={(t) => { if (t.trim() === "") onDeleteAnnotation(a.id); else onUpdateAnnotation(a.id, t); }} />
        </g>
      ))}
    </svg>
  );
}

export default function CadDrawingPanel({ models, onClose }: CadDrawingPanelProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [titleText, setTitleText] = useState("EveCAD Drawing");
  const [subtitleText, setSubtitleText] = useState(`${models.length} part${models.length !== 1 ? "s" : ""} — Scale 1:1 — mm`);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  const addAnnotation = () => {
    setAnnotations((prev) => [...prev, { id: `ann-${++annotationId}`, x: 30 + Math.random() * 200, y: 40 + Math.random() * 100, text: "Note: edit me" }]);
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
    const blob = new Blob([new XMLSerializer().serializeToString(svgEl)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "evecad-drawing.svg"; a.click();
    URL.revokeObjectURL(url);
    toast.success("SVG drawing downloaded");
  };

  const handleExportDXF = () => {
    let dxf = "0\nSECTION\n2\nENTITIES\n";
    const s = 25.4;
    models.forEach((model) => {
      const dims = getScaledDims(model);
      const ox = model.position[0] * s, oy = model.position[2] * s;
      if (model.type === "cylinder" || model.type === "gear") {
        dxf += `0\nCIRCLE\n8\n0\n10\n${ox}\n20\n${oy}\n40\n${(dims.w / 2) * s}\n`;
        if (model.type === "gear") dxf += `0\nCIRCLE\n8\n0\n10\n${ox}\n20\n${oy}\n40\n${(dims.w * 0.33 / 2) * s}\n`;
      } else {
        const hw = (dims.w / 2) * s, hd = (dims.d / 2) * s;
        dxf += `0\nLINE\n8\n0\n10\n${ox - hw}\n20\n${oy - hd}\n11\n${ox + hw}\n21\n${oy - hd}\n`;
        dxf += `0\nLINE\n8\n0\n10\n${ox + hw}\n20\n${oy - hd}\n11\n${ox + hw}\n21\n${oy + hd}\n`;
        dxf += `0\nLINE\n8\n0\n10\n${ox + hw}\n20\n${oy + hd}\n11\n${ox - hw}\n21\n${oy + hd}\n`;
        dxf += `0\nLINE\n8\n0\n10\n${ox - hw}\n20\n${oy + hd}\n11\n${ox - hw}\n21\n${oy - hd}\n`;
      }
    });
    dxf += "0\nENDSEC\n0\nEOF\n";
    const blob = new Blob([dxf], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "evecad-drawing.dxf"; a.click();
    URL.revokeObjectURL(url);
    toast.success("DXF drawing downloaded");
  };

  if (models.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute top-16 right-4 z-30 w-72">
        <div className="p-4 rounded-2xl border-2 border-border bg-card/95 backdrop-blur-md kawaii-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-extrabold text-foreground flex items-center gap-1.5"><Ruler className="w-4 h-4 text-primary" /> CAD Drawing</span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-xs text-muted-foreground text-center py-6">Add some parts first to generate a drawing.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="absolute top-14 left-2 right-2 bottom-2 z-40 flex flex-col">
      <div className="flex-1 rounded-2xl border-2 border-border bg-card/98 backdrop-blur-md kawaii-shadow flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-border">
          <span className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
            <Ruler className="w-4 h-4 text-primary" /> CAD Drawing — ISO First-Angle — {models.length} part{models.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={addAnnotation} className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-primary px-2.5 py-1.5 rounded-xl border-2 border-border hover:border-primary/40 transition-all">
              <Type className="w-3 h-3" /> Add Note
            </button>
            <button onClick={handleExportSVG} className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-primary px-2.5 py-1.5 rounded-xl border-2 border-border hover:border-primary/40 transition-all">
              <Download className="w-3 h-3" /> SVG
            </button>
            <button onClick={handleExportDXF} className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-primary px-2.5 py-1.5 rounded-xl border-2 border-border hover:border-primary/40 transition-all">
              <Download className="w-3 h-3" /> DXF
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-1"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div ref={svgContainerRef} className="flex-1 overflow-auto p-4 bg-muted/30">
          <DrawingSVG
            models={models}
            annotations={annotations}
            onUpdateAnnotation={updateAnnotation}
            onDeleteAnnotation={deleteAnnotation}
            titleText={titleText}
            onUpdateTitle={setTitleText}
            subtitleText={subtitleText}
            onUpdateSubtitle={setSubtitleText}
          />
        </div>
      </div>
    </motion.div>
  );
}
