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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, documentId, text, query } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Generate searchable keywords using AI
    async function generateSearchKeywords(inputText: string): Promise<string[]> {
      console.log("Generating search keywords for text length:", inputText.length);
      
      const truncatedText = inputText.slice(0, 4000);
      
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
              content: `Extract 10-20 important keywords and phrases from this document for search indexing.
Return ONLY a JSON array of strings, no other text. Example: ["keyword1", "keyword2", "phrase one"]
Include: key terms, names, dates, concepts, topics, technical terms.
Keywords should be in the same language as the document.`
            },
            {
              role: "user",
              content: truncatedText
            }
          ],
        }),
      });

      if (!response.ok) {
        console.error("Keyword extraction failed:", await response.text());
        return [];
      }

      const result = await response.json();
      const aiResponse = result.choices?.[0]?.message?.content || "[]";
      
      try {
        const jsonMatch = aiResponse.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error("Failed to parse keywords:", e);
      }
      
      return [];
    }

    // Generate tags and category using AI
    async function generateTagsAndCategory(content: string): Promise<{ tags: string[], category: string }> {
      console.log("Generating tags and category...");
      
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
              content: `You are a document classification expert. Analyze the document and provide:
1. A category (one of: Legal, Financial, Academic, Technical, Medical, Government, Identity, Business, Personal, Educational, Research, Report, Contract, Policy, Manual, Other)
2. 3-6 relevant tags that describe the document's content, topics, and key themes

Respond ONLY with valid JSON in this exact format:
{"category": "Category Name", "tags": ["tag1", "tag2", "tag3"]}

Tags should be:
- Lowercase
- Single words or short phrases (2-3 words max)
- Descriptive and searchable
- In the same language as the document (Hindi tags for Hindi documents)`
            },
            {
              role: "user",
              content: `Classify this document:\n\n${content.slice(0, 4000)}`
            }
          ],
        }),
      });

      if (!response.ok) {
        console.error("Classification failed:", await response.text());
        return { tags: [], category: "Other" };
      }

      const result = await response.json();
      const aiResponse = result.choices?.[0]?.message?.content || "";
      
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            category: parsed.category || "Other",
            tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6) : []
          };
        }
      } catch (e) {
        console.error("Failed to parse classification:", e);
      }
      
      return { tags: [], category: "Other" };
    }

    if (action === "embed_document" && documentId) {
      // Fetch document content
      const { data: doc, error: docError } = await supabaseClient
        .from("documents")
        .select("content_text, name, alias")
        .eq("id", documentId)
        .single();

      if (docError || !doc?.content_text) {
        throw new Error("Document not found or empty");
      }

      // Generate keywords and classification in parallel
      const [keywords, classification] = await Promise.all([
        generateSearchKeywords(doc.content_text),
        generateTagsAndCategory(doc.content_text)
      ]);

      // Combine tags with extracted keywords (deduplicated)
      const allTags = [...new Set([...classification.tags, ...keywords.slice(0, 10)])];

      // Update document with tags and category (no embedding since not supported)
      const { error: updateError } = await supabaseClient
        .from("documents")
        .update({
          tags: allTags,
          category: classification.category
        })
        .eq("id", documentId);

      if (updateError) {
        console.error("Update error:", updateError);
        throw new Error("Failed to update document");
      }

      console.log(`Document ${documentId} classified with ${allTags.length} tags`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          tags: allTags,
          category: classification.category
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "search" && query) {
      const userId = claimsData.claims.sub;

      // Try PostgreSQL full-text search first using the new FTS function
      let results: any[] = [];
      let searchError = null;

      try {
        const { data: ftsResults, error: ftsError } = await supabaseClient
          .rpc("search_documents_fts", {
            search_query: query,
            filter_user_id: userId
          });

        if (!ftsError && ftsResults && ftsResults.length > 0) {
          results = ftsResults;
          console.log(`FTS found ${results.length} documents`);
        } else {
          // Fallback to ILIKE search if FTS returns no results
          const { data: fallbackResults, error: fallbackError } = await supabaseClient
            .from("documents")
            .select("id, name, alias, content_text, tags, category, summary")
            .eq("user_id", userId)
            .or(`content_text.ilike.%${query}%,alias.ilike.%${query}%,name.ilike.%${query}%`)
            .limit(10);

          if (fallbackError) {
            searchError = fallbackError;
          } else {
            results = (fallbackResults || []).map(doc => ({
              ...doc,
              rank: 0.5
            }));
            console.log(`Fallback search found ${results.length} documents`);
          }
        }
      } catch (e) {
        console.error("FTS error, falling back:", e);
        // Fallback search
        const { data: fallbackResults, error: fallbackError } = await supabaseClient
          .from("documents")
          .select("id, name, alias, content_text, tags, category, summary")
          .eq("user_id", userId)
          .or(`content_text.ilike.%${query}%,alias.ilike.%${query}%,name.ilike.%${query}%`)
          .limit(10);

        if (fallbackError) {
          searchError = fallbackError;
        } else {
          results = (fallbackResults || []).map(doc => ({
            ...doc,
            rank: 0.5
          }));
        }
      }

      if (searchError) {
        console.error("Search error:", searchError);
        throw new Error("Search failed");
      }

      // Format results to match expected structure
      const formattedResults = results.map(doc => ({
        id: doc.id,
        name: doc.name,
        alias: doc.alias,
        content_text: doc.content_text?.slice(0, 500),
        tags: doc.tags,
        category: doc.category,
        similarity: doc.rank || 1
      }));

      console.log(`Returning ${formattedResults.length} search results`);

      return new Response(
        JSON.stringify({ success: true, results: formattedResults }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Embedding error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
