import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { query, excelContent, excelMeta, searchResults, wantsVisualization } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context from search results
    let searchContext = "";
    if (searchResults && searchResults.length > 0) {
      searchContext = "\n\nDirect matches found:\n" + searchResults
        .map((r: any) => `- Sheet "${r.sheet}", Cell ${r.cell}: "${r.value}"`)
        .join("\n");
    }

    // Build sheet info
    const sheetInfo = excelMeta.sheets
      .map((s: any) => `- Sheet ${s.index} "${s.name}": ${s.rowCount} rows, Headers: [${s.headers.slice(0, 10).join(", ")}${s.headers.length > 10 ? "..." : ""}]`)
      .join("\n");

    const systemPrompt = `You are an expert Excel analyst AI assistant, similar to Microsoft Copilot for Excel.

You are analyzing the Excel file: "${excelMeta.fileName}"

Available Sheets:
${sheetInfo}

Excel Data (with cell references in format [SheetName!CellRef]):
${excelContent.slice(0, 30000)}
${searchContext}

IMPORTANT INSTRUCTIONS:
1. ALWAYS cite the exact cell references (e.g., Sheet1!A1, Data!B5) in your answers
2. When showing values, format as: "The value in [Sheet!Cell] is X"
3. For calculations, show the formula and result: "SUM of B2:B10 = 1234"
4. Be precise and accurate - verify data before answering
5. If asked for visualization, suggest which columns would work best for charts
6. Support common Excel operations: SUM, AVERAGE, COUNT, MAX, MIN, VLOOKUP concepts, etc.
7. Format numbers nicely (commas, decimals)
8. If data spans multiple sheets, search across ALL sheets
9. Always respond in the same language as the user's question

${wantsVisualization ? "\nThe user wants a visualization. Suggest what type of chart would work best and which columns to use." : ""}`;

    console.log(`Excel search query: "${query}" for file: ${excelMeta.fileName}`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI service error");
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Excel search error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
