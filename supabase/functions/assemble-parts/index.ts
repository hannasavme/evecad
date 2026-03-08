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
    const { models } = await req.json();
    if (!models || !Array.isArray(models) || models.length < 2) {
      return new Response(JSON.stringify({ error: "Need at least 2 models to assemble" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify(localAssembly(models)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const modelDescriptions = models.map((m: any, i: number) =>
      `Part ${i + 1}: type="${m.type}", label="${m.label}", scale=[${m.scale}], position=[${m.position}], color="${m.color}"`
    ).join("\n");

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
            content: `You are a mechanical engineering AI assistant. Given a list of 3D parts, analyze how they can be assembled together.

For each part, suggest:
- New position to align parts properly for assembly
- Scale adjustments if sizes are incompatible
- Any modifications needed (like drilling holes, resizing bores, adding connectors)
- Assembly instructions

Available part types: gear, bracket, box, cylinder.

You MUST call the assembly_plan function with your result. Positions should be reasonable 3D coordinates. Keep parts close together for assembly.`,
          },
          { role: "user", content: `I have these parts to assemble:\n${modelDescriptions}\n\nPlease create an assembly plan.` },
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
                          type: "array",
                          items: { type: "number" },
                          description: "New [x, y, z] position for assembly",
                        },
                        new_scale: {
                          type: "array",
                          items: { type: "number" },
                          description: "New [x, y, z] scale if adjustment needed",
                        },
                        modification: {
                          type: "string",
                          description: "Any modification needed (e.g. 'Drill 10mm bore for shaft', 'Resize to fit bracket slot')",
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
                    description: "Any extra parts needed for assembly (bolts, connectors, spacers)",
                  },
                  instructions: {
                    type: "string",
                    description: "Step-by-step assembly instructions (concise, max 200 chars)",
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

      return new Response(JSON.stringify(localAssembly(models)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(localAssembly(models)), {
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

function localAssembly(models: any[]) {
  const parts = models.map((m: any, i: number) => ({
    id: m.id,
    new_position: [i * 1.5, 0.5, 0],
    new_scale: m.scale || [1, 1, 1],
    modification: "Aligned for assembly",
  }));
  return {
    parts,
    additional_parts: [],
    instructions: "Parts aligned side by side. Connect manually as needed.",
  };
}
