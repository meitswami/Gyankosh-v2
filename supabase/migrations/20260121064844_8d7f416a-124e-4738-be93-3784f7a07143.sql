-- Add tsvector column for full-text search
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_documents_search_vector 
ON public.documents USING GIN(search_vector);

-- Create function to update search vector
CREATE OR REPLACE FUNCTION public.update_document_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.alias, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.content_text, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger to auto-update search vector
DROP TRIGGER IF EXISTS trigger_update_document_search_vector ON public.documents;
CREATE TRIGGER trigger_update_document_search_vector
BEFORE INSERT OR UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.update_document_search_vector();

-- Update existing documents to populate search_vector
UPDATE public.documents SET updated_at = now() WHERE search_vector IS NULL;

-- Create full-text search function
CREATE OR REPLACE FUNCTION public.search_documents_fts(
  search_query text,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name text,
  alias text,
  content_text text,
  tags text[],
  category text,
  summary text,
  rank real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    d.summary,
    ts_rank(d.search_vector, plainto_tsquery('english', search_query)) AS rank
  FROM public.documents d
  WHERE 
    d.search_vector @@ plainto_tsquery('english', search_query)
    AND (filter_user_id IS NULL OR d.user_id = filter_user_id)
  ORDER BY rank DESC
  LIMIT 10;
END;
$$;