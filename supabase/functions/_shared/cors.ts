// Shared CORS configuration with origin validation for security
// Restricts requests to allowed origins instead of wildcard (*)

const ALLOWED_ORIGINS = [
  'https://gyankosh2.lovable.app',
  'https://id-preview--e06349ea-17e0-46c6-9085-c27ba010fefa.lovable.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

export function getCorsHeaders(origin: string | null): Record<string, string> {
  // Check if origin is in allowed list, default to first allowed origin if not
  const allowedOrigin = origin && ALLOWED_ORIGINS.some(allowed => 
    origin === allowed || origin.endsWith('.lovable.app')
  ) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

export function handleCorsPreFlight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.get('origin');
    return new Response(null, { headers: getCorsHeaders(origin) });
  }
  return null;
}

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true; // Allow requests without origin header (non-browser)
  return ALLOWED_ORIGINS.some(allowed => 
    origin === allowed || origin.endsWith('.lovable.app')
  );
}
