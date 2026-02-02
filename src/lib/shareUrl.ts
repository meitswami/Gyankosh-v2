/**
 * Get the correct base URL for share links.
 * In production, uses the published domain. In development/preview, uses current origin.
 */
export function getShareBaseUrl(): string {
  const publishedUrl = 'https://genxai-gyankosh.lovable.app';
  
  // Check if we're on the published domain or localhost
  const currentOrigin = window.location.origin;
  
  // If we're on localhost or a preview URL, still generate links for the published domain
  // so shared links always work on the production site
  if (currentOrigin.includes('localhost') || 
      currentOrigin.includes('preview--') ||
      currentOrigin.includes('-preview--')) {
    return publishedUrl;
  }
  
  // If already on production, use current origin
  return currentOrigin;
}

/**
 * Generate a full share URL for a chat
 */
export function getChatShareUrl(token: string): string {
  return `${getShareBaseUrl()}/shared/chat/${token}`;
}

/**
 * Generate a full share URL for a document
 */
export function getDocumentShareUrl(token: string): string {
  return `${getShareBaseUrl()}/shared/doc/${token}`;
}
