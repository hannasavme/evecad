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
            content: `You are a mechanical engineering research analyst. Given an academic paper (as PDF), extract all information relevant to physical design, mechanical components, and 3D structures.

Focus on:
- Any proposed device, mechanism, or physical system described
- Dimensions, materials, geometries mentioned
- Component lists, assemblies, structural elements
- Figures/diagrams descriptions of physical parts
- Design requirements and constraints
- Any specific shapes, sizes, proportions mentioned

Be thorough but concise. Extract the key engineering/design information that would be needed to create a simplified 3D CAD model of the paper's subject.`,
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
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a CAD geometry decomposition engine. Given a detailed engineering analysis of a device or system from an academic paper, create a 3D CAD model by decomposing it into primitive parts.

Available shape types: gear, bracket, box, cylinder.

For each part, provide:
- type: one of the available shapes
- label: descriptive name (max 30 chars)
- position: [x, y, z] coordinates — SPREAD PARTS OUT appropriately, don't stack them
- color: hex color from this palette ONLY: #f9a8d4 (pink), #c4b5fd (lavender), #99f6e4 (mint), #fde68a (yellow), #fecaca (peach), #e9d5ff (light purple). Vary colors across parts.
- params: geometry parameters specific to type:
  - gear: teeth (6-80), holeDiameter (0-1), thickness (0.1-1.5)
  - bracket: armLength (0.3-3), thickness (0.02-0.5), width (0.1-2)
  - box: width (0.1-10), height (0.1-10), depth (0.1-10), slots (0-20), wallThickness (0.01-0.5)
  - cylinder: radius (0.05-5), height (0.1-10), wallThickness (0.01-0.5), segments (8-64)

Think creatively about how to approximate the described design using these primitives. 
IMPORTANT: Position parts correctly relative to each other — don't put everything at [0,0,0].
Create enough parts to capture the key structural elements of the design.

You MUST call the parse_cad function.`,
          },
          {
            role: "user",
            content: `Based on this engineering analysis from an academic paper, create a 3D CAD model:\n\n${paperAnalysis}${focusArea ? `\n\nUser focus: ${focusArea}` : ""}`,
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
                        type: { type: "string", enum: ["gear", "bracket", "box", "cylinder"] },
                        label: { type: "string" },
                        position: { type: "array", items: { type: "number" }, description: "[x, y, z]" },
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
                          },
                        },
                      },
                      required: ["type", "label", "position", "color", "params"],
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
