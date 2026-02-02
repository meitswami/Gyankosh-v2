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

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { media_id, question } = await req.json();

    if (!media_id || !question) {
      return new Response(
        JSON.stringify({ error: "media_id and question are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get media file info
    const { data: mediaFile, error: mediaError } = await supabaseClient
      .from("media_files")
      .select("*")
      .eq("id", media_id)
      .single();

    if (mediaError || !mediaFile) {
      return new Response(
        JSON.stringify({ error: "Media file not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get transcript
    const { data: transcript } = await supabaseClient
      .from("media_transcripts")
      .select("*")
      .eq("media_id", media_id)
      .single();

    // Get all segments
    const { data: segments } = await supabaseClient
      .from("media_segments")
      .select("*")
      .eq("media_id", media_id)
      .order("start_time", { ascending: true });

    if (!transcript || !segments?.length) {
      return new Response(
        JSON.stringify({ error: "Transcript not found. Please wait for processing to complete." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context from segments
    const segmentContext = segments.map(s => 
      `[${formatTime(s.start_time)}-${formatTime(s.end_time)}]${s.speaker_label ? ` ${s.speaker_label}:` : ''} ${s.text}`
    ).join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Use AI to find relevant segments and answer the question
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
            content: `You are an AI assistant analyzing a ${mediaFile.media_type} file titled "${mediaFile.name}".

Your task is to answer questions based ONLY on the transcript content provided. Be accurate and ground your answers in the actual content.

When answering:
1. Cite specific timestamps when mentioning content from the ${mediaFile.media_type}
2. If there are multiple speakers, mention who said what
3. If the question cannot be answered from the transcript, say so clearly
4. Suggest the most relevant timestamp(s) to seek to

Respond in the same language as the user's question.

IMPORTANT: Return your response as JSON with this structure:
{
  "answer": "Your detailed answer here",
  "relevant_timestamps": [start_time_in_seconds, ...],
  "confidence": "high" | "medium" | "low",
  "speakers_mentioned": ["Speaker 1", ...] or null
}`
          },
          {
            role: "user",
            content: `Transcript with timestamps:\n\n${segmentContext}\n\n---\n\nQuestion: ${question}`
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("AI service error");
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content;

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(content);
    } catch {
      parsedResponse = {
        answer: content,
        relevant_timestamps: [],
        confidence: "medium",
        speakers_mentioned: null,
      };
    }

    // Find the segment IDs for the relevant timestamps
    const relevantSegmentIds = segments
      .filter(s => parsedResponse.relevant_timestamps?.some((t: number) => 
        t >= s.start_time && t <= s.end_time
      ))
      .map(s => s.id);

    // Save the Q&A
    await supabaseClient
      .from("media_qa")
      .insert({
        media_id,
        user_id: user.id,
        question,
        answer: parsedResponse.answer,
        relevant_segment_ids: relevantSegmentIds,
        relevant_timestamps: parsedResponse.relevant_timestamps || [],
      });

    return new Response(
      JSON.stringify({
        success: true,
        answer: parsedResponse.answer,
        relevant_timestamps: parsedResponse.relevant_timestamps || [],
        confidence: parsedResponse.confidence,
        speakers_mentioned: parsedResponse.speakers_mentioned,
        seek_to: parsedResponse.relevant_timestamps?.[0] || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Media Q&A error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
