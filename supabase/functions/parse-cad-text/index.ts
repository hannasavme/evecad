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
      userContent.push({
        type: "image_url",
        image_url: { url: imageBase64 },
      });
      userContent.push({
        type: "text",
        text: text
          ? `Analyze this image of a mechanical part/sketch AND this description: "${text}". Extract the shape type and geometry parameters.`
          : "Analyze this image of a mechanical part or engineering sketch. Determine what type of CAD shape it represents and extract geometry parameters.",
      });
    } else {
      userContent.push({
        type: "text",
        text: text!,
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: imageBase64 ? "google/gemini-2.5-flash" : "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a precise CAD geometry parser. Given a description or image of a 3D mechanical part, extract the shape type AND detailed geometry parameters.

Available shape types: gear, bracket, box, cylinder.

For each type, extract relevant parameters:
- gear: teeth (number of teeth, default 16), holeDiameter (0-1 range, 0=no hole, default 0.35), thickness (extrusion depth 0.1-1.0, default 0.4)
- bracket: armLength (0.5-3.0, default 1.0), thickness (0.1-0.5, default 0.2), width (0.3-2.0, default 0.8), hasHoles (boolean, default false)
- box: width (0.5-3.0, default 1.2), height (0.5-3.0, default 1.2), depth (0.5-3.0, default 1.2), slots (number of ventilation slots 0-8, default 0), slotDirection ("x" or "z", default "x"), hollow (boolean, is it open/hollow, default false), wallThickness (0.05-0.3 if hollow, default 0.1)
- cylinder: radius (0.2-2.0, default 0.8), height (0.5-3.0, default 1.5), hollow (boolean, is it a pipe/tube, default false), wallThickness (0.05-0.3 if hollow, default 0.15), segments (smoothness 8-64, default 32)

Pay close attention to specifics mentioned: number of teeth, dimensions, whether something has holes/slots/is hollow, etc.
You MUST call the parse_cad function with your result.`,
          },
          ...(Array.isArray(userContent) && userContent.length > 1
            ? [{ role: "user" as const, content: userContent }]
            : [{ role: "user" as const, content: userContent[0]?.text || text }]),
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "parse_cad",
              description: "Return parsed CAD shape type, label, and geometry parameters.",
              parameters: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["gear", "bracket", "box", "cylinder"],
                  },
                  label: {
                    type: "string",
                    description: "Short descriptive label (max 30 chars)",
                  },
                  params: {
                    type: "object",
                    description: "Geometry parameters specific to the shape type",
                    properties: {
                      // Gear
                      teeth: { type: "number" },
                      holeDiameter: { type: "number" },
                      thickness: { type: "number" },
                      // Bracket
                      armLength: { type: "number" },
                      width: { type: "number" },
                      hasHoles: { type: "boolean" },
                      // Box
                      height: { type: "number" },
                      depth: { type: "number" },
                      slots: { type: "number" },
                      slotDirection: { type: "string", enum: ["x", "z"] },
                      hollow: { type: "boolean" },
                      wallThickness: { type: "number" },
                      // Cylinder
                      radius: { type: "number" },
                      segments: { type: "number" },
                    },
                  },
                },
                required: ["type", "label", "params"],
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
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits depleted, please add credits" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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

function localParse(text: string): { type: string; label: string; params: Record<string, any> } {
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
    if (t.includes("hole")) params.hasHoles = true;
  } else if (t.includes("cylinder") || t.includes("pipe") || t.includes("tube") || t.includes("rod")) {
    type = "cylinder";
    if (t.includes("pipe") || t.includes("tube") || t.includes("hollow")) params.hollow = true;
  } else {
    type = "box";
    if (t.includes("ventilation") || t.includes("slot") || t.includes("vent")) params.slots = 4;
    if (t.includes("hollow") || t.includes("open")) params.hollow = true;
  }

  return { type, label: text.slice(0, 30), params };
}
