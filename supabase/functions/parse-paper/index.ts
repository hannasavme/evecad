import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory IP rate limiter: max 5 requests per minute per IP (stricter for paper parsing)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
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
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const focusArea = formData.get("focusArea") as string | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "No PDF file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert PDF to base64 for the AI model
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const pdfBase64 = btoa(binary);

    // Step 1: Extract and analyze the paper using Gemini's PDF understanding
    console.log("Analyzing paper:", file.name, "size:", file.size);

    const analysisResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are a mechanical engineering research analyst specializing in robotics and vehicle design. Given an academic paper (as PDF), extract ALL information relevant to physical design, mechanical components, and 3D structures.

Extract with EXTREME detail:
- Every distinct vehicle, robot, or device described (mother rover, child rovers, drones, drillers, etc.)
- Each sub-system: chassis, wheels, suspension, arms, sensors, antennas, power units, docking bays
- Exact or approximate dimensions, proportions, and relative sizes between components
- Materials, geometries, mechanical linkages
- How components connect: mounting points, docking mechanisms, tether cables
- Wheel types (origami wheels, treads, etc.), their expanded/collapsed states
- Tool attachments: drills, scoops, grippers, cameras
- Communication hardware: antennas, dishes, masts
- Power systems: solar panels, RTGs, batteries
- Any spatial arrangement: how child rovers dock to the mother, where drills are mounted, etc.
- Figures/diagrams: describe every visible component in detail

Be EXHAUSTIVE. List every single component that would need to be modeled as a separate 3D part. Think about internal structure too: axles connecting wheels, support struts, mounting brackets, hinges.`,
          },
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: file.name,
                  file_data: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
              {
                type: "text",
                text: focusArea
                  ? `Analyze this academic paper. Focus specifically on: "${focusArea}". Extract all design-relevant information for building a 3D CAD model.`
                  : "Analyze this academic paper. Extract all design-relevant information for building a 3D CAD model of any device, mechanism, or physical system described.",
              },
            ],
          },
        ],
      }),
    });

    if (!analysisResponse.ok) {
      const errText = await analysisResponse.text();
      console.error("Analysis error:", analysisResponse.status, errText);

      if (analysisResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (analysisResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits depleted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Failed to analyze paper" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const analysisData = await analysisResponse.json();
    const paperAnalysis = analysisData.choices?.[0]?.message?.content || "";
    console.log("Paper analysis:", paperAnalysis.slice(0, 300));

    // Step 2: Convert analysis into CAD parts
    const cadResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `You are a MASTER CAD geometry decomposition engine that creates museum-quality 3D models from engineering descriptions. You must create 40-80+ parts for complex systems.

CRITICAL: When a paper describes MULTIPLE vehicles or robots (e.g., mother rover + child rovers + drillers), you MUST model ALL of them as separate sub-assemblies positioned in a scene together.

Available shape types: gear, bracket, box, cylinder, sphere, cone, wedge, torus, tube, plate, wheel, camera, antenna, drill, track.

Shape guide:
- box: rectangular solids (chassis, panels, frames, housings)
- cylinder: round columns, rods, axles, shafts
- sphere: balls, domes, joints, pressure vessels
- cone: nozzles, funnels, pointed tips
- wedge: ramps, angled supports, aerodynamic noses
- torus: rings, seals
- tube: hollow pipes, exhaust, structural tubes
- plate: flat panels, solar panels, fins, wings, shelves
- gear: toothed wheels, sprockets, cogs
- bracket: L-shaped mounts, supports, arms
- **wheel**: DETAILED wheel with tire, rim, hub, spokes, treads (USE for any wheel!)
- **camera**: DETAILED camera with body, lens, glass, LED, mount (USE for cameras/sensors!)
- **antenna**: DETAILED antenna with parabolic dish, mast, feed horn, struts (USE for antennas!)
- **drill**: DETAILED drill with motor, chuck, spiral bit, tip (USE for drills!)
- **track**: DETAILED tank track with road wheels, sprocket, idler, pads (USE for tracked vehicles!)

For each part provide: type, label (max 30 chars), position [x,y,z], rotation [rx,ry,rz] in degrees, color hex, and params.

Params by type:
- gear: teeth, holeDiameter, thickness
- bracket: armLength, thickness, width
- box: width, height, depth, slots, wallThickness
- cylinder: radius, height, wallThickness, segments
- sphere: radius, segments
- cone: radiusTop, radiusBottom, height, segments
- wedge: width, height, depth
- torus: radius, tube, segments
- tube: radius, height, wallThickness, segments
- plate: radius, thickness, width, depth
- wheel: radius, width, spokes, hubRadius, treadDepth
- camera: lensRadius, bodyWidth, bodyHeight, bodyDepth
- antenna: dishRadius, mastHeight, mastRadius
- drill: bitLength, bitRadius, spirals
- track: trackLength, trackWidth, wheelCount, radius

CRITICAL RULES:
1. Generate 40-80+ parts. Every wheel, strut, panel, sensor, joint, axle, and detail is a separate part.
2. For MULTI-VEHICLE systems: model each vehicle separately, positioned apart in the scene.
   - Mother rover at center (0,0,0), child rovers offset at (6,0,3), (-5,0,4), etc.
   - Each vehicle gets its own full set of parts: chassis, wheels, axles, sensors, etc.
3. WHEELS: Use the 'wheel' type (not cylinder+torus). Each wheel auto-renders with tire, rim, hub, spokes, treads.
4. CAMERAS: Use the 'camera' type (not sphere). Auto-renders with lens barrel, glass, body, LED.
5. ANTENNAS: Use the 'antenna' type (not cone+cylinder). Auto-renders with parabolic dish, mast, feed horn.
6. DRILLS: Use the 'drill' type (not cylinder+cone). Auto-renders with spiral bit, motor housing, chuck.
7. TRACKS: Use the 'track' type for tracked vehicles. Auto-renders with road wheels, sprocket, track pads.
8. CHASSIS: Build from multiple boxes/plates — main body, side panels, top cover, bottom plate.
9. Use ROTATION extensively — suspension arms at 30-45°, angled solar panels, tilted cameras.
10. Use VARIED COLORS to distinguish sub-systems.
11. Position parts with PRECISION — wheels touch ground at y=wheel_radius, parts connect properly.
12. Think like an engineer: frame → wheels → body panels → subsystems → sensors → details.
You MUST call the parse_cad function.`,
          },
          {
            role: "user",
            content: `Based on this engineering analysis from an academic paper, create a detailed 3D CAD model:\n\n${paperAnalysis}${focusArea ? `\n\nUser focus: ${focusArea}` : ""}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "parse_cad",
              description: "Return CAD parts decomposed from the paper analysis.",
              parameters: {
                type: "object",
                properties: {
                  parts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["gear", "bracket", "box", "cylinder", "sphere", "cone", "wedge", "torus", "tube", "plate", "wheel", "camera", "antenna", "drill", "track"] },
                        label: { type: "string" },
                        position: { type: "array", items: { type: "number" }, description: "[x, y, z]" },
                        rotation: { type: "array", items: { type: "number" }, description: "[rx, ry, rz] degrees" },
                        color: { type: "string" },
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
                    description: "Name of the design from the paper",
                  },
                  paperSummary: {
                    type: "string",
                    description: "One-line summary of what was extracted from the paper (max 100 chars)",
                  },
                },
                required: ["parts", "assemblyName", "paperSummary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "parse_cad" } },
      }),
    });

    if (!cadResponse.ok) {
      const errText = await cadResponse.text();
      console.error("CAD decomposition error:", cadResponse.status, errText);
      return new Response(JSON.stringify({ error: "Failed to generate CAD model from paper" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cadData = await cadResponse.json();
    const toolCall = cadData.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      console.log("Paper CAD result:", JSON.stringify(parsed).slice(0, 300));
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Failed to parse CAD output" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-paper error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
