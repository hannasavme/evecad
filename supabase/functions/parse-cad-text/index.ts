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

Available shape types: gear, bracket, box, cylinder, sphere, cone, wedge, torus, tube, plate.

Shape guide with DETAILED usage:
- box: chassis bodies, panels, frames, housings, blocks, covers, instrument boxes, docking bays
- cylinder: wheels, axles, shafts, rods, masts, antenna poles, drill bits, barrels, rollers, hubs
- sphere: sensor heads, domes, ball joints, camera housings, radar domes
- cone: nozzles, funnels, drill tips, antenna dishes (wide radiusBottom, small radiusTop), tapered connectors
- wedge: ramps, angled armor, aerodynamic noses, sloped panels, plow blades
- torus: wheel rims, seals, o-rings, tire rings, circular rails
- tube: hollow pipes, exhaust tubes, cable conduits, structural tubes, handles, roll cages
- plate: solar panels, flat mounting plates, fins, wings, shelves, flanges, ground plates, skid plates
- gear: drive gears, sprockets, cogs, reduction gears
- bracket: L-shaped mounts, suspension arms, support struts, hinged arms, camera mounts

For each part, provide:
- type: one of the available shapes
- label: descriptive name (max 30 chars), e.g. "FL Wheel", "Chassis Top Panel", "Drill Bit Tip"
- position: [x, y, z] — CAREFULLY position. Wheels touch ground at y=radius. Axles align with wheel centers.
- rotation: [rx, ry, rz] in DEGREES — suspension arms at 30-45°, solar panels tilted, cameras angled
- color: hex color. Use cohesive but distinct colors per sub-system:
  * Chassis/frame: #c4b5fd (lavender)
  * Wheels/treads: #a5b4fc (periwinkle) 
  * Sensors/cameras: #a5f3fc (sky)
  * Power/solar: #fde68a (lemon)
  * Tools/arms: #fdba74 (peach)
  * Structural/brackets: #e9d5ff (lilac)
  * Accent/details: #f9a8d4 (sakura)
- params: geometry parameters specific to type (see ranges below)

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

EXAMPLE — How to build a 4-wheeled rover (30+ parts minimum):
1. Main chassis: box (w:3, h:0.6, d:2) at y=0.8
2. Top cover plate: plate (w:2.8, d:1.8, thick:0.05) at y=1.15
3. Bottom skid plate: plate (w:2.5, d:1.5, thick:0.03) at y=0.5
4. 4x Wheels: cylinder (r:0.4, h:0.3) at corners, each with:
5. 4x Wheel rims: torus (r:0.35, tube:0.05) same positions
6. 4x Axle stubs: cylinder (r:0.06, h:0.5) connecting wheels to chassis
7. 4x Suspension brackets: bracket (armLen:0.5) at 20° angles
8. Antenna mast: cylinder (r:0.03, h:1.2) on top
9. Antenna dish: cone (rTop:0.02, rBot:0.4, h:0.15) on top of mast
10. Camera: sphere (r:0.08) + cylinder mount
11. Solar panel: plate (w:1.5, d:0.8) tilted at 15°
...and so on for every detail.

CRITICAL RULES:
1. Use 40-80+ parts for complex objects. Every wheel needs wheel+rim+axle (3 parts each).
2. For MULTI-VEHICLE scenes: position each vehicle separately (offset by 5-8 units).
3. Position with PRECISION: wheels touch ground, axles align, panels connect flush.
4. Use ROTATION for realism: suspension arms, tilted panels, angled cameras, drill angles.
5. Build LAYERED: frame → drivetrain → body panels → sub-systems → details → accessories.
6. Each sub-assembly (wheel set, arm, antenna) should have 3-5+ parts, not just 1.
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
                        type: { type: "string", enum: ["gear", "bracket", "box", "cylinder", "sphere", "cone", "wedge", "torus", "tube", "plate"] },
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
