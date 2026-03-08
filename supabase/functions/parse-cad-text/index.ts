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
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'text' field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Fallback: local parsing without AI
      console.warn("LOVABLE_API_KEY not configured, using local parsing");
      return new Response(JSON.stringify(localParse(text)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
            content: `You are a CAD description parser. Given a text description of a 3D part, extract the shape type and a short label.
Available shape types: gear, bracket, box, cylinder.
If the description doesn't match any, pick the closest one.
You MUST call the parse_cad function with your result.`,
          },
          { role: "user", content: text },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "parse_cad",
              description: "Return the parsed CAD shape type and label from the description.",
              parameters: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["gear", "bracket", "box", "cylinder"],
                    description: "The shape type that best matches the description",
                  },
                  label: {
                    type: "string",
                    description: "A short descriptive label for this part (max 30 chars)",
                  },
                },
                required: ["type", "label"],
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

      // Fallback to local parsing
      return new Response(JSON.stringify(localParse(text)), {
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

    // Fallback
    return new Response(JSON.stringify(localParse(text)), {
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

function localParse(text: string): { type: string; label: string } {
  const t = text.toLowerCase();
  let type = "box";
  if (t.includes("gear") || t.includes("cog") || t.includes("sprocket")) type = "gear";
  else if (t.includes("bracket") || t.includes("l-shape") || t.includes("mount")) type = "bracket";
  else if (t.includes("cylinder") || t.includes("pipe") || t.includes("tube") || t.includes("rod")) type = "cylinder";
  return { type, label: text.slice(0, 30) };
}
