import { useState, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { X, Download, Ruler, Type, List, Crosshair, ChevronLeft, ChevronRight, Eye, Layers } from "lucide-react";
import type { SceneModel, ModelParams } from "@/components/ModelViewer";
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

type ViewType = "front" | "top" | "side";

// ─── Shape profile data for each primitive type ──────────

interface ShapeProfile {
  w: number; h: number; d: number;
  frontProfile: (pw: number, ph: number, cx: number, cy: number, params?: ModelParams) => JSX.Element;
  topProfile: (pw: number, ph: number, cx: number, cy: number, params?: ModelParams) => JSX.Element;
  sideProfile: (pw: number, ph: number, cx: number, cy: number, params?: ModelParams) => JSX.Element;
  sectionProfile?: (pw: number, ph: number, cx: number, cy: number, params?: ModelParams) => JSX.Element;
}

const LINE_COLOR = "hsl(280, 30%, 25%)";
const HIDDEN_COLOR = "hsl(280, 20%, 50%)";
const CENTER_COLOR = "hsl(330, 80%, 65%)";
const DIM_COLOR = "hsl(280, 15%, 55%)";
const HATCH_COLOR = "hsl(280, 20%, 65%)";
const SECTION_FILL = "hsl(280, 20%, 96%)";

function centerLines(cx: number, cy: number, hw: number, hh: number) {
  return (
    <>
      <line x1={cx - hw - 8} y1={cy} x2={cx + hw + 8} y2={cy} stroke={CENTER_COLOR} strokeWidth={0.3} strokeDasharray="8 3 2 3" />
      <line x1={cx} y1={cy - hh - 8} x2={cx} y2={cy + hh + 8} stroke={CENTER_COLOR} strokeWidth={0.3} strokeDasharray="8 3 2 3" />
    </>
  );
}

function hatchRect(x: number, y: number, w: number, h: number, spacing = 4) {
  const lines: JSX.Element[] = [];
  const max = w + h;
  for (let d = spacing; d < max; d += spacing) {
    const x1 = x + Math.min(d, w);
    const y1 = y + Math.max(0, d - w);
    const x2 = x + Math.max(0, d - h);
    const y2 = y + Math.min(d, h);
    lines.push(<line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke={HATCH_COLOR} strokeWidth={0.3} />);
  }
  return <g>{lines}</g>;
}

function rectView(cx: number, cy: number, pw: number, ph: number) {
  return (
    <>
      <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
      {centerLines(cx, cy, pw / 2, ph / 2)}
    </>
  );
}

function circleView(cx: number, cy: number, r: number, innerR?: number) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
      {innerR && <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={LINE_COLOR} strokeWidth={0.8} />}
      {centerLines(cx, cy, r, r)}
    </>
  );
}

const defaultProfile: ShapeProfile = {
  w: 1.2, h: 1.2, d: 1.2,
  frontProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw, ph),
  topProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw, ph),
  sideProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw, ph),
  sectionProfile: (pw, ph, cx, cy) => (
    <>
      <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} fill={SECTION_FILL} stroke={LINE_COLOR} strokeWidth={1.5} />
      {hatchRect(cx - pw / 2, cy - ph / 2, pw, ph)}
    </>
  ),
};

const PROFILES: Record<string, Partial<ShapeProfile>> = {
  box: { w: 1.2, h: 1.2, d: 1.2 },
  cylinder: {
    w: 1.6, h: 1.5, d: 1.6,
    frontProfile: (pw, ph, cx, cy) => (
      <>
        <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
        <ellipse cx={cx} cy={cy - ph / 2} rx={pw / 2} ry={pw * 0.08} fill="none" stroke={HIDDEN_COLOR} strokeWidth={0.5} strokeDasharray="3 2" />
        <ellipse cx={cx} cy={cy + ph / 2} rx={pw / 2} ry={pw * 0.08} fill="none" stroke={LINE_COLOR} strokeWidth={0.8} />
        {centerLines(cx, cy, pw / 2, ph / 2)}
      </>
    ),
    topProfile: (pw, _ph, cx, cy) => circleView(cx, cy, pw / 2),
    sideProfile: (pw, ph, cx, cy) => (
      <>
        <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
        {centerLines(cx, cy, pw / 2, ph / 2)}
      </>
    ),
    sectionProfile: (pw, ph, cx, cy) => {
      const wallT = pw * 0.08;
      return (
        <>
          <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} fill={SECTION_FILL} stroke={LINE_COLOR} strokeWidth={1.5} />
          {hatchRect(cx - pw / 2, cy - ph / 2, wallT, ph)}
          {hatchRect(cx + pw / 2 - wallT, cy - ph / 2, wallT, ph)}
          <line x1={cx - pw / 2 + wallT} y1={cy - ph / 2} x2={cx + pw / 2 - wallT} y2={cy - ph / 2} stroke={LINE_COLOR} strokeWidth={0.5} />
        </>
      );
    },
  },
  sphere: {
    w: 1.6, h: 1.6, d: 1.6,
    frontProfile: (pw, _ph, cx, cy) => circleView(cx, cy, pw / 2),
    topProfile: (pw, _ph, cx, cy) => circleView(cx, cy, pw / 2),
    sideProfile: (pw, _ph, cx, cy) => circleView(cx, cy, pw / 2),
  },
  cone: {
    w: 1.6, h: 1.5, d: 1.6,
    frontProfile: (pw, ph, cx, cy, params) => {
      const topR = (params?.radiusTop ?? 0.2) / (params?.radiusBottom ?? 0.8) * pw / 2;
      const botR = pw / 2;
      return (
        <>
          <line x1={cx - topR} y1={cy - ph / 2} x2={cx - botR} y2={cy + ph / 2} stroke={LINE_COLOR} strokeWidth={1.5} />
          <line x1={cx + topR} y1={cy - ph / 2} x2={cx + botR} y2={cy + ph / 2} stroke={LINE_COLOR} strokeWidth={1.5} />
          <line x1={cx - topR} y1={cy - ph / 2} x2={cx + topR} y2={cy - ph / 2} stroke={LINE_COLOR} strokeWidth={1} />
          <line x1={cx - botR} y1={cy + ph / 2} x2={cx + botR} y2={cy + ph / 2} stroke={LINE_COLOR} strokeWidth={1.5} />
          {centerLines(cx, cy, botR, ph / 2)}
        </>
      );
    },
    topProfile: (pw, _ph, cx, cy) => circleView(cx, cy, pw / 2),
    sideProfile: (pw, ph, cx, cy, params) => {
      const topR = (params?.radiusTop ?? 0.2) / (params?.radiusBottom ?? 0.8) * pw / 2;
      const botR = pw / 2;
      return (
        <>
          <line x1={cx - topR} y1={cy - ph / 2} x2={cx - botR} y2={cy + ph / 2} stroke={LINE_COLOR} strokeWidth={1.5} />
          <line x1={cx + topR} y1={cy - ph / 2} x2={cx + botR} y2={cy + ph / 2} stroke={LINE_COLOR} strokeWidth={1.5} />
          <line x1={cx - topR} y1={cy - ph / 2} x2={cx + topR} y2={cy - ph / 2} stroke={LINE_COLOR} strokeWidth={1} />
          <line x1={cx - botR} y1={cy + ph / 2} x2={cx + botR} y2={cy + ph / 2} stroke={LINE_COLOR} strokeWidth={1.5} />
          {centerLines(cx, cy, botR, ph / 2)}
        </>
      );
    },
  },
  gear: {
    w: 2.7, h: 0.4, d: 2.7,
    frontProfile: (pw, ph, cx, cy) => (
      <>
        <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={ph * 0.4} fill="none" stroke={HIDDEN_COLOR} strokeWidth={0.5} strokeDasharray="3 2" />
        {centerLines(cx, cy, pw / 2, ph / 2)}
      </>
    ),
    topProfile: (pw, _ph, cx, cy) => {
      const r = pw / 2;
      const teethCount = 16;
      const toothDepth = r * 0.12;
      const toothPaths: JSX.Element[] = [];
      for (let i = 0; i < teethCount; i++) {
        const a1 = (i / teethCount) * Math.PI * 2;
        const a2 = ((i + 0.4) / teethCount) * Math.PI * 2;
        toothPaths.push(
          <line key={i} x1={cx + Math.cos(a1) * (r - toothDepth)} y1={cy + Math.sin(a1) * (r - toothDepth)} x2={cx + Math.cos(a1) * r} y2={cy + Math.sin(a1) * r} stroke={LINE_COLOR} strokeWidth={0.8} />,
          <line key={`t${i}`} x1={cx + Math.cos(a1) * r} y1={cy + Math.sin(a1) * r} x2={cx + Math.cos(a2) * r} y2={cy + Math.sin(a2) * r} stroke={LINE_COLOR} strokeWidth={0.8} />
        );
      }
      return (
        <>
          <circle cx={cx} cy={cy} r={r - toothDepth} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={r * 0.25} fill="none" stroke={LINE_COLOR} strokeWidth={1} />
          {toothPaths}
          {centerLines(cx, cy, r, r)}
        </>
      );
    },
    sideProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw * 0.15, ph),
  },
  bracket: {
    w: 2.0, h: 1.2, d: 0.8,
    frontProfile: (pw, ph, cx, cy) => {
      const x = cx - pw / 2, y = cy - ph / 2;
      return (
        <>
          <rect x={x} y={y} width={pw} height={ph} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <line x1={x + pw * 0.12} y1={y} x2={x + pw * 0.12} y2={y + ph * 0.82} stroke={LINE_COLOR} strokeWidth={0.8} />
          <line x1={x + pw * 0.88} y1={y} x2={x + pw * 0.88} y2={y + ph * 0.82} stroke={LINE_COLOR} strokeWidth={0.8} />
          <line x1={x + pw * 0.12} y1={y + ph * 0.82} x2={x + pw * 0.88} y2={y + ph * 0.82} stroke={LINE_COLOR} strokeWidth={0.8} />
          <circle cx={cx} cy={y + ph * 0.4} r={pw * 0.08} fill="none" stroke={LINE_COLOR} strokeWidth={0.8} />
          {centerLines(cx, cy, pw / 2, ph / 2)}
        </>
      );
    },
    topProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw, ph),
    sideProfile: (pw, ph, cx, cy) => {
      const x = cx - pw / 2, y = cy - ph / 2;
      return (
        <>
          <path d={`M${x},${y} L${x + pw},${y} L${x + pw},${y + ph} L${x + pw * 0.75},${y + ph} L${x + pw * 0.75},${y + ph * 0.18} L${x},${y + ph * 0.18} Z`} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          {centerLines(cx, cy, pw / 2, ph / 2)}
        </>
      );
    },
  },
  wheel: {
    w: 1.8, h: 1.8, d: 0.6,
    frontProfile: (pw, _ph, cx, cy, params) => {
      const r = pw / 2;
      const hubR = r * 0.3;
      const spokeCount = params?.spokes ?? 6;
      const spokes: JSX.Element[] = [];
      for (let i = 0; i < spokeCount; i++) {
        const a = (i / spokeCount) * Math.PI * 2;
        spokes.push(
          <line key={i} x1={cx + Math.cos(a) * hubR} y1={cy + Math.sin(a) * hubR} x2={cx + Math.cos(a) * (r * 0.75)} y2={cy + Math.sin(a) * (r * 0.75)} stroke={LINE_COLOR} strokeWidth={0.6} />
        );
      }
      return (
        <>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={r * 0.85} fill="none" stroke={LINE_COLOR} strokeWidth={0.8} />
          <circle cx={cx} cy={cy} r={hubR} fill="none" stroke={LINE_COLOR} strokeWidth={1} />
          <circle cx={cx} cy={cy} r={hubR * 0.4} fill="none" stroke={HIDDEN_COLOR} strokeWidth={0.5} strokeDasharray="3 2" />
          {spokes}
          {centerLines(cx, cy, r, r)}
        </>
      );
    },
    topProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw, ph * 0.6),
    sideProfile: (pw, ph, cx, cy) => {
      const r = pw / 2;
      return (
        <>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={r * 0.85} fill="none" stroke={LINE_COLOR} strokeWidth={0.8} />
          {centerLines(cx, cy, r, r)}
        </>
      );
    },
    sectionProfile: (pw, ph, cx, cy) => {
      const r = pw / 2;
      const tireT = r * 0.15;
      return (
        <>
          <rect x={cx - ph * 0.3} y={cy - r} width={ph * 0.6} height={r * 2} fill={SECTION_FILL} stroke={LINE_COLOR} strokeWidth={1.5} />
          {hatchRect(cx - ph * 0.3, cy - r, tireT, r * 2, 3)}
          {hatchRect(cx + ph * 0.3 - tireT, cy - r, tireT, r * 2, 3)}
          {centerLines(cx, cy, ph * 0.3, r)}
        </>
      );
    },
  },
  bolt: {
    w: 0.6, h: 2.0, d: 0.6,
    frontProfile: (pw, ph, cx, cy) => {
      const headH = ph * 0.12;
      const headW = pw;
      const shaftW = pw * 0.4;
      return (
        <>
          <rect x={cx - headW / 2} y={cy - ph / 2} width={headW} height={headH} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <rect x={cx - shaftW / 2} y={cy - ph / 2 + headH} width={shaftW} height={ph - headH} fill="none" stroke={LINE_COLOR} strokeWidth={1.2} />
          {/* Thread lines */}
          {Array.from({ length: Math.floor((ph - headH) / 4) }).map((_, i) => (
            <line key={i} x1={cx - shaftW / 2} y1={cy - ph / 2 + headH + i * 4 + 2} x2={cx + shaftW / 2} y2={cy - ph / 2 + headH + i * 4 + 2} stroke={HIDDEN_COLOR} strokeWidth={0.3} />
          ))}
          {centerLines(cx, cy, headW / 2, ph / 2)}
        </>
      );
    },
    topProfile: (pw, _ph, cx, cy) => {
      const r = pw / 2;
      return (
        <>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke={LINE_COLOR} strokeWidth={0.5} />
          <line x1={cx - r * 0.87} y1={cy - r * 0.5} x2={cx + r * 0.87} y2={cy + r * 0.5} stroke={LINE_COLOR} strokeWidth={0.5} />
          <line x1={cx - r * 0.87} y1={cy + r * 0.5} x2={cx + r * 0.87} y2={cy - r * 0.5} stroke={LINE_COLOR} strokeWidth={0.5} />
          {centerLines(cx, cy, r, r)}
        </>
      );
    },
    sideProfile: (pw, ph, cx, cy) => {
      const headH = ph * 0.12;
      const headW = pw;
      const shaftW = pw * 0.4;
      return (
        <>
          <rect x={cx - headW / 2} y={cy - ph / 2} width={headW} height={headH} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <rect x={cx - shaftW / 2} y={cy - ph / 2 + headH} width={shaftW} height={ph - headH} fill="none" stroke={LINE_COLOR} strokeWidth={1.2} />
          {centerLines(cx, cy, headW / 2, ph / 2)}
        </>
      );
    },
  },
  nut: {
    w: 0.6, h: 0.4, d: 0.6,
    frontProfile: (pw, ph, cx, cy) => (
      <>
        <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={pw * 0.2} fill="none" stroke={HIDDEN_COLOR} strokeWidth={0.5} strokeDasharray="3 2" />
        {centerLines(cx, cy, pw / 2, ph / 2)}
      </>
    ),
    topProfile: (pw, _ph, cx, cy) => {
      const r = pw / 2;
      return (
        <>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={r * 0.4} fill="none" stroke={LINE_COLOR} strokeWidth={1} />
          <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke={LINE_COLOR} strokeWidth={0.5} />
          <line x1={cx - r * 0.87} y1={cy - r * 0.5} x2={cx + r * 0.87} y2={cy + r * 0.5} stroke={LINE_COLOR} strokeWidth={0.5} />
          <line x1={cx - r * 0.87} y1={cy + r * 0.5} x2={cx + r * 0.87} y2={cy - r * 0.5} stroke={LINE_COLOR} strokeWidth={0.5} />
          {centerLines(cx, cy, r, r)}
        </>
      );
    },
    sideProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw, ph),
  },
  bearing: {
    w: 1.8, h: 1.8, d: 0.5,
    frontProfile: (pw, _ph, cx, cy, params) => {
      const outerR = pw / 2;
      const innerR = outerR * (params?.innerRadius ?? 0.2) / (params?.outerRadius ?? 0.5);
      const raceR = (outerR + innerR) / 2;
      const ballR = (outerR - innerR) * 0.2;
      const ballCount = params?.ballCount ?? 8;
      const balls: JSX.Element[] = [];
      for (let i = 0; i < ballCount; i++) {
        const a = (i / ballCount) * Math.PI * 2;
        balls.push(<circle key={i} cx={cx + Math.cos(a) * raceR} cy={cy + Math.sin(a) * raceR} r={ballR} fill="none" stroke={LINE_COLOR} strokeWidth={0.5} />);
      }
      return (
        <>
          <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={LINE_COLOR} strokeWidth={1.2} />
          <circle cx={cx} cy={cy} r={raceR} fill="none" stroke={HIDDEN_COLOR} strokeWidth={0.3} strokeDasharray="3 2" />
          {balls}
          {centerLines(cx, cy, outerR, outerR)}
        </>
      );
    },
    topProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw, ph),
    sideProfile: (pw, _ph, cx, cy) => circleView(cx, cy, pw / 2),
    sectionProfile: (pw, ph, cx, cy) => {
      const outerR = pw / 2;
      const innerR = outerR * 0.4;
      const w = ph;
      return (
        <>
          <rect x={cx - w / 2} y={cy - outerR} width={w} height={outerR * 2} fill={SECTION_FILL} stroke={LINE_COLOR} strokeWidth={1.5} />
          <rect x={cx - w / 2 + w * 0.2} y={cy - innerR} width={w * 0.6} height={innerR * 2} fill="white" stroke={LINE_COLOR} strokeWidth={0.8} />
          <circle cx={cx} cy={cy - (outerR + innerR) / 2} r={(outerR - innerR) * 0.2} fill="none" stroke={LINE_COLOR} strokeWidth={0.6} />
          <circle cx={cx} cy={cy + (outerR + innerR) / 2} r={(outerR - innerR) * 0.2} fill="none" stroke={LINE_COLOR} strokeWidth={0.6} />
          {hatchRect(cx - w / 2, cy - outerR, w * 0.18, outerR * 2, 3)}
          {hatchRect(cx + w / 2 - w * 0.18, cy - outerR, w * 0.18, outerR * 2, 3)}
          {centerLines(cx, cy, w / 2, outerR)}
        </>
      );
    },
  },
  screw: {
    w: 0.4, h: 1.6, d: 0.4,
    frontProfile: (pw, ph, cx, cy) => {
      const headH = ph * 0.08;
      const headW = pw;
      const shaftW = pw * 0.4;
      return (
        <>
          <rect x={cx - headW / 2} y={cy - ph / 2} width={headW} height={headH} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <line x1={cx - shaftW / 2} y1={cy - ph / 2 + headH} x2={cx - shaftW * 0.15} y2={cy + ph / 2} stroke={LINE_COLOR} strokeWidth={1.2} />
          <line x1={cx + shaftW / 2} y1={cy - ph / 2 + headH} x2={cx + shaftW * 0.15} y2={cy + ph / 2} stroke={LINE_COLOR} strokeWidth={1.2} />
          {centerLines(cx, cy, headW / 2, ph / 2)}
        </>
      );
    },
    topProfile: (pw, _ph, cx, cy) => {
      const r = pw / 2;
      return (
        <>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <line x1={cx - r * 0.5} y1={cy} x2={cx + r * 0.5} y2={cy} stroke={LINE_COLOR} strokeWidth={0.8} />
          <line x1={cx} y1={cy - r * 0.5} x2={cx} y2={cy + r * 0.5} stroke={LINE_COLOR} strokeWidth={0.8} />
          {centerLines(cx, cy, r, r)}
        </>
      );
    },
    sideProfile: (pw, ph, cx, cy) => {
      const headH = ph * 0.08;
      const shaftW = pw * 0.4;
      return (
        <>
          <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={headH} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <line x1={cx - shaftW / 2} y1={cy - ph / 2 + headH} x2={cx - shaftW * 0.15} y2={cy + ph / 2} stroke={LINE_COLOR} strokeWidth={1.2} />
          <line x1={cx + shaftW / 2} y1={cy - ph / 2 + headH} x2={cx + shaftW * 0.15} y2={cy + ph / 2} stroke={LINE_COLOR} strokeWidth={1.2} />
          {centerLines(cx, cy, pw / 2, ph / 2)}
        </>
      );
    },
  },
  pulley: {
    w: 1.8, h: 1.8, d: 0.6,
    frontProfile: (pw, _ph, cx, cy) => {
      const r = pw / 2;
      return (
        <>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={r * 0.85} fill="none" stroke={LINE_COLOR} strokeWidth={0.8} />
          <circle cx={cx} cy={cy} r={r * 0.25} fill="none" stroke={LINE_COLOR} strokeWidth={1} />
          <circle cx={cx} cy={cy} r={r * 0.1} fill="none" stroke={HIDDEN_COLOR} strokeWidth={0.5} strokeDasharray="3 2" />
          {centerLines(cx, cy, r, r)}
        </>
      );
    },
    topProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw, ph),
    sideProfile: (pw, _ph, cx, cy) => circleView(cx, cy, pw / 2),
  },
  shaft: {
    w: 0.4, h: 2.0, d: 0.4,
    frontProfile: (pw, ph, cx, cy) => {
      const keyW = pw * 0.2;
      return (
        <>
          <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <rect x={cx + pw / 2 - keyW} y={cy - ph * 0.3} width={keyW} height={ph * 0.6} fill="none" stroke={LINE_COLOR} strokeWidth={0.6} />
          {centerLines(cx, cy, pw / 2, ph / 2)}
        </>
      );
    },
    topProfile: (pw, _ph, cx, cy) => {
      const r = pw / 2;
      return (
        <>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <rect x={cx + r * 0.3} y={cy - r * 0.15} width={r * 0.4} height={r * 0.3} fill="none" stroke={LINE_COLOR} strokeWidth={0.6} />
          {centerLines(cx, cy, r, r)}
        </>
      );
    },
    sideProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw, ph),
  },
  camera: {
    w: 0.8, h: 0.6, d: 0.8,
    frontProfile: (pw, ph, cx, cy) => {
      const lensR = Math.min(pw, ph) * 0.25;
      return (
        <>
          <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={lensR} fill="none" stroke={LINE_COLOR} strokeWidth={1} />
          <circle cx={cx} cy={cy} r={lensR * 0.6} fill="none" stroke={HIDDEN_COLOR} strokeWidth={0.5} strokeDasharray="3 2" />
          {centerLines(cx, cy, pw / 2, ph / 2)}
        </>
      );
    },
    topProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw, ph),
    sideProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw * 0.8, ph),
  },
  antenna: {
    w: 1.5, h: 2.5, d: 1.5,
    frontProfile: (pw, ph, cx, cy) => {
      const dishW = pw * 0.8;
      const mastH = ph * 0.6;
      const mastW = pw * 0.04;
      return (
        <>
          <ellipse cx={cx} cy={cy - ph / 2 + ph * 0.15} rx={dishW / 2} ry={ph * 0.12} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <rect x={cx - mastW / 2} y={cy - ph / 2 + ph * 0.25} width={mastW} height={mastH} fill="none" stroke={LINE_COLOR} strokeWidth={1} />
          <rect x={cx - pw * 0.08} y={cy + ph / 2 - ph * 0.04} width={pw * 0.16} height={ph * 0.04} fill="none" stroke={LINE_COLOR} strokeWidth={0.8} />
          {centerLines(cx, cy, pw / 2, ph / 2)}
        </>
      );
    },
    topProfile: (pw, _ph, cx, cy) => circleView(cx, cy, pw * 0.4),
    sideProfile: (pw, ph, cx, cy) => {
      const dishW = pw * 0.8;
      const mastW = pw * 0.04;
      return (
        <>
          <ellipse cx={cx} cy={cy - ph / 2 + ph * 0.15} rx={dishW / 2} ry={ph * 0.12} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <rect x={cx - mastW / 2} y={cy - ph / 2 + ph * 0.25} width={mastW} height={ph * 0.6} fill="none" stroke={LINE_COLOR} strokeWidth={1} />
          {centerLines(cx, cy, pw / 2, ph / 2)}
        </>
      );
    },
  },
  drill: {
    w: 0.5, h: 2.5, d: 0.5,
    frontProfile: (pw, ph, cx, cy) => {
      const motorH = ph * 0.2;
      const motorW = pw * 0.8;
      const bitW = pw * 0.3;
      return (
        <>
          <rect x={cx - motorW / 2} y={cy - ph / 2} width={motorW} height={motorH} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <line x1={cx - bitW / 2} y1={cy - ph / 2 + motorH} x2={cx - bitW * 0.15} y2={cy + ph / 2} stroke={LINE_COLOR} strokeWidth={1.2} />
          <line x1={cx + bitW / 2} y1={cy - ph / 2 + motorH} x2={cx + bitW * 0.15} y2={cy + ph / 2} stroke={LINE_COLOR} strokeWidth={1.2} />
          {/* Spiral indication */}
          {Array.from({ length: 5 }).map((_, i) => {
            const y = cy - ph / 2 + motorH + (ph - motorH) * (i + 0.5) / 5;
            const w = bitW * (1 - i * 0.1);
            return <line key={i} x1={cx - w / 2} y1={y} x2={cx + w / 2} y2={y - 3} stroke={HIDDEN_COLOR} strokeWidth={0.4} />;
          })}
          {centerLines(cx, cy, motorW / 2, ph / 2)}
        </>
      );
    },
    topProfile: (pw, _ph, cx, cy) => circleView(cx, cy, pw * 0.4),
    sideProfile: (pw, ph, cx, cy) => {
      const motorH = ph * 0.2;
      const motorW = pw * 0.8;
      const bitW = pw * 0.3;
      return (
        <>
          <rect x={cx - motorW / 2} y={cy - ph / 2} width={motorW} height={motorH} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <line x1={cx - bitW / 2} y1={cy - ph / 2 + motorH} x2={cx - bitW * 0.15} y2={cy + ph / 2} stroke={LINE_COLOR} strokeWidth={1.2} />
          <line x1={cx + bitW / 2} y1={cy - ph / 2 + motorH} x2={cx + bitW * 0.15} y2={cy + ph / 2} stroke={LINE_COLOR} strokeWidth={1.2} />
          {centerLines(cx, cy, motorW / 2, ph / 2)}
        </>
      );
    },
  },
  mug: {
    w: 1.4, h: 1.6, d: 1.0,
    frontProfile: (pw, ph, cx, cy) => {
      const handleW = pw * 0.2;
      return (
        <>
          <rect x={cx - pw / 2 + handleW} y={cy - ph / 2} width={pw - handleW} height={ph} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <ellipse cx={cx - pw / 2 + handleW + (pw - handleW) / 2} cy={cy - ph / 2} rx={(pw - handleW) / 2} ry={ph * 0.06} fill="none" stroke={LINE_COLOR} strokeWidth={0.6} />
          {/* Handle */}
          <ellipse cx={cx - pw / 2 + handleW * 0.3} cy={cy} rx={handleW * 0.4} ry={ph * 0.25} fill="none" stroke={LINE_COLOR} strokeWidth={1.2} />
          {centerLines(cx, cy, pw / 2, ph / 2)}
        </>
      );
    },
    topProfile: (pw, _ph, cx, cy) => circleView(cx, cy, pw * 0.35, pw * 0.3),
    sideProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw * 0.7, ph),
    sectionProfile: (pw, ph, cx, cy) => {
      const wall = pw * 0.05;
      const x = cx - pw / 2, y = cy - ph / 2;
      return (
        <>
          <rect x={x + pw * 0.15} y={y} width={pw * 0.7} height={ph} fill={SECTION_FILL} stroke={LINE_COLOR} strokeWidth={1.5} />
          {hatchRect(x + pw * 0.15, y, wall, ph, 3)}
          {hatchRect(x + pw * 0.85 - wall, y, wall, ph, 3)}
          {hatchRect(x + pw * 0.15, y + ph - wall * 2, pw * 0.7, wall * 2, 3)}
          {centerLines(cx, cy, pw / 2, ph / 2)}
        </>
      );
    },
  },
  hammer: {
    w: 1.2, h: 3.0, d: 0.5,
    frontProfile: (pw, ph, cx, cy) => {
      const handleW = pw * 0.1;
      const handleH = ph * 0.7;
      const headW = pw;
      const headH = ph * 0.25;
      return (
        <>
          {/* Handle */}
          <rect x={cx - handleW / 2} y={cy - ph / 2 + headH} width={handleW} height={handleH} fill="none" stroke={LINE_COLOR} strokeWidth={1.2} />
          {/* Head */}
          <rect x={cx - headW / 2} y={cy - ph / 2} width={headW} height={headH} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          {/* Peen curve */}
          <ellipse cx={cx - headW / 2} cy={cy - ph / 2 + headH / 2} rx={headH * 0.3} ry={headH * 0.4} fill="none" stroke={LINE_COLOR} strokeWidth={0.8} />
          {centerLines(cx, cy, headW / 2, ph / 2)}
        </>
      );
    },
    topProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw, ph * 0.15),
    sideProfile: (pw, ph, cx, cy) => {
      const handleW = pw * 0.1;
      const headH = ph * 0.25;
      return (
        <>
          <rect x={cx - handleW / 2} y={cy - ph / 2 + headH} width={handleW} height={ph * 0.7} fill="none" stroke={LINE_COLOR} strokeWidth={1.2} />
          <rect x={cx - pw * 0.3 / 2} y={cy - ph / 2} width={pw * 0.3} height={headH} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          {centerLines(cx, cy, pw / 2, ph / 2)}
        </>
      );
    },
  },
  handle: {
    w: 0.8, h: 1.2, d: 0.8,
    frontProfile: (pw, ph, cx, cy) => {
      const knobR = pw * 0.35;
      const stemW = pw * 0.15;
      return (
        <>
          <circle cx={cx} cy={cy - ph / 2 + knobR} r={knobR} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <rect x={cx - stemW / 2} y={cy - ph / 2 + knobR * 2} width={stemW} height={ph - knobR * 2} fill="none" stroke={LINE_COLOR} strokeWidth={1.2} />
          <rect x={cx - pw * 0.2} y={cy + ph / 2 - ph * 0.04} width={pw * 0.4} height={ph * 0.04} fill="none" stroke={LINE_COLOR} strokeWidth={0.8} />
          {centerLines(cx, cy, pw / 2, ph / 2)}
        </>
      );
    },
    topProfile: (pw, _ph, cx, cy) => circleView(cx, cy, pw * 0.35),
    sideProfile: (pw, ph, cx, cy) => {
      const knobR = pw * 0.35;
      const stemW = pw * 0.15;
      return (
        <>
          <circle cx={cx} cy={cy - ph / 2 + knobR} r={knobR} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <rect x={cx - stemW / 2} y={cy - ph / 2 + knobR * 2} width={stemW} height={ph - knobR * 2} fill="none" stroke={LINE_COLOR} strokeWidth={1.2} />
          {centerLines(cx, cy, pw / 2, ph / 2)}
        </>
      );
    },
  },
  track: {
    w: 3.0, h: 1.0, d: 0.6,
    frontProfile: (pw, ph, cx, cy) => {
      const wheelR = ph * 0.3;
      return (
        <>
          <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} rx={wheelR} />
          {Array.from({ length: 4 }).map((_, i) => {
            const wx = cx - pw / 2 + pw * (i + 0.5) / 4;
            return <circle key={i} cx={wx} cy={cy + ph * 0.1} r={wheelR * 0.7} fill="none" stroke={LINE_COLOR} strokeWidth={0.6} />;
          })}
          <circle cx={cx - pw / 2 + wheelR} cy={cy - ph * 0.1} r={wheelR * 0.9} fill="none" stroke={LINE_COLOR} strokeWidth={0.8} />
          <circle cx={cx + pw / 2 - wheelR} cy={cy - ph * 0.1} r={wheelR * 0.8} fill="none" stroke={LINE_COLOR} strokeWidth={0.8} />
          {centerLines(cx, cy, pw / 2, ph / 2)}
        </>
      );
    },
    topProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw, ph * 0.5),
    sideProfile: (pw, ph, cx, cy) => {
      const wheelR = ph * 0.3;
      return (
        <>
          <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} rx={wheelR} />
          {centerLines(cx, cy, pw / 2, ph / 2)}
        </>
      );
    },
  },
  torus: {
    w: 1.6, h: 1.6, d: 0.4,
    frontProfile: (pw, _ph, cx, cy) => {
      const r = pw / 2;
      const tubeR = r * 0.2;
      return (
        <>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={r - tubeR * 2} fill="none" stroke={LINE_COLOR} strokeWidth={1} />
          {centerLines(cx, cy, r, r)}
        </>
      );
    },
    topProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw, ph * 0.25),
    sideProfile: (pw, _ph, cx, cy) => {
      const r = pw / 2;
      const tubeR = r * 0.2;
      return (
        <>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={r - tubeR * 2} fill="none" stroke={LINE_COLOR} strokeWidth={1} />
          {centerLines(cx, cy, r, r)}
        </>
      );
    },
  },
  tube: {
    w: 1.6, h: 1.5, d: 1.6,
    frontProfile: (pw, ph, cx, cy) => (
      <>
        <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
        <rect x={cx - pw * 0.35} y={cy - ph / 2} width={pw * 0.7} height={ph} fill="none" stroke={HIDDEN_COLOR} strokeWidth={0.5} strokeDasharray="3 2" />
        {centerLines(cx, cy, pw / 2, ph / 2)}
      </>
    ),
    topProfile: (pw, _ph, cx, cy) => {
      const r = pw / 2;
      return (
        <>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={r * 0.7} fill="none" stroke={LINE_COLOR} strokeWidth={1} />
          {centerLines(cx, cy, r, r)}
        </>
      );
    },
    sideProfile: (pw, ph, cx, cy) => (
      <>
        <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
        <rect x={cx - pw * 0.35} y={cy - ph / 2} width={pw * 0.7} height={ph} fill="none" stroke={HIDDEN_COLOR} strokeWidth={0.5} strokeDasharray="3 2" />
        {centerLines(cx, cy, pw / 2, ph / 2)}
      </>
    ),
  },
  plate: {
    w: 2.0, h: 0.2, d: 1.5,
    frontProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw, ph),
    topProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw, ph),
    sideProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw * 0.75, ph),
  },
  wedge: {
    w: 1.5, h: 1.2, d: 1.0,
    frontProfile: (pw, ph, cx, cy) => {
      const x = cx - pw / 2, y = cy - ph / 2;
      return (
        <>
          <path d={`M${x},${y + ph} L${x + pw},${y + ph} L${x + pw},${y} Z`} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          {centerLines(cx, cy, pw / 2, ph / 2)}
        </>
      );
    },
    topProfile: (pw, ph, cx, cy) => rectView(cx, cy, pw, ph),
    sideProfile: (pw, ph, cx, cy) => {
      const x = cx - pw / 2, y = cy - ph / 2;
      return (
        <>
          <path d={`M${x},${y + ph} L${x + pw},${y + ph} L${x + pw},${y} Z`} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
          {centerLines(cx, cy, pw / 2, ph / 2)}
        </>
      );
    },
  },
};

function getProfile(type: string): ShapeProfile {
  const p = PROFILES[type] || {};
  return { ...defaultProfile, ...p };
}

// ─── Dimension lines with arrows ──────────

function DimensionH({ x1, x2, y, value }: { x1: number; x2: number; y: number; value: string }) {
  const arrowSize = 3;
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={DIM_COLOR} strokeWidth={0.5} />
      {/* Left arrow */}
      <polygon points={`${x1},${y} ${x1 + arrowSize * 2},${y - arrowSize} ${x1 + arrowSize * 2},${y + arrowSize}`} fill={DIM_COLOR} />
      {/* Right arrow */}
      <polygon points={`${x2},${y} ${x2 - arrowSize * 2},${y - arrowSize} ${x2 - arrowSize * 2},${y + arrowSize}`} fill={DIM_COLOR} />
      {/* Extension lines */}
      <line x1={x1} y1={y - 10} x2={x1} y2={y + 4} stroke={DIM_COLOR} strokeWidth={0.3} />
      <line x1={x2} y1={y - 10} x2={x2} y2={y + 4} stroke={DIM_COLOR} strokeWidth={0.3} />
      {/* Text */}
      <text x={(x1 + x2) / 2} y={y - 3} textAnchor="middle" fontSize={8} fill={DIM_COLOR} fontFamily="monospace">{value}</text>
    </g>
  );
}

function DimensionV({ y1, y2, x, value }: { y1: number; y2: number; x: number; value: string }) {
  const arrowSize = 3;
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={DIM_COLOR} strokeWidth={0.5} />
      <polygon points={`${x},${y1} ${x - arrowSize},${y1 + arrowSize * 2} ${x + arrowSize},${y1 + arrowSize * 2}`} fill={DIM_COLOR} />
      <polygon points={`${x},${y2} ${x - arrowSize},${y2 - arrowSize * 2} ${x + arrowSize},${y2 - arrowSize * 2}`} fill={DIM_COLOR} />
      <line x1={x - 4} y1={y1} x2={x + 10} y2={y1} stroke={DIM_COLOR} strokeWidth={0.3} />
      <line x1={x - 4} y1={y2} x2={x + 10} y2={y2} stroke={DIM_COLOR} strokeWidth={0.3} />
      <text x={x + 12} y={(y1 + y2) / 2 + 3} fontSize={8} fill={DIM_COLOR} fontFamily="monospace" transform={`rotate(90, ${x + 12}, ${(y1 + y2) / 2})`}>{value}</text>
    </g>
  );
}

// ─── Balloon callout ──────────

function Balloon({ cx, cy, tx, ty, num }: { cx: number; cy: number; tx: number; ty: number; num: number }) {
  const r = 8;
  return (
    <g>
      <line x1={cx} y1={cy} x2={tx} y2={ty} stroke={LINE_COLOR} strokeWidth={0.5} />
      <circle cx={cx} cy={cy} r={r} fill="white" stroke={LINE_COLOR} strokeWidth={0.8} />
      <text x={cx} y={cy + 3} textAnchor="middle" fontSize={7} fontWeight="bold" fill={LINE_COLOR} fontFamily="monospace">{num}</text>
      {/* Dot at target */}
      <circle cx={tx} cy={ty} r={1.5} fill={LINE_COLOR} />
    </g>
  );
}

// ─── Draggable Annotation ──────────

function DraggableAnnotation({ annotation: a, svgWidth, svgHeight, onMove, onUpdate, onDelete }: {
  annotation: Annotation; svgWidth: number; svgHeight: number;
  onMove: (id: string, x: number, y: number) => void;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const dragging = useRef(false);
  const offset = useRef({ dx: 0, dy: 0 });

  const getSVGPoint = (e: React.MouseEvent | MouseEvent) => {
    const svg = (e.target as Element).closest("svg");
    if (!svg) return { x: 0, y: 0 };
    const pt = (svg as SVGSVGElement).createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = (svg as SVGSVGElement).getScreenCTM()?.inverse();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm);
    return { x: svgPt.x, y: svgPt.y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as Element).tagName === "INPUT" || (e.target as Element).tagName === "foreignObject") return;
    e.preventDefault();
    dragging.current = true;
    const pt = getSVGPoint(e);
    offset.current = { dx: pt.x - a.x, dy: pt.y - a.y };
    const handleMouseMove = (me: MouseEvent) => {
      if (!dragging.current) return;
      const p = getSVGPoint(me as any);
      onMove(a.id, p.x - offset.current.dx, p.y - offset.current.dy);
    };
    const handleMouseUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const rectW = Math.max(a.text.length * 5.5, 30);
  return (
    <g onMouseDown={handleMouseDown} style={{ cursor: "grab" }}>
      <rect x={a.x - 2} y={a.y - 11} width={rectW} height={14} rx={2} fill="#fefce8" stroke="#d4a574" strokeWidth={0.5} />
      <EditableText x={a.x} y={a.y} text={a.text} fontSize={9} fill={LINE_COLOR} fontFamily="monospace"
        onUpdate={(t) => { if (t.trim() === "") onDelete(a.id); else onUpdate(a.id, t); }} />
    </g>
  );
}

// ─── Editable text ──────────

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
    return (
      <foreignObject x={fx} y={y - fontSize} width={inputW + 10} height={inputH + 4}>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => { setEditing(false); onUpdate(value); }}
          onKeyDown={(e) => { if (e.key === "Enter") { setEditing(false); onUpdate(value); } }}
          style={{
            width: "100%", height: "100%", fontSize: `${fontSize}px`,
            fontFamily: fontFamily || "monospace", fontWeight: fontWeight || "normal",
            background: "#fff", border: "1px solid #999", borderRadius: 2, outline: "none", padding: "0 2px", color: fill,
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

// ─── Full Drawing SVG ──────────

function getScaledDims(model: SceneModel) {
  const profile = getProfile(model.type);
  return {
    w: profile.w * model.scale[0],
    h: profile.h * model.scale[1],
    d: profile.d * model.scale[2],
  };
}

function dimStr(val: number) {
  return (val * 25.4).toFixed(1);
}

function DrawingSVG({ models, annotations, onUpdateAnnotation, onDeleteAnnotation, onMoveAnnotation, titleText, onUpdateTitle, showSection, showBOM, page, partsPerPage, isAssemblyMode }: {
  models: SceneModel[];
  annotations: Annotation[];
  onUpdateAnnotation: (id: string, text: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onMoveAnnotation: (id: string, x: number, y: number) => void;
  titleText: string; onUpdateTitle: (t: string) => void;
  showSection: boolean; showBOM: boolean;
  page: number; partsPerPage: number;
  isAssemblyMode: boolean;
}) {
  const startIdx = page * partsPerPage;
  const pageModels = isAssemblyMode ? models : models.slice(startIdx, startIdx + partsPerPage);
  const totalPages = isAssemblyMode ? 1 : Math.ceil(models.length / partsPerPage);
  const margin = 20;
  const scl = 55;
  const svgWidth = 1190;
  const svgHeight = 842;
  const partRowH = 250;
  const bomRowH = 16;
  const showBOMOnPage = showBOM && page === 0;
  const bomH = showBOMOnPage ? (models.length + 1) * bomRowH + 4 : 0;
  const viewsStartY = margin + (showBOMOnPage ? Math.min(bomH, 200) + 30 : 30);
  const today = new Date().toISOString().slice(0, 10);

  // BOM table dimensions
  const bomW = 300;
  const maxBomRows = 10;
  const bomDisplayModels = models.slice(0, maxBomRows);
  const bomDisplayH = showBOMOnPage ? (bomDisplayModels.length + 1) * bomRowH + 4 : 0;
  const bomX = svgWidth - margin - bomW;
  const bomY = margin + 10;

  // Title block
  const tbW = 300;
  const tbH = 100;
  const tbX = svgWidth - margin - tbW;
  const tbY = svgHeight - margin - tbH;
  const tbRowH = 16;
  const tbColW = 70;

  // Drawing area
  const drawAreaW = svgWidth - margin * 2;

  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <rect width={svgWidth} height={svgHeight} fill="white" />
      {/* Drawing border */}
      <rect x={margin} y={margin} width={svgWidth - margin * 2} height={svgHeight - margin * 2} fill="none" stroke={LINE_COLOR} strokeWidth={2} />
      <rect x={margin + 4} y={margin + 4} width={svgWidth - margin * 2 - 8} height={svgHeight - margin * 2 - 8} fill="none" stroke={LINE_COLOR} strokeWidth={0.5} />

      {/* ─── Parts List / BOM ─── */}
      {showBOMOnPage && (
        <g>
          <rect x={bomX} y={bomY} width={bomW} height={bomDisplayH} fill="none" stroke={LINE_COLOR} strokeWidth={1} />
          {/* Header */}
          <rect x={bomX} y={bomY} width={bomW} height={bomRowH} fill="#f0f0f0" stroke={LINE_COLOR} strokeWidth={0.5} />
          {["ITEM", "QTY", "PART NAME", "TYPE", "MATERIAL"].map((h, i) => {
            const colWidths = [35, 30, 100, 70, 65];
            let cx = bomX;
            for (let j = 0; j < i; j++) cx += colWidths[j];
            return (
              <text key={h} x={cx + colWidths[i] / 2} y={bomY + bomRowH - 4} textAnchor="middle" fontSize={7} fontWeight="bold" fill={LINE_COLOR} fontFamily="monospace">{h}</text>
            );
          })}
          {/* Column lines */}
          {[35, 65, 165, 235].map((offset) => (
            <line key={offset} x1={bomX + offset} y1={bomY} x2={bomX + offset} y2={bomY + bomDisplayH} stroke={LINE_COLOR} strokeWidth={0.3} />
          ))}
          {/* Rows */}
          {bomDisplayModels.map((m, i) => {
            const ry = bomY + (i + 1) * bomRowH;
            const colWidths = [35, 30, 100, 70, 65];
            return (
              <g key={m.id}>
                <line x1={bomX} y1={ry} x2={bomX + bomW} y2={ry} stroke={LINE_COLOR} strokeWidth={0.3} />
                <text x={bomX + colWidths[0] / 2} y={ry + bomRowH - 4} textAnchor="middle" fontSize={7} fill={LINE_COLOR} fontFamily="monospace">{i + 1}</text>
                <text x={bomX + colWidths[0] + colWidths[1] / 2} y={ry + bomRowH - 4} textAnchor="middle" fontSize={7} fill={LINE_COLOR} fontFamily="monospace">1</text>
                <text x={bomX + colWidths[0] + colWidths[1] + 4} y={ry + bomRowH - 4} fontSize={7} fill={LINE_COLOR} fontFamily="monospace">{m.label.slice(0, 16)}</text>
                <text x={bomX + colWidths[0] + colWidths[1] + colWidths[2] + 4} y={ry + bomRowH - 4} fontSize={7} fill={LINE_COLOR} fontFamily="monospace">{m.type}</text>
                <text x={bomX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 4} y={ry + bomRowH - 4} fontSize={7} fill={LINE_COLOR} fontFamily="monospace">General</text>
              </g>
            );
          })}
          {models.length > maxBomRows && (
            <text x={bomX + bomW / 2} y={bomY + bomDisplayH + 10} textAnchor="middle" fontSize={7} fill={HIDDEN_COLOR} fontFamily="monospace">... +{models.length - maxBomRows} more items</text>
          )}
          <text x={bomX + bomW / 2} y={bomY - 4} textAnchor="middle" fontSize={8} fontWeight="bold" fill={LINE_COLOR} fontFamily="monospace">PARTS LIST</text>
        </g>
      )}

      {/* ─── ISO Title Block ─── */}
      <g>
        <rect x={tbX} y={tbY} width={tbW} height={tbH} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} />
        {/* Rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <line key={i} x1={tbX} y1={tbY + tbRowH * (i + 1)} x2={tbX + tbW} y2={tbY + tbRowH * (i + 1)} stroke={LINE_COLOR} strokeWidth={0.3} />
        ))}
        {/* Columns */}
        <line x1={tbX + tbColW} y1={tbY} x2={tbX + tbColW} y2={tbY + tbH} stroke={LINE_COLOR} strokeWidth={0.3} />
        <line x1={tbX + tbColW * 2.5} y1={tbY} x2={tbX + tbColW * 2.5} y2={tbY + tbRowH * 2} stroke={LINE_COLOR} strokeWidth={0.3} />

        {/* Labels */}
        {[
          { label: "TITLE", x: tbX + 4, y: tbY + 12 },
          { label: "DRAWN", x: tbX + 4, y: tbY + tbRowH + 12 },
          { label: "CHECKED", x: tbX + tbColW * 2.5 + 4, y: tbY + 12 },
          { label: "DATE", x: tbX + tbColW * 2.5 + 4, y: tbY + tbRowH + 12 },
          { label: "SCALE", x: tbX + 4, y: tbY + tbRowH * 2 + 12 },
          { label: "MATERIAL", x: tbX + 4, y: tbY + tbRowH * 3 + 12 },
          { label: "TOLERANCE", x: tbX + 4, y: tbY + tbRowH * 4 + 12 },
        ].map((item) => (
          <text key={item.label} x={item.x} y={item.y} fontSize={6} fill={HIDDEN_COLOR} fontFamily="monospace">{item.label}</text>
        ))}

        {/* Values */}
        <EditableText x={tbX + tbColW + 4} y={tbY + 12} text={titleText} fontSize={9} fontWeight="bold" fill={LINE_COLOR} fontFamily="monospace" onUpdate={onUpdateTitle} />
        <EditableText x={tbX + tbColW + 4} y={tbY + tbRowH + 12} text="EveCAD" fontSize={8} fill={LINE_COLOR} fontFamily="monospace" onUpdate={() => {}} />
        <text x={tbX + tbColW * 2.5 + tbColW + 4} y={tbY + tbRowH + 12} fontSize={8} fill={LINE_COLOR} fontFamily="monospace">{today}</text>
        <EditableText x={tbX + tbColW + 4} y={tbY + tbRowH * 2 + 12} text="1:1" fontSize={8} fill={LINE_COLOR} fontFamily="monospace" onUpdate={() => {}} />
        <EditableText x={tbX + tbColW + 4} y={tbY + tbRowH * 3 + 12} text="General" fontSize={8} fill={LINE_COLOR} fontFamily="monospace" onUpdate={() => {}} />
        <EditableText x={tbX + tbColW + 4} y={tbY + tbRowH * 4 + 12} text="ISO 2768-m" fontSize={8} fill={LINE_COLOR} fontFamily="monospace" onUpdate={() => {}} />

        {/* First-angle projection symbol */}
        <g transform={`translate(${tbX + tbW - 40}, ${tbY + tbH - 20})`}>
          <line x1={-8} y1={-5} x2={-8} y2={5} stroke={LINE_COLOR} strokeWidth={0.8} />
          <line x1={-8} y1={-5} x2={6} y2={-3} stroke={LINE_COLOR} strokeWidth={0.8} />
          <line x1={-8} y1={5} x2={6} y2={3} stroke={LINE_COLOR} strokeWidth={0.8} />
          <line x1={6} y1={-3} x2={6} y2={3} stroke={LINE_COLOR} strokeWidth={0.8} />
          <circle cx={16} cy={0} r={4} fill="none" stroke={LINE_COLOR} strokeWidth={0.8} />
          <circle cx={16} cy={0} r={1.5} fill="none" stroke={LINE_COLOR} strokeWidth={0.5} />
        </g>

        {/* DWG NO */}
        <text x={tbX + tbW - 50} y={tbY + tbRowH * 2 + 12} fontSize={6} fill={HIDDEN_COLOR} fontFamily="monospace">DWG NO</text>
        <text x={tbX + tbW - 50} y={tbY + tbRowH * 3 + 12} fontSize={8} fontWeight="bold" fill={LINE_COLOR} fontFamily="monospace">EVE-001</text>
        <text x={tbX + tbW - 50} y={tbY + tbRowH * 4 + 12} fontSize={6} fill={HIDDEN_COLOR} fontFamily="monospace">SHEET {page + 1} OF {totalPages}</text>
      </g>

      {/* ─── Assembly View (proper engineering drawing) ─── */}
      {isAssemblyMode && (() => {
        // Calculate bounding box of all parts in world space
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        const partData = models.map((model) => {
          const dims = getScaledDims(model);
          const px = model.position?.[0] || 0;
          const py = model.position?.[1] || 0;
          const pz = model.position?.[2] || 0;
          const hw = dims.w / 2, hh = dims.h / 2, hd = dims.d / 2;
          minX = Math.min(minX, px - hw); maxX = Math.max(maxX, px + hw);
          minY = Math.min(minY, py - hh); maxY = Math.max(maxY, py + hh);
          minZ = Math.min(minZ, pz - hd); maxZ = Math.max(maxZ, pz + hd);
          return { model, dims, px, py, pz, hw, hh, hd };
        });

        const totalW = maxX - minX || 1;
        const totalH = maxY - minY || 1;
        const totalD = maxZ - minZ || 1;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;

        // Layout zones on the A3 sheet
        const drawH = svgHeight - viewsStartY - 130; // leave room for title block
        const frontZoneW = drawAreaW * 0.42;
        const sideZoneW = drawAreaW * 0.28;
        const sectionZoneW = drawAreaW * 0.28;
        const viewH = drawH * 0.55;
        const topViewH = drawH * 0.38;

        // Auto-scale to fit largest view
        const frontScaleW = (frontZoneW - 60) / totalW;
        const frontScaleH = (viewH - 40) / totalH;
        const sideScaleW = (sideZoneW - 40) / totalD;
        const sideScaleH = (viewH - 40) / totalH;
        const topScaleW = (frontZoneW - 60) / totalW;
        const topScaleH = (topViewH - 40) / totalD;
        const asmScale = Math.min(frontScaleW, frontScaleH, sideScaleW, sideScaleH, topScaleW, topScaleH, 40);

        // View centers
        const frontCx = margin + frontZoneW * 0.5;
        const frontCy = viewsStartY + viewH * 0.5 + 15;
        const sideCx = margin + frontZoneW + sideZoneW * 0.5;
        const sideCy = frontCy;
        const topCx = frontCx;
        const topCy = viewsStartY + viewH + topViewH * 0.5 + 25;
        const sectionCx = margin + frontZoneW + sideZoneW + sectionZoneW * 0.5;
        const sectionCy = frontCy;

        // Overall assembled dimensions in mm
        const overallWmm = (totalW * 25.4).toFixed(1);
        const overallHmm = (totalH * 25.4).toFixed(1);
        const overallDmm = (totalD * 25.4).toFixed(1);

        // Overall bounding box in SVG coords for each view
        const frontBBoxW = totalW * asmScale;
        const frontBBoxH = totalH * asmScale;
        const sideBBoxW = totalD * asmScale;
        const sideBBoxH = totalH * asmScale;
        const topBBoxW = totalW * asmScale;
        const topBBoxH = totalD * asmScale;

        return (
          <g>
            {/* View labels */}
            <text x={frontCx} y={viewsStartY + 8} textAnchor="middle" fontSize={8} fontWeight="bold" fill={LINE_COLOR} fontFamily="monospace">FRONT VIEW</text>
            <text x={sideCx} y={viewsStartY + 8} textAnchor="middle" fontSize={8} fontWeight="bold" fill={LINE_COLOR} fontFamily="monospace">RIGHT SIDE VIEW</text>
            <text x={topCx} y={viewsStartY + viewH + 18} textAnchor="middle" fontSize={8} fontWeight="bold" fill={LINE_COLOR} fontFamily="monospace">TOP VIEW</text>
            {showSection && <text x={sectionCx} y={viewsStartY + 8} textAnchor="middle" fontSize={8} fontWeight="bold" fill={LINE_COLOR} fontFamily="monospace">SECTION A-A</text>}

            {/* Dashed view borders */}
            <rect x={frontCx - frontZoneW * 0.48} y={viewsStartY + 12} width={frontZoneW * 0.96} height={viewH - 5} fill="none" stroke="#e0e0e0" strokeWidth={0.3} strokeDasharray="4 3" />
            <rect x={sideCx - sideZoneW * 0.45} y={viewsStartY + 12} width={sideZoneW * 0.9} height={viewH - 5} fill="none" stroke="#e0e0e0" strokeWidth={0.3} strokeDasharray="4 3" />
            <rect x={topCx - frontZoneW * 0.48} y={viewsStartY + viewH + 22} width={frontZoneW * 0.96} height={topViewH - 10} fill="none" stroke="#e0e0e0" strokeWidth={0.3} strokeDasharray="4 3" />
            {showSection && <rect x={sectionCx - sectionZoneW * 0.45} y={viewsStartY + 12} width={sectionZoneW * 0.9} height={viewH - 5} fill="none" stroke="#e0e0e0" strokeWidth={0.3} strokeDasharray="4 3" />}

            {/* Projection lines between views */}
            <line x1={frontCx + frontBBoxW / 2 + 8} y1={frontCy} x2={sideCx - sideBBoxW / 2 - 8} y2={sideCy} stroke={HIDDEN_COLOR} strokeWidth={0.3} strokeDasharray="6 3" />
            <line x1={frontCx} y1={frontCy + frontBBoxH / 2 + 8} x2={topCx} y2={topCy - topBBoxH / 2 - 8} stroke={HIDDEN_COLOR} strokeWidth={0.3} strokeDasharray="6 3" />

            {/* Section cut line on front view */}
            {showSection && (
              <>
                <line x1={frontCx} y1={frontCy - frontBBoxH / 2 - 18} x2={frontCx} y2={frontCy + frontBBoxH / 2 + 18} stroke={LINE_COLOR} strokeWidth={0.7} strokeDasharray="10 3 2 3" />
                <text x={frontCx - 10} y={frontCy - frontBBoxH / 2 - 22} fontSize={9} fontWeight="bold" fill={LINE_COLOR} fontFamily="monospace">A</text>
                <text x={frontCx - 10} y={frontCy + frontBBoxH / 2 + 30} fontSize={9} fontWeight="bold" fill={LINE_COLOR} fontFamily="monospace">A</text>
                <polygon points={`${frontCx - 6},${frontCy - frontBBoxH / 2 - 15} ${frontCx + 6},${frontCy - frontBBoxH / 2 - 15} ${frontCx},${frontCy - frontBBoxH / 2 - 8}`} fill={LINE_COLOR} />
                <polygon points={`${frontCx - 6},${frontCy + frontBBoxH / 2 + 15} ${frontCx + 6},${frontCy + frontBBoxH / 2 + 15} ${frontCx},${frontCy + frontBBoxH / 2 + 8}`} fill={LINE_COLOR} />
              </>
            )}

            {/* Overall dimension lines — Front view */}
            <DimensionH x1={frontCx - frontBBoxW / 2} x2={frontCx + frontBBoxW / 2} y={frontCy + frontBBoxH / 2 + 30} value={`${overallWmm} mm`} />
            <DimensionV y1={frontCy - frontBBoxH / 2} y2={frontCy + frontBBoxH / 2} x={frontCx + frontBBoxW / 2 + 25} value={`${overallHmm} mm`} />
            {/* Overall dimension — Side view */}
            <DimensionH x1={sideCx - sideBBoxW / 2} x2={sideCx + sideBBoxW / 2} y={sideCy + sideBBoxH / 2 + 30} value={`${overallDmm} mm`} />

            {/* Assembly center lines */}
            <line x1={frontCx - frontBBoxW / 2 - 12} y1={frontCy} x2={frontCx + frontBBoxW / 2 + 12} y2={frontCy} stroke={CENTER_COLOR} strokeWidth={0.3} strokeDasharray="10 3 2 3" />
            <line x1={frontCx} y1={frontCy - frontBBoxH / 2 - 12} x2={frontCx} y2={frontCy + frontBBoxH / 2 + 12} stroke={CENTER_COLOR} strokeWidth={0.3} strokeDasharray="10 3 2 3" />
            <line x1={sideCx - sideBBoxW / 2 - 8} y1={sideCy} x2={sideCx + sideBBoxW / 2 + 8} y2={sideCy} stroke={CENTER_COLOR} strokeWidth={0.3} strokeDasharray="10 3 2 3" />
            <line x1={sideCx} y1={sideCy - sideBBoxH / 2 - 8} x2={sideCx} y2={sideCy + sideBBoxH / 2 + 8} stroke={CENTER_COLOR} strokeWidth={0.3} strokeDasharray="10 3 2 3" />

            {/* Render all parts in each view */}
            {partData.map(({ model, dims, px, py, pz }, idx) => {
              const profile = getProfile(model.type);
              const frontFn = profile.frontProfile || defaultProfile.frontProfile;
              const sideFn = profile.sideProfile || defaultProfile.sideProfile;
              const topFn = profile.topProfile || defaultProfile.topProfile;
              const sectionFn = profile.sectionProfile || defaultProfile.sectionProfile;

              // Position relative to assembly center, then scale
              const fx = frontCx + (px - centerX) * asmScale;
              const fy = frontCy - (py - centerY) * asmScale; // Y inverted
              const sx = sideCx + (pz - centerZ) * asmScale;
              const sy = sideCy - (py - centerY) * asmScale;
              const tx = topCx + (px - centerX) * asmScale;
              const ty = topCy + (pz - centerZ) * asmScale;

              const pw = dims.w * asmScale;
              const ph = dims.h * asmScale;
              const pd = dims.d * asmScale;

              // Balloon positions — stagger around the front view
              const balloonAngle = (idx / models.length) * Math.PI * 2 - Math.PI / 2;
              const balloonR = Math.max(frontBBoxW, frontBBoxH) / 2 + 30 + (idx % 3) * 18;
              const bx = frontCx + Math.cos(balloonAngle) * balloonR;
              const by = frontCy + Math.sin(balloonAngle) * balloonR;

              return (
                <g key={model.id}>
                  {/* Front view */}
                  <g opacity={0.9}>{frontFn(pw, ph, fx, fy, model.params)}</g>
                  {/* Side view */}
                  <g opacity={0.9}>{sideFn(pd, ph, sx, sy, model.params)}</g>
                  {/* Top view */}
                  <g opacity={0.9}>{topFn(pw, pd, tx, ty, model.params)}</g>
                  {/* Section view — with hatching */}
                  {showSection && (
                    <g opacity={0.85}>{sectionFn(pw, ph, sectionCx + (px - centerX) * asmScale, sectionCy - (py - centerY) * asmScale, model.params)}</g>
                  )}
                  {/* Balloon callout with leader line */}
                  <Balloon cx={bx} cy={by} tx={fx} ty={fy} num={idx + 1} />
                </g>
              );
            })}

            {/* Assembly title */}
            <text x={margin + 10} y={svgHeight - margin - tbH - 15} fontSize={9} fontWeight="bold" fill={LINE_COLOR} fontFamily="monospace">
              ASSEMBLY DRAWING — {models.length} COMPONENTS — SCALE {asmScale < 10 ? (asmScale / 10).toFixed(2) : "1"} : 1
            </text>
          </g>
        );
      })()}

      {/* ─── Individual Part Views ─── */}
      {!isAssemblyMode && pageModels.map((model, idx) => {
        const globalIdx = startIdx + idx;
        const profile = getProfile(model.type);
        const dims = getScaledDims(model);
        const partY = viewsStartY + idx * partRowH;
        const viewScale = scl;

        const frontCx = margin + drawAreaW * 0.2;
        const frontCy = partY + 110;
        const sideCx = margin + drawAreaW * 0.45;
        const sideCy = frontCy;
        const topCx = frontCx;
        const topCy = frontCy + 120;
        const sectionCx = showSection ? margin + drawAreaW * 0.65 : 0;
        const sectionCy = frontCy;

        const fw = dims.w * viewScale;
        const fh = dims.h * viewScale;

        const frontFn = profile.frontProfile || defaultProfile.frontProfile;
        const topFn = profile.topProfile || defaultProfile.topProfile;
        const sideFn = profile.sideProfile || defaultProfile.sideProfile;
        const sectionFn = profile.sectionProfile || defaultProfile.sectionProfile;

        return (
          <g key={model.id}>
            {/* Part label */}
            <text x={margin + 10} y={partY + 10} fontSize={10} fontWeight="bold" fill={CENTER_COLOR} fontFamily="monospace">
              Part {globalIdx + 1}: {model.label} ({model.type})
            </text>

            {/* View labels */}
            <text x={frontCx} y={partY + 22} textAnchor="middle" fontSize={7} fill={HIDDEN_COLOR} fontFamily="monospace">FRONT VIEW</text>
            <text x={sideCx} y={partY + 22} textAnchor="middle" fontSize={7} fill={HIDDEN_COLOR} fontFamily="monospace">RIGHT SIDE VIEW</text>
            <text x={topCx} y={frontCy + 65} textAnchor="middle" fontSize={7} fill={HIDDEN_COLOR} fontFamily="monospace">TOP VIEW</text>
            {showSection && sectionFn && (
              <text x={sectionCx} y={partY + 22} textAnchor="middle" fontSize={7} fill={HIDDEN_COLOR} fontFamily="monospace">SECTION A-A</text>
            )}

            {/* Front view */}
            {frontFn(dims.w * viewScale, dims.h * viewScale, frontCx, frontCy, model.params)}
            {/* Side view */}
            {sideFn(dims.d * viewScale, dims.h * viewScale, sideCx, sideCy, model.params)}
            {/* Top view */}
            {topFn(dims.w * viewScale, dims.d * viewScale, topCx, topCy, model.params)}
            {/* Section view */}
            {showSection && sectionFn && sectionFn(dims.w * viewScale, dims.h * viewScale, sectionCx, sectionCy, model.params)}

            {/* Section cut line on front view */}
            {showSection && (
              <>
                <line x1={frontCx} y1={frontCy - fh / 2 - 15} x2={frontCx} y2={frontCy + fh / 2 + 15} stroke={LINE_COLOR} strokeWidth={0.6} strokeDasharray="8 3 2 3" />
                <text x={frontCx - 8} y={frontCy - fh / 2 - 18} fontSize={8} fontWeight="bold" fill={LINE_COLOR} fontFamily="monospace">A</text>
                <text x={frontCx - 8} y={frontCy + fh / 2 + 25} fontSize={8} fontWeight="bold" fill={LINE_COLOR} fontFamily="monospace">A</text>
                {/* Section arrows */}
                <polygon points={`${frontCx - 5},${frontCy - fh / 2 - 12} ${frontCx + 5},${frontCy - fh / 2 - 12} ${frontCx},${frontCy - fh / 2 - 6}`} fill={LINE_COLOR} />
                <polygon points={`${frontCx - 5},${frontCy + fh / 2 + 12} ${frontCx + 5},${frontCy + fh / 2 + 12} ${frontCx},${frontCy + fh / 2 + 6}`} fill={LINE_COLOR} />
              </>
            )}

            {/* Projection lines */}
            <line x1={frontCx + fw / 2 + 10} y1={frontCy} x2={sideCx - dims.d * viewScale / 2 - 10} y2={sideCy} stroke={HIDDEN_COLOR} strokeWidth={0.2} strokeDasharray="4 3" />
            <line x1={frontCx} y1={frontCy + fh / 2 + 10} x2={topCx} y2={topCy - dims.d * viewScale / 2 - 10} stroke={HIDDEN_COLOR} strokeWidth={0.2} strokeDasharray="4 3" />

            {/* Dimension lines — front view */}
            <DimensionH x1={frontCx - fw / 2} x2={frontCx + fw / 2} y={frontCy + fh / 2 + 25} value={`${dimStr(dims.w)} mm`} />
            <DimensionV y1={frontCy - fh / 2} y2={frontCy + fh / 2} x={frontCx + fw / 2 + 20} value={`${dimStr(dims.h)} mm`} />

            {/* Balloon callout */}
            <Balloon cx={frontCx + fw / 2 + 45} cy={frontCy - fh / 2 - 10} tx={frontCx + fw / 4} ty={frontCy} num={globalIdx + 1} />

            {/* Part separator */}
            {idx < pageModels.length - 1 && (
              <line x1={margin + 4} y1={partY + partRowH - 10} x2={svgWidth - margin - 4} y2={partY + partRowH - 10} stroke="#ddd" strokeWidth={0.5} strokeDasharray="4 3" />
            )}
          </g>
        );
      })}

      {/* User annotations — draggable */}
      {annotations.map((a) => (
        <DraggableAnnotation key={a.id} annotation={a} svgWidth={svgWidth} svgHeight={svgHeight}
          onMove={onMoveAnnotation} onUpdate={onUpdateAnnotation} onDelete={onDeleteAnnotation} />
      ))}
    </svg>
  );
}

// ─── Main Panel Component ──────────

export default function CadDrawingPanel({ models, onClose }: CadDrawingPanelProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [titleText, setTitleText] = useState("EveCAD Drawing");
  const [showSection, setShowSection] = useState(true);
  const [showBOM, setShowBOM] = useState(true);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set(models.map(m => m.id)));
  const [showComponentDropdown, setShowComponentDropdown] = useState(false);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredModels = useMemo(() => models.filter(m => visibleIds.has(m.id)), [models, visibleIds]);
  const isAssemblyMode = visibleIds.size === models.length && models.length > 1;

  const PARTS_PER_PAGE = 3;
  const [drawingPage, setDrawingPage] = useState(0);
  const totalPages = isAssemblyMode ? 1 : Math.ceil(filteredModels.length / PARTS_PER_PAGE);

  const toggleComponent = (id: string) => {
    setVisibleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDrawingPage(0);
  };

  const selectAll = () => { setVisibleIds(new Set(models.map(m => m.id))); setDrawingPage(0); };
  const selectNone = () => { setVisibleIds(new Set()); setDrawingPage(0); };

  const addAnnotation = () => {
    setAnnotations((prev) => [...prev, { id: `ann-${++annotationId}`, x: 30 + Math.random() * 200, y: 40 + Math.random() * 100, text: "Note: edit me" }]);
  };

  const updateAnnotation = useCallback((id: string, text: string) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, text } : a)));
  }, []);

  const deleteAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const moveAnnotation = useCallback((id: string, x: number, y: number) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, x, y } : a)));
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
      const isRound = ["cylinder", "sphere", "gear", "bearing", "pulley", "wheel"].includes(model.type);
      if (isRound) {
        dxf += `0\nCIRCLE\n8\n0\n10\n${ox}\n20\n${oy}\n40\n${(dims.w / 2) * s}\n`;
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
      <div className="rounded-2xl border-2 border-border bg-card/98 backdrop-blur-md kawaii-shadow flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
          <span className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
            <Ruler className="w-4 h-4 text-primary" /> Technical Drawing — ISO/EU Standard
          </span>
          <div className="flex items-center gap-1.5">
            {/* Component visibility dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowComponentDropdown(!showComponentDropdown)}
                className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${isAssemblyMode ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              >
                <Eye className="w-3 h-3" />
                {isAssemblyMode ? "Assembly" : `${visibleIds.size}/${models.length}`}
              </button>
              {showComponentDropdown && (
                <div className="absolute top-full right-0 mt-1 w-56 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
                    <span className="text-[10px] font-bold text-foreground">Components</span>
                    <div className="flex gap-1">
                      <button onClick={selectAll} className="text-[9px] text-primary hover:underline">All</button>
                      <span className="text-[9px] text-muted-foreground">|</span>
                      <button onClick={selectNone} className="text-[9px] text-primary hover:underline">None</button>
                    </div>
                  </div>
                  {isAssemblyMode && (
                    <div className="px-3 py-1 bg-accent/50 border-b border-border">
                      <span className="text-[9px] font-bold text-accent-foreground flex items-center gap-1"><Layers className="w-3 h-3" /> Assembly Drawing Mode</span>
                    </div>
                  )}
                  {models.map((m, i) => (
                    <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleIds.has(m.id)}
                        onChange={() => toggleComponent(m.id)}
                        className="w-3 h-3 rounded border-input accent-primary"
                      />
                      <span className="text-[10px] text-foreground truncate">{i + 1}. {m.label}</span>
                      <span className="text-[9px] text-muted-foreground ml-auto">{m.type}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setShowSection(!showSection)} className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-all ${showSection ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
              <Crosshair className="w-3 h-3 inline mr-1" />Section
            </button>
            <button onClick={() => setShowBOM(!showBOM)} className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-all ${showBOM ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
              <List className="w-3 h-3 inline mr-1" />BOM
            </button>
            <button onClick={addAnnotation} className="text-[10px] font-bold text-muted-foreground hover:text-primary px-2 py-1 rounded-lg hover:bg-muted">
              <Type className="w-3 h-3 inline mr-1" />Note
            </button>
            <div className="w-px h-5 bg-border mx-1" />
            <button onClick={handleExportSVG} className="text-[10px] font-bold text-muted-foreground hover:text-primary px-2 py-1 rounded-lg hover:bg-muted">
              <Download className="w-3 h-3 inline mr-1" />SVG
            </button>
            <button onClick={handleExportDXF} className="text-[10px] font-bold text-muted-foreground hover:text-primary px-2 py-1 rounded-lg hover:bg-muted">
              <Download className="w-3 h-3 inline mr-1" />DXF
            </button>
            <div className="w-px h-5 bg-border mx-1" />
            {/* Page navigation */}
            {totalPages > 1 && !isAssemblyMode && (
              <>
                <button onClick={() => setDrawingPage(Math.max(0, drawingPage - 1))} disabled={drawingPage === 0} className="text-[10px] font-bold text-muted-foreground hover:text-primary px-1 py-1 rounded-lg hover:bg-muted disabled:opacity-30">
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <span className="text-[10px] font-bold text-muted-foreground px-1">{drawingPage + 1}/{totalPages}</span>
                <button onClick={() => setDrawingPage(Math.min(totalPages - 1, drawingPage + 1))} disabled={drawingPage >= totalPages - 1} className="text-[10px] font-bold text-muted-foreground hover:text-primary px-1 py-1 rounded-lg hover:bg-muted disabled:opacity-30">
                  <ChevronRight className="w-3 h-3" />
                </button>
                <div className="w-px h-5 bg-border mx-1" />
              </>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drawing canvas */}
        <div ref={svgContainerRef} className="flex-1 overflow-auto bg-white p-2">
          <DrawingSVG
            models={filteredModels}
            annotations={annotations}
            onUpdateAnnotation={updateAnnotation}
            onDeleteAnnotation={deleteAnnotation}
            onMoveAnnotation={moveAnnotation}
            titleText={titleText}
            onUpdateTitle={setTitleText}
            showSection={showSection}
            showBOM={showBOM}
            page={drawingPage}
            partsPerPage={PARTS_PER_PAGE}
            isAssemblyMode={isAssemblyMode}
          />
        </div>
      </div>
    </motion.div>
  );
}
