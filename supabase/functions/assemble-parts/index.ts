import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(req: Request): Response | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return new Response(JSON.stringify({ error: "Too many requests, please slow down" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

// ─── Part Geometry Utilities ─────────────────────────────

interface PartModel {
  id: string;
  type: string;
  label: string;
  scale: [number, number, number];
  position: [number, number, number];
  color: string;
  params?: Record<string, any>;
}

interface BBox {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  size: [number, number, number];
}

/** Get the effective size of a part based on type and scale */
function getPartSize(m: PartModel): [number, number, number] {
  const s = m.scale || [1, 1, 1];
  switch (m.type) {
    case "cylinder": return [s[0], s[1], s[0]]; // diameter = X, height = Y
    case "gear":     return [s[0] * 1.2, s[1] * 0.4, s[0] * 1.2];
    case "bracket":  return [s[0], s[1], s[2] * 0.6];
    default:         return [s[0], s[1], s[2]]; // box
  }
}

function getBBox(m: PartModel): BBox {
  const sz = getPartSize(m);
  const p = m.position || [0, 0, 0];
  return {
    min: [p[0] - sz[0] / 2, p[1] - sz[1] / 2, p[2] - sz[2] / 2],
    max: [p[0] + sz[0] / 2, p[1] + sz[1] / 2, p[2] + sz[2] / 2],
    center: [...p] as [number, number, number],
    size: sz,
  };
}

function bboxVolume(bb: BBox): number {
  return bb.size[0] * bb.size[1] * bb.size[2];
}

// ─── Constraint Types ────────────────────────────────────

type Face = "top" | "bottom" | "left" | "right" | "front" | "back";
type ConstraintType = "mate" | "align" | "insert" | "stack";

interface Constraint {
  type: ConstraintType;
  fromFace: Face;
  toFace: Face;
  offset?: [number, number, number];
}

/** Get the face normal and a point on the face for a given bounding box */
function getFacePoint(bb: BBox, face: Face): { point: [number, number, number]; normal: [number, number, number] } {
  const c = bb.center;
  const h = [bb.size[0] / 2, bb.size[1] / 2, bb.size[2] / 2];
  switch (face) {
    case "top":    return { point: [c[0], c[1] + h[1], c[2]], normal: [0, 1, 0] };
    case "bottom": return { point: [c[0], c[1] - h[1], c[2]], normal: [0, -1, 0] };
    case "right":  return { point: [c[0] + h[0], c[1], c[2]], normal: [1, 0, 0] };
    case "left":   return { point: [c[0] - h[0], c[1], c[2]], normal: [-1, 0, 0] };
    case "front":  return { point: [c[0], c[1], c[2] + h[2]], normal: [0, 0, 1] };
    case "back":   return { point: [c[0], c[1], c[2] - h[2]], normal: [0, 0, -1] };
  }
}

/** Solve a mate constraint: place partB so its fromFace touches partA's toFace */
function solveMateConstraint(
  baseBox: BBox,
  movingSize: [number, number, number],
  constraint: Constraint
): [number, number, number] {
  const baseFace = getFacePoint(baseBox, constraint.toFace);
  const offset = constraint.offset || [0, 0, 0];
  const mh = [movingSize[0] / 2, movingSize[1] / 2, movingSize[2] / 2];

  // Position so the moving part's fromFace touches the base part's toFace
  const pos: [number, number, number] = [
    baseFace.point[0] + offset[0],
    baseFace.point[1] + offset[1],
    baseFace.point[2] + offset[2],
  ];

  // Adjust position based on which face of the moving part needs to touch
  switch (constraint.fromFace) {
    case "bottom": pos[1] = baseFace.point[1] + mh[1]; break;
    case "top":    pos[1] = baseFace.point[1] - mh[1]; break;
    case "left":   pos[0] = baseFace.point[0] + mh[0]; break;
    case "right":  pos[0] = baseFace.point[0] - mh[0]; break;
    case "back":   pos[2] = baseFace.point[2] + mh[2]; break;
    case "front":  pos[2] = baseFace.point[2] - mh[2]; break;
  }

  return pos;
}

// ─── Assembly Classification ─────────────────────────────

interface AssemblyClassification {
  baseIndex: number;
  groups: { parentIdx: number; childIdx: number; constraint: Constraint; modification: string }[];
  additionalParts: { type: string; label: string; position: [number, number, number]; scale: [number, number, number]; reason: string }[];
}

/** Determine how parts should mate based on their types */
function inferConstraint(parent: PartModel, child: PartModel): Constraint & { modification: string } {
  const parentType = parent.type;
  const childType = child.type;

  // Gear + Cylinder → Insert (gear onto shaft)
  if (childType === "gear" && parentType === "cylinder") {
    return { type: "insert", fromFace: "bottom", toFace: "top", modification: "Bore aligned to shaft diameter" };
  }
  if (parentType === "gear" && childType === "cylinder") {
    return { type: "insert", fromFace: "bottom", toFace: "top", modification: "Shaft inserted through gear bore" };
  }

  // Gear + Gear → Stack side by side (meshing)
  if (parentType === "gear" && childType === "gear") {
    const parentSize = getPartSize(parent);
    return {
      type: "mate", fromFace: "left", toFace: "right",
      offset: [0, 0, 0],
      modification: "Gears meshed at pitch circle",
    };
  }

  // Bracket + anything → Mount on bracket face
  if (parentType === "bracket") {
    if (childType === "cylinder") {
      return { type: "mate", fromFace: "bottom", toFace: "top", modification: "Cylinder mounted on bracket top face" };
    }
    if (childType === "gear") {
      return { type: "mate", fromFace: "bottom", toFace: "top", modification: "Gear hub mounted on bracket" };
    }
    return { type: "mate", fromFace: "bottom", toFace: "top", modification: "Component fastened to bracket" };
  }

  // Anything + Bracket → Attach bracket to side
  if (childType === "bracket") {
    return { type: "mate", fromFace: "back", toFace: "front", modification: "Bracket bolted to component face" };
  }

  // Box + Cylinder → Cylinder on top of box
  if (parentType === "box" && childType === "cylinder") {
    return { type: "mate", fromFace: "bottom", toFace: "top", modification: "Cylinder seated on box top surface" };
  }

  // Cylinder + Box → Box at base of cylinder
  if (parentType === "cylinder" && childType === "box") {
    return { type: "mate", fromFace: "top", toFace: "bottom", modification: "Box serves as base plate for cylinder" };
  }

  // Box + Box → Stack on top
  if (parentType === "box" && childType === "box") {
    return { type: "stack", fromFace: "bottom", toFace: "top", modification: "Stacked and aligned" };
  }

  // Default: stack on top
  return { type: "mate", fromFace: "bottom", toFace: "top", modification: "Mated to adjacent face" };
}

/** Classify parts: find the base (ground), build assembly tree */
function classifyAssembly(models: PartModel[]): AssemblyClassification {
  if (models.length === 0) return { baseIndex: 0, groups: [], additionalParts: [] };

  // Step 1: Ground the base component (largest volume)
  let baseIndex = 0;
  let maxVol = 0;
  models.forEach((m, i) => {
    const vol = bboxVolume(getBBox(m));
    if (vol > maxVol) { maxVol = vol; baseIndex = i; }
  });

  // Step 2: Build assembly tree — attach each part to its nearest neighbor
  const placed = new Set<number>([baseIndex]);
  const groups: AssemblyClassification["groups"] = [];
  const remaining = new Set(models.map((_, i) => i).filter(i => i !== baseIndex));

  while (remaining.size > 0) {
    let bestChild = -1;
    let bestParent = -1;
    let bestDist = Infinity;

    for (const ci of remaining) {
      const cbb = getBBox(models[ci]);
      for (const pi of placed) {
        const pbb = getBBox(models[pi]);
        const dist = Math.sqrt(
          (cbb.center[0] - pbb.center[0]) ** 2 +
          (cbb.center[1] - pbb.center[1]) ** 2 +
          (cbb.center[2] - pbb.center[2]) ** 2
        );
        if (dist < bestDist) {
          bestDist = dist;
          bestChild = ci;
          bestParent = pi;
        }
      }
    }

    if (bestChild === -1) break;

    const constraint = inferConstraint(models[bestParent], models[bestChild]);
    groups.push({
      parentIdx: bestParent,
      childIdx: bestChild,
      constraint: { type: constraint.type, fromFace: constraint.fromFace, toFace: constraint.toFace, offset: constraint.offset },
      modification: constraint.modification,
    });
    placed.add(bestChild);
    remaining.delete(bestChild);
  }

  // Step 3: Determine if additional parts are needed
  const additionalParts: AssemblyClassification["additionalParts"] = [];
  const hasGears = models.some(m => m.type === "gear");
  const hasCylinder = models.some(m => m.type === "cylinder");
  const hasBracket = models.some(m => m.type === "bracket");

  // If gears exist but no shaft, suggest a shaft
  if (hasGears && !hasCylinder) {
    const gearModel = models.find(m => m.type === "gear")!;
    const gBB = getBBox(gearModel);
    additionalParts.push({
      type: "cylinder",
      label: "Shaft",
      position: [gBB.center[0], gBB.center[1], gBB.center[2]],
      scale: [gBB.size[0] * 0.2, gBB.size[1] * 3, gBB.size[0] * 0.2],
      reason: "Shaft needed for gear rotation axis",
    });
  }

  // If heavy components but no bracket/base, suggest a base plate
  if (!hasBracket && models.length > 2) {
    let minY = Infinity;
    let totalW = 0, totalD = 0;
    models.forEach(m => {
      const bb = getBBox(m);
      minY = Math.min(minY, bb.min[1]);
      totalW = Math.max(totalW, bb.size[0]);
      totalD = Math.max(totalD, bb.size[2]);
    });
    additionalParts.push({
      type: "box",
      label: "Base Plate",
      position: [0, minY - 0.15, 0],
      scale: [totalW * 1.3, 0.15, totalD * 1.3],
      reason: "Base plate for structural support and alignment",
    });
  }

  return { baseIndex, groups, additionalParts };
}

// ─── Execute Assembly Plan ───────────────────────────────

function executeAssembly(models: PartModel[]): {
  parts: { id: string; new_position: number[]; new_scale: number[]; modification: string }[];
  additional_parts: { type: string; label: string; position: number[]; scale: number[]; reason: string }[];
  instructions: string;
} {
  const classification = classifyAssembly(models);
  const { baseIndex, groups, additionalParts } = classification;

  // Clone positions - base stays grounded at origin or its current position
  const positions: Map<string, [number, number, number]> = new Map();
  const scales: Map<string, [number, number, number]> = new Map();
  const modifications: Map<string, string> = new Map();

  // Ground the base component
  const base = models[baseIndex];
  positions.set(base.id, [0, 0, 0]);
  scales.set(base.id, base.scale || [1, 1, 1]);
  modifications.set(base.id, "Grounded — reference frame origin");

  // Solve constraints in tree order
  for (const group of groups) {
    const parent = models[group.parentIdx];
    const child = models[group.childIdx];

    // Get parent's resolved position and build its bbox at that position
    const parentPos = positions.get(parent.id) || parent.position || [0, 0, 0];
    const parentSize = getPartSize(parent);
    const parentBB: BBox = {
      min: [parentPos[0] - parentSize[0] / 2, parentPos[1] - parentSize[1] / 2, parentPos[2] - parentSize[2] / 2],
      max: [parentPos[0] + parentSize[0] / 2, parentPos[1] + parentSize[1] / 2, parentPos[2] + parentSize[2] / 2],
      center: parentPos as [number, number, number],
      size: parentSize,
    };

    const childSize = getPartSize(child);

    // Scale compatibility check
    let childScale = child.scale || [1, 1, 1];
    if (group.constraint.type === "insert") {
      // For insert constraints, ensure the child fits the parent bore
      const parentMinDim = Math.min(parentSize[0], parentSize[2]);
      const childMaxDim = Math.max(childSize[0], childSize[2]);
      if (childMaxDim > parentMinDim * 1.5) {
        // Scale down child to fit
        const scaleFactor = (parentMinDim * 0.9) / childMaxDim;
        childScale = [childScale[0] * scaleFactor, childScale[1], childScale[2] * scaleFactor];
      }
    }

    const resolvedChildSize: [number, number, number] = [
      childSize[0] * (childScale[0] / (child.scale?.[0] || 1)),
      childSize[1] * (childScale[1] / (child.scale?.[1] || 1)),
      childSize[2] * (childScale[2] / (child.scale?.[2] || 1)),
    ];

    const newPos = solveMateConstraint(parentBB, resolvedChildSize, group.constraint);
    positions.set(child.id, newPos);
    scales.set(child.id, childScale);
    modifications.set(child.id, group.modification);
  }

  // Build output
  const parts = models.map(m => ({
    id: m.id,
    new_position: positions.get(m.id) || m.position || [0, 0, 0],
    new_scale: scales.get(m.id) || m.scale || [1, 1, 1],
    modification: modifications.get(m.id) || "No modification needed",
  }));

  // Build instructions
  const steps: string[] = [];
  steps.push(`1. Ground "${base.label}" at origin`);
  groups.forEach((g, i) => {
    const parent = models[g.parentIdx];
    const child = models[g.childIdx];
    steps.push(`${i + 2}. ${g.constraint.type} "${child.label}" ${g.constraint.fromFace}→"${parent.label}" ${g.constraint.toFace}`);
  });

  return {
    parts,
    additional_parts: additionalParts,
    instructions: steps.join(". "),
  };
}

// ─── Server ──────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  try {
    const { models } = await req.json();
    if (!models || !Array.isArray(models) || models.length < 2) {
      return new Response(JSON.stringify({ error: "Need at least 2 models to assemble" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate all parts have required fields
    for (const m of models) {
      if (!m.id || !m.type) {
        return new Response(JSON.stringify({ error: `Part missing id or type: ${JSON.stringify(m)}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Default missing fields
      m.scale = m.scale || [1, 1, 1];
      m.position = m.position || [0, 0, 0];
      m.label = m.label || m.type;
    }

    // Try AI-enhanced assembly, fall back to local constraint solver
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify(executeAssembly(models)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pre-compute local assembly as context for the AI
    const localResult = executeAssembly(models);

    const modelDescriptions = models.map((m: PartModel, i: number) =>
      `Part ${i + 1} (id="${m.id}"): type="${m.type}", label="${m.label}", scale=[${m.scale}], position=[${m.position}], color="${m.color}"`
    ).join("\n");

    const localContext = `Local solver suggests:\n- Base: "${models[localResult.parts.findIndex(p => p.modification.includes("Grounded"))]?.label || models[0].label}"\n- Constraints: ${localResult.instructions}\n- ${localResult.additional_parts.length} additional parts suggested`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a mechanical engineering CAD assembly solver. Follow these rules strictly:

ASSEMBLY RULES:
1. GROUND the base component (largest/most stable part) at position [0,0,0]. It must NOT move.
2. Use CONSTRAINT-BASED positioning: mate faces, align axes, insert shafts into bores.
3. Parts MUST physically touch — no floating parts. Every part's face must contact another part's face.
4. Use hierarchical assembly: ground base → attach primary components → attach secondary components.
5. Scale parts ONLY if physically incompatible (e.g., shaft too large for bore). Prefer keeping original scales.
6. Positions must create a physically plausible assembly — parts cannot intersect/overlap.

CONSTRAINT TYPES:
- mate: Two faces touch (e.g., bottom of part A on top of part B)
- align: Center axes aligned (e.g., shaft through hole)
- insert: One part goes into/through another (e.g., shaft into gear bore)
- stack: Parts stacked vertically

VALIDATION:
- Every part must be reachable from the base through a chain of contacts
- No part should be more than 3x away from the assembly centroid
- Include modification notes for any drilling, boring, or resizing needed

You MUST call the assembly_plan function with your result.`,
          },
          {
            role: "user",
            content: `Assemble these parts:\n${modelDescriptions}\n\n${localContext}\n\nCreate an optimal assembly plan with proper constraint-based positioning.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "assembly_plan",
              description: "Return the assembly plan with repositioned parts and instructions.",
              parameters: {
                type: "object",
                properties: {
                  parts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", description: "The original part id" },
                        new_position: {
                          type: "array", items: { type: "number" },
                          description: "New [x, y, z] position. Base must be [0,0,0].",
                        },
                        new_scale: {
                          type: "array", items: { type: "number" },
                          description: "Scale [x, y, z]. Only change if physically necessary.",
                        },
                        modification: {
                          type: "string",
                          description: "Constraint type and modification (e.g. 'mate bottom→top: Bolted to bracket')",
                        },
                      },
                      required: ["id", "new_position", "new_scale", "modification"],
                      additionalProperties: false,
                    },
                  },
                  additional_parts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["gear", "bracket", "box", "cylinder"] },
                        label: { type: "string" },
                        position: { type: "array", items: { type: "number" } },
                        scale: { type: "array", items: { type: "number" } },
                        reason: { type: "string" },
                      },
                      required: ["type", "label", "position", "scale", "reason"],
                      additionalProperties: false,
                    },
                    description: "Extra parts needed (fasteners, shafts, base plates)",
                  },
                  instructions: {
                    type: "string",
                    description: "Step-by-step assembly instructions starting with grounding the base",
                  },
                },
                required: ["parts", "additional_parts", "instructions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "assembly_plan" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits depleted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fall back to local solver
      return new Response(JSON.stringify(localResult), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);

      // Post-validate: ensure no floating parts
      const validated = validateAssembly(parsed, models);
      return new Response(JSON.stringify(validated), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(localResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("assemble error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Post-Validation ─────────────────────────────────────

function validateAssembly(
  plan: { parts: any[]; additional_parts: any[]; instructions: string },
  originalModels: PartModel[]
): { parts: any[]; additional_parts: any[]; instructions: string } {
  if (!plan.parts || plan.parts.length === 0) {
    return executeAssembly(originalModels);
  }

  // Build connectivity graph to detect floating parts
  const tolerance = 0.3;

  for (let i = 0; i < plan.parts.length; i++) {
    const pi = plan.parts[i];
    const origI = originalModels.find(m => m.id === pi.id);
    if (!origI) continue;

    const sizeI = getPartSize({ ...origI, scale: pi.new_scale || origI.scale });
    const posI = pi.new_position || [0, 0, 0];

    let connected = false;
    for (let j = 0; j < plan.parts.length; j++) {
      if (i === j) continue;
      const pj = plan.parts[j];
      const origJ = originalModels.find(m => m.id === pj.id);
      if (!origJ) continue;

      const sizeJ = getPartSize({ ...origJ, scale: pj.new_scale || origJ.scale });
      const posJ = pj.new_position || [0, 0, 0];

      // Check if bounding boxes touch or overlap (within tolerance)
      const touching = [0, 1, 2].every(axis => {
        const minI = posI[axis] - sizeI[axis] / 2;
        const maxI = posI[axis] + sizeI[axis] / 2;
        const minJ = posJ[axis] - sizeJ[axis] / 2;
        const maxJ = posJ[axis] + sizeJ[axis] / 2;
        return maxI + tolerance >= minJ && maxJ + tolerance >= minI;
      });

      if (touching) { connected = true; break; }
    }

    // If floating, snap to nearest part
    if (!connected && i > 0) {
      let bestJ = 0;
      let bestDist = Infinity;
      for (let j = 0; j < plan.parts.length; j++) {
        if (i === j) continue;
        const pj = plan.parts[j];
        const posJ = pj.new_position || [0, 0, 0];
        const dist = Math.sqrt(
          (posI[0] - posJ[0]) ** 2 + (posI[1] - posJ[1]) ** 2 + (posI[2] - posJ[2]) ** 2
        );
        if (dist < bestDist) { bestDist = dist; bestJ = j; }
      }

      // Snap: place this part on top of the nearest part
      const pj = plan.parts[bestJ];
      const origJ = originalModels.find(m => m.id === pj.id);
      if (origJ) {
        const sizeJ = getPartSize({ ...origJ, scale: pj.new_scale || origJ.scale });
        const posJ = pj.new_position || [0, 0, 0];
        pi.new_position = [posJ[0], posJ[1] + sizeJ[1] / 2 + sizeI[1] / 2, posJ[2]];
        pi.modification = (pi.modification || "") + " [auto-snapped to prevent floating]";
      }
    }
  }

  return plan;
}
