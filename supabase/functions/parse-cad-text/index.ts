import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
    const systemPrompt = `You are a CAD geometry decomposition engine. Given a description or image, determine if it's a simple part or a complex object.

For SIMPLE parts (gear, bracket, box, cylinder, pipe, etc.), return a single part.
For COMPLEX objects (vehicles, machines, robots, furniture, devices, etc.), decompose them into multiple simpler sub-parts that can each be represented as one of: gear, bracket, box, cylinder.

Available shape types: gear, bracket, box, cylinder.

For each part, provide:
- type: one of the available shapes
- label: descriptive name (max 30 chars)
- position: [x, y, z] coordinates for assembly placement
- color: hex color from this kawaii palette ONLY: #f9a8d4 (pink), #c4b5fd (lavender), #99f6e4 (mint), #fde68a (yellow), #fecaca (peach), #e9d5ff (light purple). Vary colors across parts.
- params: geometry parameters specific to type:
  - gear: teeth (6-80), holeDiameter (0-1), thickness (0.1-1.5)
  - bracket: armLength (0.3-3), thickness (0.02-0.5), width (0.1-2)
  - box: width (0.1-10), height (0.1-10), depth (0.1-10), slots (0-20), wallThickness (0.01-0.5)
  - cylinder: radius (0.05-5), height (0.1-10), wallThickness (0.01-0.5), segments (8-64)

Think creatively about how to approximate complex shapes using these primitives. Pay close attention to PROPORTIONS and SPATIAL ARRANGEMENT — parts must be positioned correctly relative to each other.
${researchContext ? `\n\nREFERENCE RESEARCH about this object (use this for accurate proportions and structure):\n${researchContext}` : ""}

You MUST call the parse_cad function.`;
          },
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
                    description: "Array of parts. Single-element for simple objects, multiple for complex objects.",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["gear", "bracket", "box", "cylinder"] },
                        label: { type: "string" },
                        position: { type: "array", items: { type: "number" }, description: "[x, y, z]" },
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
                          },
                        },
                      },
                      required: ["type", "label", "position", "color", "params"],
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
    parts: [{ type, label: text.slice(0, 30), position: [0, 0.5, 0], color, params }],
    assemblyName: null,
  };
}
