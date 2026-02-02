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
      console.error("Missing or invalid Authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized - Missing token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error("JWT validation failed:", claimsError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log(`Authenticated request from user: ${userId}`);

    const formData = await req.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // File size validation (max 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: "File too large. Maximum size is 10MB." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fileName = file.name.toLowerCase();
    const fileType = file.type || "";
    let textContent = "";

    console.log(`Parsing file: ${file.name}, type: ${fileType}, size: ${file.size}, user: ${userId}`);

    // Handle different file types
    if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
      // Plain text files
      textContent = await file.text();
      console.log("Extracted text file content, length:", textContent.length);
    } else if (isImageFile(fileName, fileType)) {
      // Image files - use OCR via AI vision
      console.log("Processing image file with OCR...");
      textContent = await extractTextFromImageWithAI(file);
    } else if (isVideoFile(fileName, fileType)) {
      // Video files - extract frames and analyze
      console.log("Processing video file with AI vision...");
      textContent = await extractTextFromVideoWithAI(file);
    } else if (fileName.endsWith(".pdf")) {
      // PDF files - try AI extraction with vision for scanned PDFs
      console.log("Processing PDF file...");
      textContent = await extractTextFromPdfWithAI(file);
    } else if (fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
      // Word documents
      console.log("Processing Word document...");
      textContent = await extractTextFromDocWithAI(file);
    } else {
      // Try to read as plain text
      try {
        textContent = await file.text();
      } catch {
        textContent = "";
      }
    }

    // Clean up extracted text - preserve Hindi and other Unicode characters
    textContent = textContent
      .replace(/\s+/g, " ")
      .trim();

    console.log("Final content length:", textContent.length);

    if (textContent.length < 10) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Could not extract meaningful text from the document. The file may be corrupted or in an unsupported format.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        content: textContent,
        fileName: file.name,
        fileSize: file.size,
        fileType: fileType
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Parse error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to parse document" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function isImageFile(fileName: string, fileType: string): boolean {
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif"];
  const imageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/tiff"];
  
  return imageExtensions.some(ext => fileName.endsWith(ext)) || imageTypes.includes(fileType);
}

function isVideoFile(fileName: string, fileType: string): boolean {
  const videoExtensions = [".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".wmv", ".flv"];
  const videoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"];
  
  return videoExtensions.some(ext => fileName.endsWith(ext)) || videoTypes.includes(fileType);
}

// Safe base64 encoding for large files - avoids stack overflow
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 32768; // Process in chunks to avoid stack overflow
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function extractTextFromImageWithAI(file: File): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    console.error("LOVABLE_API_KEY not available for OCR");
    return "";
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    const mimeType = file.type || "image/jpeg";

    console.log("Calling AI for image OCR (multilingual support)...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are an expert multilingual OCR (Optical Character Recognition) system with strong support for Indian languages including Hindi (हिंदी), Marathi, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, and other Devanagari/regional scripts.

CRITICAL INSTRUCTIONS:
- Extract ALL text visible in the image, regardless of language
- PRESERVE the original script and language - do NOT transliterate Hindi to English
- Hindi text must remain in Devanagari script (देवनागरी)
- Maintain the exact text as written in the document
- For mixed-language documents (Hindi + English), extract both correctly
- Preserve document structure, reading order, and formatting
- For identity documents (Aadhaar, PAN, Voter ID, etc.): extract ALL fields including name, ID numbers, dates, addresses in their original language
- For government forms: extract all labels and values
- Handle handwritten text with best effort
- Do NOT summarize, translate, or analyze - extract raw text only
- Return ONLY the extracted text content`
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`
                }
              },
              {
                type: "text",
                text: "Extract ALL text from this image. If it contains Hindi or other Indian languages, preserve the original script exactly. Return only the extracted text."
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI OCR failed:", response.status, errText);
      return "";
    }

    const result = await response.json();
    const extractedText = result.choices?.[0]?.message?.content || "";
    console.log("OCR extraction successful, length:", extractedText.length);
    
    return extractedText;
  } catch (error) {
    console.error("OCR extraction error:", error);
    return "";
  }
}

async function extractTextFromVideoWithAI(file: File): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    console.error("LOVABLE_API_KEY not available for video analysis");
    return "";
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    const mimeType = file.type || "video/mp4";

    console.log("Calling AI for video analysis (multilingual support)...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are an expert multilingual video analyzer with OCR and scene understanding capabilities.
You have strong support for Indian languages including Hindi (हिंदी), Marathi, Gujarati, Bengali, Tamil, Telugu, and other regional scripts.

CRITICAL INSTRUCTIONS:
1. ANALYZE THE VIDEO thoroughly - watch the entire content
2. EXTRACT ALL VISIBLE TEXT using OCR - preserve original scripts (Devanagari, etc.)
3. DESCRIBE key scenes, objects, people, actions, and events
4. TRANSCRIBE any spoken words or audio (if available)
5. For documents/slides in video: extract all text content
6. For presentations: capture slide titles, bullet points, content
7. For tutorials/demos: describe step-by-step actions
8. Preserve Hindi/Indian language content in original script
9. Maintain chronological order of events

OUTPUT FORMAT:
[VIDEO ANALYSIS]
Duration: (estimated)
Type: (documentary/tutorial/presentation/etc.)

[EXTRACTED TEXT/OCR]
(All visible text in original scripts)

[SCENE DESCRIPTIONS]
(Chronological description of key scenes)

[AUDIO/SPEECH TRANSCRIPTION]
(Any detected speech or audio content)

[KEY INFORMATION]
(Summary of important facts/data from the video)`
          },
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: file.name,
                  file_data: `data:${mimeType};base64,${base64}`
                }
              },
              {
                type: "text",
                text: "Analyze this video completely. Extract all visible text (OCR), describe scenes, and transcribe any speech. Preserve Hindi and other Indian language content in original script. Provide a comprehensive analysis."
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI video analysis failed:", response.status, errText);
      return `[Video file: ${file.name}] - Video analysis temporarily unavailable. Please try with a smaller video or image captures.`;
    }

    const result = await response.json();
    const extractedText = result.choices?.[0]?.message?.content || "";
    console.log("Video analysis successful, length:", extractedText.length);
    
    return extractedText;
  } catch (error) {
    console.error("Video analysis error:", error);
    return `[Video file: ${file.name}] - Error analyzing video: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

async function extractTextFromPdfWithAI(file: File): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    console.log("LOVABLE_API_KEY not available, falling back to basic extraction");
    return await basicPdfExtraction(file);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);

    console.log("Calling AI for PDF extraction (multilingual OCR support)...");

    // Use Gemini's PDF/document understanding capability
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are an expert multilingual document text extractor with OCR capabilities. You have strong support for Indian languages including Hindi (हिंदी), Marathi, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, and other Devanagari/regional scripts.

CRITICAL INSTRUCTIONS:
- Extract ALL text from every page of the document
- If the PDF contains scanned images, perform OCR on them
- PRESERVE the original script and language - do NOT transliterate Hindi to English
- Hindi text must remain in Devanagari script (देवनागरी)
- For mixed-language documents (Hindi + English), extract both correctly
- Maintain document structure and reading order
- For identity documents (Aadhaar, PAN, Voter ID, Driving License, etc.): extract ALL fields
- For government forms: extract all labels and values in their original language
- Handle poor quality scans and handwritten text with best effort
- Do NOT summarize, translate, or analyze - extract raw text only
- Return ONLY the extracted text content`
          },
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: file.name,
                  file_data: `data:application/pdf;base64,${base64}`
                }
              },
              {
                type: "text",
                text: "Extract ALL text from this PDF document. If it contains Hindi or other Indian languages, preserve the original Devanagari/regional script exactly. Perform OCR on any scanned images. Return only the extracted text."
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI PDF extraction failed:", response.status, errText);
      // Fallback to basic extraction
      return await basicPdfExtraction(file);
    }

    const result = await response.json();
    const extractedText = result.choices?.[0]?.message?.content || "";
    console.log("AI PDF extraction successful, length:", extractedText.length);
    
    // If AI extraction returned very little content, try basic extraction as fallback
    if (extractedText.length < 50) {
      console.log("AI extraction returned minimal content, trying basic extraction...");
      const basicText = await basicPdfExtraction(file);
      if (basicText.length > extractedText.length) {
        return basicText;
      }
    }
    
    return extractedText;
  } catch (error) {
    console.error("AI PDF extraction error:", error);
    return await basicPdfExtraction(file);
  }
}

async function extractTextFromDocWithAI(file: File): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    console.log("LOVABLE_API_KEY not available for DOCX");
    return await basicDocxExtraction(file);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    const mimeType = file.name.endsWith(".docx") 
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/msword";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are a multilingual document text extractor with support for Hindi and other Indian languages.
Extract ALL text preserving the original script (Devanagari, regional scripts, etc.). Do NOT transliterate.
Return ONLY the extracted text content.`
          },
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: file.name,
                  file_data: `data:${mimeType};base64,${base64}`
                }
              },
              {
                type: "text",
                text: "Extract all text from this Word document. Preserve Hindi and other Indian language scripts exactly. Return only the text content."
              }
            ]
          }
        ],
      }),
    });

    if (response.ok) {
      const result = await response.json();
      return result.choices?.[0]?.message?.content || "";
    } else {
      return await basicDocxExtraction(file);
    }
  } catch (error) {
    console.error("DOCX AI extraction error:", error);
    return await basicDocxExtraction(file);
  }
}

async function basicPdfExtraction(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const textBytes = new TextDecoder("latin1").decode(bytes);
  
  let extractedText = "";
  
  // Extract text from PDF text objects
  const textMatches = textBytes.matchAll(/\(([^)]{2,})\)/g);
  for (const match of textMatches) {
    const text = match[1]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\/g, "");
    if (text.length > 1 && /[a-zA-Z\u0900-\u097F]/.test(text)) {
      extractedText += text + " ";
    }
  }
  
  // Also look for TJ operator content
  const tjMatches = textBytes.matchAll(/\[([^\]]+)\]\s*TJ/g);
  for (const match of tjMatches) {
    const innerMatches = match[1].matchAll(/\(([^)]+)\)/g);
    for (const inner of innerMatches) {
      if (/[a-zA-Z\u0900-\u097F]/.test(inner[1])) {
        extractedText += inner[1];
      }
    }
    extractedText += " ";
  }
  
  // Clean up - preserve Hindi/Devanagari characters
  extractedText = extractedText
    .replace(/[^\x20-\x7E\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\s.,!?()-:;'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  
  return extractedText;
}

async function basicDocxExtraction(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const textBytes = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  
  let extractedText = "";
  const wtMatches = textBytes.matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g);
  for (const match of wtMatches) {
    extractedText += match[1] + " ";
  }
  
  return extractedText.trim();
}
