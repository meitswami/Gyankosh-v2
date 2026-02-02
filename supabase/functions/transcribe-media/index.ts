import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

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

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const mediaId = formData.get("media_id") as string | null;
    const languageHint = formData.get("language") as string | null;

    if (!audioFile || !mediaId) {
      return new Response(
        JSON.stringify({ error: "Audio file and media_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing audio for media ${mediaId}, file size: ${audioFile.size}`);

    // Update status to processing
    await supabaseClient
      .from("media_files")
      .update({ status: "processing" })
      .eq("id", mediaId);

    const startTime = performance.now();

    // Use Lovable AI Gateway with Gemini for transcription
    // Convert audio to base64
    const arrayBuffer = await audioFile.arrayBuffer();
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const mimeType = audioFile.type || "audio/wav";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Use Gemini for audio transcription with structured output
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
            content: `You are an expert audio transcription system. Transcribe the audio accurately with:
1. Full text transcription
2. Time-based segments (approximate timestamps in seconds)
3. Speaker identification if multiple speakers are detected (label as Speaker 1, Speaker 2, etc.)
4. Support for Hindi, English, Hinglish, and Indian regional languages

Return a JSON object with this structure:
{
  "full_text": "complete transcription",
  "language": "detected language (e.g., 'hi', 'en', 'hi-en' for mixed)",
  "speakers_detected": number,
  "segments": [
    {
      "start": start_time_in_seconds,
      "end": end_time_in_seconds,
      "text": "segment text",
      "speaker": "Speaker 1" or null
    }
  ]
}

Be accurate and preserve the original language. For mixed language (code-switching), transcribe as spoken.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: languageHint 
                  ? `Transcribe this audio. Language hint: ${languageHint}`
                  : "Transcribe this audio accurately with timestamps and speaker detection."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Audio}`
                }
              }
            ]
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 16000,
      }),
    });

    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text();
      console.error("Transcription error:", errorText);
      
      // Update status to error
      await supabaseClient
        .from("media_files")
        .update({ status: "error", error_message: "Transcription failed" })
        .eq("id", mediaId);

      throw new Error("Transcription service failed");
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
      // If JSON parsing fails, create a simple transcription
      parsedTranscription = {
        full_text: content,
        language: "en",
        speakers_detected: 1,
        segments: [{ start: 0, end: 60, text: content, speaker: null }]
      };
    }

    const processingTime = Math.round(performance.now() - startTime);

    // Save transcript
    const { data: transcript, error: transcriptError } = await supabaseClient
      .from("media_transcripts")
      .insert({
        media_id: mediaId,
        full_text: parsedTranscription.full_text || content,
        language: parsedTranscription.language || "en",
        speakers_detected: parsedTranscription.speakers_detected || 1,
        processing_time_ms: processingTime,
      })
      .select()
      .single();

    if (transcriptError) {
      console.error("Error saving transcript:", transcriptError);
      throw new Error("Failed to save transcript");
    }

    // Save segments
    const segments = parsedTranscription.segments || [];
    if (segments.length > 0) {
      const segmentsToInsert = segments.map((seg: TranscriptionSegment, idx: number) => ({
        media_id: mediaId,
        transcript_id: transcript.id,
        segment_index: idx,
        start_time: seg.start || 0,
        end_time: seg.end || 0,
        text: seg.text || "",
        speaker_label: seg.speaker || null,
        confidence: 0.9,
      }));

      const { error: segmentsError } = await supabaseClient
        .from("media_segments")
        .insert(segmentsToInsert);

      if (segmentsError) {
        console.error("Error saving segments:", segmentsError);
      }
    }

    // Update media file status to ready
    await supabaseClient
      .from("media_files")
      .update({ status: "ready" })
      .eq("id", mediaId);

    console.log(`Transcription complete for ${mediaId}: ${segments.length} segments in ${processingTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        transcript_id: transcript.id,
        full_text: parsedTranscription.full_text,
        language: parsedTranscription.language,
        speakers_detected: parsedTranscription.speakers_detected,
        segments_count: segments.length,
        processing_time_ms: processingTime,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Transcription error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Transcription failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
