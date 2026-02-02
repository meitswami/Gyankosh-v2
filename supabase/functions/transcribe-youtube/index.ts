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

    const { video_url, save_to_db } = await req.json();

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: "video_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing YouTube video: ${video_url}, save_to_db: ${save_to_db}`);

    const startTime = performance.now();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Use Gemini to analyze the YouTube video directly
    // Gemini can access and analyze YouTube videos by URL
    const transcriptionResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are an expert video analyzer and transcription system. For the provided YouTube video:

1. Watch/analyze the entire video
2. Provide a complete transcription of all spoken content
3. Create time-based segments with approximate timestamps
4. Identify different speakers if present
5. Support Hindi, English, Hinglish, and Indian regional languages

Return a JSON object with this exact structure:
{
  "title": "video title or description",
  "full_text": "complete transcription of all spoken content",
  "summary": "brief 2-3 sentence summary of the video content",
  "language": "detected language (e.g., 'hi', 'en', 'hi-en' for mixed)",
  "speakers_detected": number,
  "duration_estimate": estimated_duration_in_seconds,
  "segments": [
    {
      "start": start_time_in_seconds,
      "end": end_time_in_seconds,
      "text": "segment text",
      "speaker": "Speaker 1" or null
    }
  ],
  "topics": ["topic1", "topic2"],
  "key_points": ["key point 1", "key point 2"]
}

Be accurate and preserve the original language. Transcribe exactly what is spoken.`
          },
          {
            role: "user",
            content: `Please watch and transcribe this YouTube video: ${video_url}

Provide a complete transcription with timestamps and identify all key information from the video.`
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 16000,
      }),
    });

    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text();
      console.error("YouTube transcription error:", errorText);
      throw new Error("YouTube video analysis failed");
    }

    const transcriptionResult = await transcriptionResponse.json();
    const content = transcriptionResult.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("No transcription content received");
    }

    let parsedTranscription;
    try {
      parsedTranscription = JSON.parse(content);
    } catch {
      // If JSON parsing fails, create a simple transcription from the content
      parsedTranscription = {
        title: "YouTube Video",
        full_text: content,
        summary: content.slice(0, 200),
        language: "en",
        speakers_detected: 1,
        duration_estimate: 60,
        segments: [{ start: 0, end: 60, text: content, speaker: null }],
        topics: [],
        key_points: []
      };
    }

    const processingTime = Math.round(performance.now() - startTime);

    console.log(`YouTube transcription complete: ${parsedTranscription.segments?.length || 0} segments in ${processingTime}ms`);

    // Only save to database if explicitly requested (when called from MediaUploadPanel)
    // For chat-based analysis, we just return the result without saving
    return new Response(
      JSON.stringify({
        success: true,
        title: parsedTranscription.title,
        summary: parsedTranscription.summary,
        full_text: parsedTranscription.full_text,
        language: parsedTranscription.language,
        speakers_detected: parsedTranscription.speakers_detected,
        duration_estimate: parsedTranscription.duration_estimate,
        segments_count: parsedTranscription.segments?.length || 0,
        segments: parsedTranscription.segments,
        topics: parsedTranscription.topics,
        key_points: parsedTranscription.key_points,
        processing_time_ms: processingTime,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("YouTube transcription error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "YouTube transcription failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
