import React from 'react';

/**
 * Highlights matching text within a string by wrapping matches in a styled span.
 * 
 * @param text - The text to search within
 * @param query - The search query to highlight
 * @param className - Optional className for the highlight span
 * @returns React elements with highlighted matches
 */
export function highlightText(
  text: string,
  query: string,
  className: string = 'bg-primary/30 text-primary-foreground rounded px-0.5'
): React.ReactNode {
  if (!query.trim() || !text) {
    return text;
  }

  // Escape special regex characters in the query
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Create a case-insensitive regex
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  
  // Split text by matches
  const parts = text.split(regex);
  
  if (parts.length === 1) {
    return text;
  }

  return (
    <>
      {parts.map((part, index) => {
        const isMatch = regex.test(part);
        // Reset regex lastIndex after test
        regex.lastIndex = 0;
        
        if (part.toLowerCase() === query.toLowerCase()) {
          return (
            <mark key={index} className={className}>
              {part}
            </mark>
          );
        }
        return part;
      })}
    </>
  );
}

/**
 * Truncates text around the first match of a query, showing context around it.
 * 
 * @param text - The full text
 * @param query - The search query
 * @param contextLength - Characters to show before and after match
 * @returns Truncated text with match in context
 */
export function getMatchContext(
  text: string,
  query: string,
  contextLength: number = 50
): string {
  if (!query.trim() || !text) {
    return text.slice(0, contextLength * 2);
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return text.slice(0, contextLength * 2);
  }

  const start = Math.max(0, matchIndex - contextLength);
  const end = Math.min(text.length, matchIndex + query.length + contextLength);
  
  let result = text.slice(start, end);
  
  if (start > 0) {
    result = '...' + result;
  }
  if (end < text.length) {
    result = result + '...';
  }

  return result;
}
