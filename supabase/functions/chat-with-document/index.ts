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

    const { messages, documentContent, documentName, action, faqCount, targetLanguage, sourceLanguage, inputText } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let systemPrompt = "";
    let userMessages = messages || [];
    let detectedAction = action;

    // Auto-detect translation/paraphrase/grammar requests from natural language
    const userQuery = messages?.[0]?.content?.toLowerCase() || "";
    
    // Translation detection patterns
    const translatePatterns = [
      /translate\s+(this|to|into|in)\s+/i,
      /convert\s+(this|to|into|in)\s+/i,
      /(into|to|in)\s+(english|hindi|hinglish)/i,
      /इसे\s+(english|अंग्रेजी|हिंदी|hindi)/i,
      /इसको\s+(english|अंग्रेजी|हिंदी|hindi)/i,
      /का\s+(english|अंग्रेजी|हिंदी|hindi|translation)/i,
      /(english|hindi|hinglish)\s+(में|me|mein)\s+(translate|लिखो|बताओ|convert)/i,
    ];
    
    // Paraphrase detection patterns
    const paraphrasePatterns = [
      /paraphrase\s+(this|the|following)/i,
      /rewrite\s+(this|the|following)/i,
      /rephrase\s+(this|the|following)/i,
      /दूसरे\s+शब्दों\s+में/i,
      /फिर\s+से\s+लिखो/i,
    ];
    
    // Grammar detection patterns  
    const grammarPatterns = [
      /check\s+(the\s+)?grammar/i,
      /grammar\s+check/i,
      /fix\s+(the\s+)?grammar/i,
      /correct\s+(this|the|following)/i,
      /grammar\s+(सही|ठीक|fix)/i,
      /व्याकरण\s+(सही|ठीक|check)/i,
    ];

    if (!action && userQuery) {
      // Check for translation request
      if (translatePatterns.some(p => p.test(userQuery))) {
        detectedAction = "auto_translate";
      }
      // Check for paraphrase request
      else if (paraphrasePatterns.some(p => p.test(userQuery))) {
        detectedAction = "auto_paraphrase";
      }
      // Check for grammar request
      else if (grammarPatterns.some(p => p.test(userQuery))) {
        detectedAction = "auto_grammar";
      }
    }

    // Language Tools Actions
    if (action === "translate") {
      // Check if this is a document translation (has documentName)
      const isDocumentTranslation = documentName && documentName.length > 0;
      
      systemPrompt = `You are an expert multilingual translator specializing in English, Hindi, and Hinglish translations.

CRITICAL REQUIREMENTS:
- Translate with 100% accuracy preserving the exact meaning and context
- Maintain formal/informal tone as in the original
- For Hindi output, use proper Unicode Devanagari script (नहीं Romanized)
- For Hinglish, mix Hindi and English naturally as spoken in India
- Preserve formatting, punctuation, and paragraph structure
- Handle technical terms appropriately
- For proper nouns, keep them as-is unless there's a common Hindi equivalent
${isDocumentTranslation ? `
DOCUMENT TRANSLATION MODE:
- Preserve ALL paragraph breaks and line structure exactly as in the original
- Maintain heading hierarchy and section breaks
- Keep lists, bullet points, and numbered items in their original format
- Preserve indentation and spacing where possible
- Maintain document structure (titles, subtitles, body text)
- Output should be ready for direct copy-paste into Word documents
` : ''}

SOURCE LANGUAGE: ${sourceLanguage || 'Auto-detect'}
TARGET LANGUAGE: ${targetLanguage || 'Hindi'}

Translate the following text accurately. Output ONLY the translated text, no explanations.`;
      userMessages = [{ role: "user", content: inputText }];
    } else if (detectedAction === "auto_translate") {
      // Auto-detected translation from chat
      systemPrompt = `You are an expert multilingual translator specializing in English, Hindi, and Hinglish translations.

CRITICAL REQUIREMENTS:
- Auto-detect the source language
- Detect the target language from the user's request (look for "to English", "to Hindi", "in Hindi", "English में", etc.)
- Translate with 100% accuracy preserving the exact meaning and context
- Maintain formal/informal tone as in the original
- For Hindi output, use proper Unicode Devanagari script
- For Hinglish, mix Hindi and English naturally as spoken in India
- Preserve formatting and structure

If the user provides text in quotes or after a colon, translate that text.
If they ask to translate Hindi text to English or vice versa, detect and translate accordingly.

Provide a clear, properly formatted translation. Start with the translation directly.
If translating to Hindi, also provide the Kruti Dev format note: (For Kruti Dev font users: copy from above and paste).`;
    } else if (action === "paraphrase") {
      systemPrompt = `You are an expert paraphrasing assistant for Hindi, English, and Hinglish text.

CRITICAL REQUIREMENTS:
- Rewrite the text completely while preserving the exact meaning
- Use different vocabulary and sentence structures
- Maintain the same language as input (Hindi stays Hindi, English stays English)
- For Hindi, use proper Unicode Devanagari script
- Keep the same formality level
- Preserve important terms and proper nouns
- Make the text flow naturally
- 100% accuracy in meaning preservation is mandatory

Output ONLY the paraphrased text, no explanations or comparisons.`;
      userMessages = [{ role: "user", content: inputText }];
    } else if (detectedAction === "auto_paraphrase") {
      systemPrompt = `You are an expert paraphrasing assistant for Hindi, English, and Hinglish text.

The user wants you to paraphrase/rewrite some text. 
- Identify the text to paraphrase from their message
- Rewrite it completely while preserving the exact meaning
- Use different vocabulary and sentence structures
- Maintain the same language as input
- For Hindi, use proper Unicode Devanagari script
- Keep the same formality level

Provide the paraphrased text directly. If the text is in Hindi, keep it in Hindi.`;
    } else if (action === "grammar") {
      systemPrompt = `You are an expert grammar checker for Hindi, English, and Hinglish text.

CRITICAL REQUIREMENTS:
- Fix ALL grammar, spelling, and punctuation errors
- Maintain the original meaning exactly - do not change the intent
- Keep the same language (Hindi stays Hindi, English stays English, etc.)
- For Hindi, ensure proper Unicode Devanagari spelling and grammar
- Fix subject-verb agreement errors (e.g., "system have" → "system has")
- Fix verb tense consistency
- Fix spelling errors (e.g., "imreplaceble" → "irreplaceable")
- Fix word form errors (e.g., "simply" used as verb → "simplify")
- Fix sentence structure and word order
- Preserve the author's style and tone
- 100% accuracy required

IMPORTANT:
- Output ONLY the corrected text
- Do not add explanations unless there are significant structural changes
- If the text needs major restructuring, add a brief note after "---" explaining key corrections
- For English text, ensure proper grammar rules are followed (subject-verb agreement, tense consistency, etc.)`;
      userMessages = [{ role: "user", content: inputText }];
    } else if (detectedAction === "auto_grammar") {
      systemPrompt = `You are an expert grammar checker for Hindi, English, and Hinglish text.

The user wants you to check and fix grammar in some text.
- Identify the text to check from their message
- Fix all grammar, spelling, and punctuation errors
- Maintain the original meaning exactly
- Keep the same language (Hindi stays Hindi, etc.)
- For Hindi, ensure proper Devanagari spelling

Provide the corrected text directly, followed by a brief note about what was corrected.`;
    } else if (action === "summarize") {
      systemPrompt = `You are an expert document analyzer. Analyze the provided document content and return a JSON response.

Your task:
1. Identify the document type (e.g., "Identity Document", "Government Form", "Legal Contract", "Academic Paper", etc.)
2. Write a clear 2-3 sentence summary of what the document contains
3. Create a short memorable alias (2-4 words in the document's primary language)

IMPORTANT: 
- Respond in the same language as the document (Hindi, English, or Hinglish)
- Return ONLY a valid JSON object, no markdown formatting
- If the content seems corrupted or unreadable, still provide your best analysis

JSON format:
{"documentType": "type", "summary": "brief summary", "alias": "short name"}`;
      userMessages = [{ role: "user", content: `Analyze this document content and provide a JSON summary:\n\n${documentContent}` }];
    } else if (action === "generateFaq") {
      systemPrompt = `You are an expert at creating FAQs from documents. 
Generate exactly ${faqCount || 5} frequently asked questions and their answers based on the document content.
Respond in the same language as the document (Hindi, English, or Hinglish).
Make questions practical and answers informative.
Format as JSON array:
[{"question": "...", "answer": "..."}]`;
      userMessages = [{ role: "user", content: `Generate FAQs from this document:\n\n${documentContent}` }];
    } else {
      // Check if this is a global search (multiple documents)
      const isGlobalSearch = documentName === 'Knowledge Base' || (documentContent && documentContent.includes('--- Document:'));
      const hasDocuments = documentContent && documentContent.trim().length > 0;
      
      // Rich formatting instructions for professional documents
      const formattingInstruction = `
## Formatting Guidelines:
Use proper markdown formatting to structure your responses professionally:

### For Letters, Emails & Formal Documents:
- Start with proper salutation (Dear Sir/Madam, To Whom It May Concern, etc.)
- Include subject line in bold: **Subject: [topic]**
- Use proper paragraph breaks
- End with appropriate closing (Yours sincerely, Best regards, etc.)
- Include signature block with name/designation placeholders

### For Data & Analysis:
- Use markdown tables for tabular data:
  | Column 1 | Column 2 | Column 3 |
  |----------|----------|----------|
  | Data     | Data     | Data     |
- Use proper headings (# H1, ## H2, ### H3, etc.) for sections
- Use **bold** for emphasis and key terms
- Use *italics* for technical terms or document references
- Use numbered lists (1. 2. 3.) for steps or procedures
- Use bullet points (- or *) for features or items
- Use > blockquotes for important notes or excerpts
- Use \`code\` formatting for technical terms

### For Professional Reports:
- Include executive summary for long responses
- Use clear section headings
- Include key highlights in bold
- Add relevant citations from documents

### Text Alignment & Structure:
- Use horizontal rules (---) to separate major sections
- Keep paragraphs focused and well-spaced
- Use indentation through nested lists when needed`;

      const suggestionInstruction = `

After your main answer, add a section with 2-3 related follow-up questions the user might want to ask.
Format them like this:
---
**Related questions:**
- [First follow-up question]
- [Second follow-up question]
- [Third follow-up question]`;
      
      if (!hasDocuments) {
        // General chat mode - no documents, like ChatGPT
        systemPrompt = `You are ज्ञानकोष (Gyaankosh), a friendly and knowledgeable AI assistant.

You can help with a wide range of topics including:
- Answering general knowledge questions
- Helping with writing, coding, and creative tasks
- Explaining concepts in simple terms
- Providing advice and suggestions
- Having thoughtful conversations
- **Translation between English, Hindi, and Hinglish** - just ask!
- **Paraphrasing and rewriting text**
- **Grammar checking and correction**

Instructions:
- Be helpful, accurate, and engaging
- Respond in the same language as the user's question (Hindi, English, or Hinglish)
- Use proper formatting for professional appearance
- Be conversational and friendly
- If you don't know something, be honest about it
- For Hindi text, always use proper Unicode Devanagari script
${formattingInstruction}
${suggestionInstruction}

Note: The user hasn't uploaded any documents yet. You're acting as a general AI assistant. If they want document-specific help, suggest they upload documents to the knowledge base.`;
      } else if (isGlobalSearch) {
        systemPrompt = `You are ज्ञानकोष (Gyaankosh), a powerful AI assistant that searches across the user's entire knowledge base.

You have access to multiple documents in the knowledge base:
${documentContent}

Instructions:
- Search across ALL documents to find the most relevant information
- Synthesize information from multiple documents when applicable
- Always cite which document(s) you're referencing in your answer
- Be accurate and provide comprehensive answers
- Respond in the same language as the user's question (Hindi, English, or Hinglish)
- If the answer isn't in any document, politely say so
- Keep answers clear, well-structured, and fast to read
- Use proper formatting for professional appearance
- You can also help with translation, paraphrasing, and grammar if asked
${formattingInstruction}
${suggestionInstruction}`;
      } else {
        systemPrompt = `You are ज्ञानकोष (Gyaankosh), a helpful AI assistant specialized in answering questions from documents.
You have access to the following document: "${documentName}"

Document Content:
${documentContent}

Instructions:
- Answer questions ONLY based on the document content provided
- Be accurate and cite relevant parts of the document
- Respond in the same language as the user's question (Hindi, English, or Hinglish)
- If the answer is not in the document, politely say so
- Keep answers clear and concise
- Use proper formatting for professional appearance
- You can also help with translation, paraphrasing, and grammar if asked
${formattingInstruction}
${suggestionInstruction}`;
      }
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
          { role: "system", content: systemPrompt },
          ...userMessages,
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
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
