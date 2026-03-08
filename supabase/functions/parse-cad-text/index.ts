import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory IP rate limiter: max 10 requests per minute per IP
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  try {
    const body = await req.json();
    const { text, imageBase64 } = body;

    if (!text && !imageBase64) {
      return new Response(JSON.stringify({ error: "Missing 'text' or 'imageBase64' field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.warn("LOVABLE_API_KEY not configured, using local parsing");
      return new Response(JSON.stringify(localParse(text || "box")), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userContent: any[] = [];

    if (imageBase64) {
      userContent.push({ type: "image_url", image_url: { url: imageBase64 } });
      userContent.push({
        type: "text",
        text: text
          ? `Analyze this image AND description: "${text}". Break it down into CAD parts.`
          : "Analyze this image. Break it down into CAD parts.",
      });
    } else {
      userContent.push({ type: "text", text: text! });
    }

    // Step 1: Research step — for complex objects, get real-world structural details first
    const isSimplePart = text && /^(a\s+)?(gear|bracket|box|cylinder|pipe|tube|rod|cog|sprocket|mount)\b/i.test(text.trim());
    let researchContext = "";

    if (!isSimplePart && !imageBase64) {
      console.log("Running research step for complex object:", text);
      try {
        const researchResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `You are a mechanical engineering research assistant. Given an object name, describe its real-world physical structure in detail for someone building a simplified 3D CAD model.

Focus on:
- Main structural components and their shapes (rectangular, cylindrical, flat, etc.)
- Approximate proportions and relative sizes
- How parts connect and their spatial arrangement
- Key distinguishing features

Be concise but accurate. Use real engineering references. This will be used to create an accurate simplified 3D model.`,
              },
              { role: "user", content: `Describe the physical structure and components of: "${text}". Focus on shapes, proportions, and spatial arrangement.` },
            ],
          }),
        });

        if (researchResponse.ok) {
          const researchData = await researchResponse.json();
          researchContext = researchData.choices?.[0]?.message?.content || "";
          console.log("Research context obtained:", researchContext.slice(0, 200));
        }
      } catch (e) {
        console.warn("Research step failed, proceeding without:", e);
      }
    }

    // Step 2: CAD decomposition with research context
    const systemPrompt = `You are a MASTER CAD geometry decomposition engine that creates museum-quality 3D models using primitive shapes. Your models should look like detailed engineering assemblies.

For SIMPLE parts (single gear, bracket, etc.), return 1-3 parts.
For COMPLEX objects (vehicles, machines, robots, devices), decompose into 40-80+ sub-parts for maximum detail.
For MULTI-VEHICLE systems (swarms, fleets, convoys), model EACH vehicle separately with full detail.

Available shape types: gear, bracket, box, cylinder, sphere, cone, wedge, torus, tube, plate, wheel, camera, antenna, drill, track, bolt, nut, screw, bearing, pulley, shaft, mug, hammer, handle.

COMPOUND TYPE RULES (HIGHEST PRIORITY — ALWAYS FOLLOW):
- "wheel": ANY wheel — auto-renders with tire, spoked rim, hub cap, axle hole, treads.
- "camera": ANY camera/optical sensor — auto-renders with body, lens barrel, glass, LED, mount.
- "antenna": ANY antenna/dish — auto-renders with parabolic dish, mast, feed horn, struts.
- "drill": ANY drill/boring tool — auto-renders with motor housing, chuck, spiral bit, tip.
- "track": ANY tank/caterpillar track — auto-renders with road wheels, sprocket, idler, pads.
- "bolt": ANY bolt — auto-renders with hex head, threaded shaft, chamfered tip.
- "nut": ANY nut — auto-renders with hex body, bore hole, internal threads.
- "screw": ANY screw — auto-renders with Phillips head, tapered threaded shaft, pointed tip.
- "bearing": ANY ball bearing — auto-renders with outer/inner rings, balls, cage.
- "pulley": ANY pulley — auto-renders with flanges, grooved body, hub, spokes.
- "shaft": ANY shaft/rod — auto-renders with keyway slot and chamfered ends.
- "mug": ANY cup/mug — auto-renders with hollow body, handle, rim.
- "hammer": ANY hammer — auto-renders with wooden handle, metal head, ball peen.
- "handle": ANY knob/handle — auto-renders with knob, stem, base flange.

If user asks to "generate a wheel" → use type "wheel" (NOT impeller).
If user asks for an impeller/turbine/fan → use wedges/plates radially around a cylinder hub.

Shape guide for BASIC types:
- box: chassis bodies, panels, frames, housings, blocks, covers
- cylinder: pipes, columns, posts (NOT for wheels/shafts/bolts — use compound types)
- sphere: domes, ball joints, pressure vessels (NOT for camera sensors)
- cone: nozzles, funnels, tapered connectors
- wedge: ramps, angled armor, turbine/impeller blades, sloped panels
- torus: seals, o-rings, circular rails
- tube: hollow pipes, exhaust tubes, structural tubes
- plate: solar panels, flat mounting plates, fins, wings, shelves
- gear: drive gears, sprockets, cogs
- bracket: L-shaped mounts, suspension arms, support struts

For each part, provide:
- type: one of the available shapes
- label: descriptive name (max 30 chars)
- position: [x, y, z] — CAREFULLY position
- rotation: [rx, ry, rz] in DEGREES
- color: hex color per sub-system:
  * Chassis/frame: #c4b5fd | Wheels/treads: #a5b4fc | Sensors: #a5f3fc
  * Power/solar: #fde68a | Tools/arms: #fdba74 | Structural: #e9d5ff
  * Fasteners: #d1d5db | Accent: #f9a8d4
- params: geometry parameters specific to type

Params:
  - gear: teeth (6-80), holeDiameter (0-1), thickness (0.1-1.5)
  - bracket: armLength (0.3-3), thickness (0.02-0.5), width (0.1-2)
  - box: width (0.1-10), height (0.1-10), depth (0.1-10), slots (0-20), wallThickness (0.01-0.5)
  - cylinder: radius (0.05-5), height (0.1-10), wallThickness (0.01-0.5), segments (8-64)
  - sphere: radius (0.05-5), segments (8-64)
  - cone: radiusTop (0-5), radiusBottom (0.05-5), height (0.1-10), segments (8-64)
  - wedge: width (0.1-10), height (0.1-10), depth (0.1-10)
  - torus: radius (0.1-5), tube (0.01-2), segments (8-64)
  - tube: radius (0.05-5), height (0.1-10), wallThickness (0.01-1), segments (8-64)
  - plate: radius (0.1-10), thickness (0.01-1), width (0.1-10), depth (0.1-10)
  - wheel: radius (0.1-3), width (0.1-1), spokes (3-12), hubRadius (auto), treadDepth (0.02-0.1)
  - camera: lensRadius (0.03-0.3), bodyWidth (0.1-0.6), bodyHeight (0.08-0.4), bodyDepth (0.1-0.5)
  - antenna: dishRadius (0.2-2), mastHeight (0.5-5), mastRadius (0.02-0.1)
  - drill: bitLength (0.5-5), bitRadius (0.05-0.5), spirals (2-8)
  - track: trackLength (1-6), trackWidth (0.1-0.8), wheelCount (3-8), radius (0.1-0.5)
  - bolt: headRadius (0.1-1), headHeight (0.05-0.5), shaftRadius (0.03-0.5), shaftLength (0.3-5), threadPitch (0.03-0.3)
  - nut: nutRadius (0.1-1), nutHeight (0.05-0.5), boreRadius (0.03-0.5)
  - screw: headRadius (0.05-0.5), headHeight (0.02-0.3), shaftRadius (0.02-0.3), shaftLength (0.2-3)
  - bearing: outerRadius (0.2-3), innerRadius (0.05-1.5), bearingWidth (0.05-1), ballCount (4-16)
  - pulley: radius (0.2-3), width (0.1-1), grooveDepth (0.02-0.3), grooveWidth (0.03-0.5)
  - shaft: radius (0.03-1), height (0.3-10)
  - mug: mugRadius (0.2-1.5), mugHeight (0.3-2), handleSize (0.1-0.8), wallThickness (0.02-0.1)
  - hammer: handleLength (0.5-3), handleRadius (0.03-0.2), headWidth (0.2-1.5), headSize (0.08-0.5)
  - handle: knobRadius (0.05-0.5), stemRadius (0.02-0.2), stemHeight (0.1-1)

CRITICAL RULES:
1. ALWAYS use compound types when the object IS one of those things. NEVER substitute with basic primitives.
2. Use 30-60+ parts for complex objects.
3. For MULTI-VEHICLE scenes: position each vehicle separately (offset by 5-8 units).
4. Position with PRECISION: wheels touch ground, axles align, panels connect flush.
5. Use ROTATION for realism: suspension arms, tilted panels, angled cameras.
6. When user says "wheel" they mean a WHEEL — use type "wheel". Only use wedges for impeller/turbine blades.
${researchContext ? `\n\nREFERENCE RESEARCH (use for accurate proportions and structure):\n${researchContext}` : ""}

You MUST call the parse_cad function.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: imageBase64 ? "google/gemini-2.5-flash" : "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          ...(userContent.length > 1
            ? [{ role: "user" as const, content: userContent }]
            : [{ role: "user" as const, content: userContent[0]?.text || text }]),
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "parse_cad",
              description: "Return one or more CAD parts decomposed from the description.",
              parameters: {
                type: "object",
                properties: {
                  parts: {
                    type: "array",
                    description: "Array of parts. 20-50+ for complex objects.",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["gear", "bracket", "box", "cylinder", "sphere", "cone", "wedge", "torus", "tube", "plate", "wheel", "camera", "antenna", "drill", "track"] },
                        label: { type: "string" },
                        position: { type: "array", items: { type: "number" }, description: "[x, y, z]" },
                        rotation: { type: "array", items: { type: "number" }, description: "[rx, ry, rz] in degrees" },
                        color: { type: "string", description: "Hex color" },
                        params: {
                          type: "object",
                          properties: {
                            teeth: { type: "number" },
                            holeDiameter: { type: "number" },
                            thickness: { type: "number" },
                            armLength: { type: "number" },
                            width: { type: "number" },
                            height: { type: "number" },
                            depth: { type: "number" },
                            slots: { type: "number" },
                            wallThickness: { type: "number" },
                            radius: { type: "number" },
                            segments: { type: "number" },
                            radiusTop: { type: "number" },
                            radiusBottom: { type: "number" },
                            tube: { type: "number" },
                            spokes: { type: "number" },
                            hubRadius: { type: "number" },
                            treadDepth: { type: "number" },
                            lensRadius: { type: "number" },
                            bodyWidth: { type: "number" },
                            bodyHeight: { type: "number" },
                            bodyDepth: { type: "number" },
                            dishRadius: { type: "number" },
                            mastHeight: { type: "number" },
                            mastRadius: { type: "number" },
                            bitLength: { type: "number" },
                            bitRadius: { type: "number" },
                            spirals: { type: "number" },
                            trackLength: { type: "number" },
                            trackWidth: { type: "number" },
                            wheelCount: { type: "number" },
                          },
                        },
                      },
                      required: ["type", "label", "position", "rotation", "color", "params"],
                      additionalProperties: false,
                    },
                  },
                  assemblyName: {
                    type: "string",
                    description: "Name of the overall assembly if complex (e.g. 'Mars Rover'), or null if simple part",
                  },
                },
                required: ["parts", "assemblyName"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "parse_cad" } },
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
        return new Response(JSON.stringify({ error: "AI credits depleted, please add credits" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(localParse(text || "box")), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      console.log("AI parsed result:", JSON.stringify(parsed));
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(localParse(text || "box")), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-cad-text error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function localParse(text: string) {
  const t = text.toLowerCase();
  let type = "box";
  const params: Record<string, any> = {};

  if (t.includes("gear") || t.includes("cog") || t.includes("sprocket")) {
    type = "gear";
    const teethMatch = t.match(/(\d+)\s*teeth/);
    if (teethMatch) params.teeth = parseInt(teethMatch[1]);
    if (t.includes("hole")) params.holeDiameter = 0.35;
  } else if (t.includes("bracket") || t.includes("l-shape") || t.includes("mount")) {
    type = "bracket";
  } else if (t.includes("cylinder") || t.includes("pipe") || t.includes("tube") || t.includes("rod")) {
    type = "cylinder";
    if (t.includes("pipe") || t.includes("tube") || t.includes("hollow")) params.hollow = true;
  } else {
    if (t.includes("ventilation") || t.includes("slot") || t.includes("vent")) params.slots = 4;
    if (t.includes("hollow") || t.includes("open")) params.hollow = true;
  }
  const kawaiiColors = ["#f9a8d4", "#c4b5fd", "#99f6e4", "#fde68a", "#fecaca", "#e9d5ff"];
  const color = kawaiiColors[Math.floor(Math.random() * kawaiiColors.length)];
  return {
    parts: [{ type, label: text.slice(0, 30), position: [0, 0.5, 0], rotation: [0, 0, 0], color, params }],
    assemblyName: null,
  };
}
