import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Extract video ID from various YouTube URL formats
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Fetch YouTube captions/transcript directly
async function fetchYouTubeTranscript(videoId: string): Promise<{
  transcript: Array<{ start: number; duration: number; text: string }>;
  language: string;
} | null> {
  try {
    // First, get the video page to extract caption track info
    const videoPageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
      },
    });
    
    if (!videoPageResponse.ok) {
      console.error("Failed to fetch YouTube page");
      return null;
    }
    
    const pageHtml = await videoPageResponse.text();
    
    // Extract captions data from the page
    const captionsMatch = pageHtml.match(/"captions":\s*(\{[^}]+?"playerCaptionsTracklistRenderer"[^}]+\})/);
    if (!captionsMatch) {
      // Try alternative pattern for captionTracks
      const altMatch = pageHtml.match(/"captionTracks":\s*(\[[^\]]+\])/);
      if (!altMatch) {
        console.log("No captions found for video");
        return null;
      }
      
      try {
        const captionTracks = JSON.parse(altMatch[1]);
        if (captionTracks.length === 0) return null;
        
        // Prefer Hindi or English captions
        const track = captionTracks.find((t: any) => t.languageCode === 'hi') ||
                      captionTracks.find((t: any) => t.languageCode === 'en') ||
                      captionTracks[0];
        
        const captionUrl = track.baseUrl;
        const language = track.languageCode || 'en';
        
        // Fetch the actual transcript
        const transcriptResponse = await fetch(captionUrl + "&fmt=json3");
        if (!transcriptResponse.ok) {
          console.error("Failed to fetch transcript");
          return null;
        }
        
        const transcriptData = await transcriptResponse.json();
        const events = transcriptData.events || [];
        
        const transcript = events
          .filter((e: any) => e.segs && e.segs.length > 0)
          .map((e: any) => ({
            start: (e.tStartMs || 0) / 1000,
            duration: (e.dDurationMs || 0) / 1000,
            text: e.segs.map((s: any) => s.utf8 || '').join(''),
          }))
          .filter((t: any) => t.text.trim());
        
        return { transcript, language };
      } catch (e) {
        console.error("Error parsing caption tracks:", e);
        return null;
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error fetching YouTube transcript:", error);
    return null;
  }
}

// Alternative: Use YouTube's timedtext API directly
async function fetchTimedText(videoId: string): Promise<{
  transcript: Array<{ start: number; duration: number; text: string }>;
  language: string;
} | null> {
  const languages = ['hi', 'en', 'hi-IN', 'en-US', 'a.hi', 'a.en']; // Try auto-generated too
  
  for (const lang of languages) {
    try {
      // Try the timedtext API
      const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.events && data.events.length > 0) {
          const transcript = data.events
            .filter((e: any) => e.segs && e.segs.length > 0)
            .map((e: any) => ({
              start: (e.tStartMs || 0) / 1000,
              duration: (e.dDurationMs || 0) / 1000,
              text: e.segs.map((s: any) => s.utf8 || '').join(''),
            }))
            .filter((t: any) => t.text.trim());
          
          if (transcript.length > 0) {
            return { transcript, language: lang.replace('a.', '') };
          }
        }
      }
    } catch (e) {
      console.log(`No transcript for lang ${lang}`);
    }
  }
  
  return null;
}

// Get video metadata using oEmbed
async function getVideoMetadata(videoId: string): Promise<{ title: string; author: string } | null> {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (response.ok) {
      const data = await response.json();
      return { title: data.title || '', author: data.author_name || '' };
    }
  } catch (e) {
    console.error("Error fetching video metadata:", e);
  }
  return null;
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

    const { video_url } = await req.json();

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: "video_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const videoId = extractVideoId(video_url);
    if (!videoId) {
      return new Response(
        JSON.stringify({ error: "Invalid YouTube URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing YouTube video: ${videoId}`);
    const startTime = performance.now();

    // Get video metadata
    const metadata = await getVideoMetadata(videoId);
    console.log("Video metadata:", metadata);

    // Try to fetch actual transcript
    let transcriptData = await fetchYouTubeTranscript(videoId);
    if (!transcriptData) {
      transcriptData = await fetchTimedText(videoId);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let parsedTranscription;

    if (transcriptData && transcriptData.transcript.length > 0) {
      // We have the actual transcript - use Gemini to analyze it
      const fullText = transcriptData.transcript.map(t => t.text).join(' ');
      console.log(`Got transcript with ${transcriptData.transcript.length} segments, ${fullText.length} chars`);

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
              content: `You are an expert content analyzer. Analyze the provided video transcript and return insights.

Return a JSON object with this structure:
{
  "title": "video title based on content",
  "summary": "2-3 sentence summary of what the video is about",
  "topics": ["main topic 1", "main topic 2"],
  "key_points": ["key point 1", "key point 2", "key point 3"],
  "speakers_detected": estimated number of speakers,
  "content_type": "educational" | "entertainment" | "news" | "tutorial" | "vlog" | "other",
  "sentiment": "positive" | "negative" | "neutral" | "mixed"
}

Respond in the same language as the transcript (Hindi/English/Hinglish).`
            },
            {
              role: "user",
              content: `Video Title: ${metadata?.title || 'Unknown'}
Author: ${metadata?.author || 'Unknown'}
Language: ${transcriptData.language}

Transcript:
${fullText.slice(0, 12000)}

Analyze this video content and provide insights.`
            }
          ],
          response_format: { type: "json_object" },
          max_tokens: 2000,
        }),
      });

      if (!analysisResponse.ok) {
        throw new Error("Analysis failed");
      }

      const analysisResult = await analysisResponse.json();
      const analysis = JSON.parse(analysisResult.choices?.[0]?.message?.content || '{}');

      // Build segments from actual transcript data
      const segments = transcriptData.transcript.map((t, idx) => ({
        start: t.start,
        end: t.start + t.duration,
        text: t.text,
        speaker: null,
      }));

      parsedTranscription = {
        title: metadata?.title || analysis.title || "YouTube Video",
        full_text: fullText,
        summary: analysis.summary || "Video transcript extracted successfully.",
        language: transcriptData.language,
        speakers_detected: analysis.speakers_detected || 1,
        duration_estimate: segments.length > 0 ? segments[segments.length - 1].end : 60,
        segments: segments,
        topics: analysis.topics || [],
        key_points: analysis.key_points || [],
        content_type: analysis.content_type,
        has_actual_transcript: true,
      };
    } else {
      // No transcript available - try to use title/description for context
      console.log("No transcript available, providing limited analysis");
      
      // Use Gemini to provide helpful response about the limitation
      const helpResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              content: `You are a helpful assistant. The user shared a YouTube video but we couldn't extract its transcript (no captions available).
              
Provide a helpful response in Hindi explaining:
1. This video doesn't have captions/subtitles enabled
2. We cannot analyze videos without text content
3. Suggest they can describe what they want to know about the video
4. Or try another video that has captions

Keep the response friendly and helpful.`
            },
            {
              role: "user",
              content: `Video URL: ${video_url}
Video Title: ${metadata?.title || 'Unknown'}
Author: ${metadata?.author || 'Unknown'}

The video has no available transcript/captions.`
            }
          ],
          max_tokens: 500,
        }),
      });

      const helpResult = await helpResponse.json();
      const helpMessage = helpResult.choices?.[0]?.message?.content || 
        "इस वीडियो में कैप्शन/सबटाइटल उपलब्ध नहीं हैं। कृपया वीडियो के बारे में बताएं कि आप क्या जानना चाहते हैं।";

      parsedTranscription = {
        title: metadata?.title || "YouTube Video",
        full_text: "",
        summary: helpMessage,
        language: "hi",
        speakers_detected: 0,
        duration_estimate: 0,
        segments: [],
        topics: [],
        key_points: [],
        has_actual_transcript: false,
        no_captions_available: true,
      };
    }

    const processingTime = Math.round(performance.now() - startTime);
    console.log(`YouTube processing complete in ${processingTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        video_id: videoId,
        ...parsedTranscription,
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
