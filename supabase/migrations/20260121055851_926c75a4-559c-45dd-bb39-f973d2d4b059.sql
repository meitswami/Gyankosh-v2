-- Enable the pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Add tags column to documents table
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Add category column for AI-generated categorization
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS category text;

-- Add embedding column for semantic search (1536 dimensions for text-embedding-3-small)
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS embedding extensions.vector(1536);

-- Create index for faster similarity search
CREATE INDEX IF NOT EXISTS documents_embedding_idx 
ON public.documents 
USING ivfflat (embedding extensions.vector_cosine_ops)
WITH (lists = 100);

-- Create index for tags array search
CREATE INDEX IF NOT EXISTS documents_tags_idx 
ON public.documents 
USING GIN (tags);

-- Create function for semantic search
CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding extensions.vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  alias text,
  content_text text,
  tags text[],
  category text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.name,
    d.alias,
    d.content_text,
    d.tags,
    d.category,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM public.documents d
  WHERE 
    d.embedding IS NOT NULL
    AND (filter_user_id IS NULL OR d.user_id = filter_user_id)
    AND 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;