// Browser-compatible document text extraction
// For proper PDF/DOCX/Image parsing, we use the edge function with OCR

export async function extractTextFromFile(file: File): Promise<string> {
  const fileName = file.name.toLowerCase();
  const fileType = file.type || '';
  
  // Plain text files - read directly
  if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
    return await file.text();
  }
  
  // Images need OCR via server
  if (isImageFile(fileName, fileType)) {
    return 'REQUIRES_SERVER_PARSING';
  }
  
  // For PDF and DOCX, use server-side parsing with AI
  if (fileName.endsWith('.pdf') || fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
    return 'REQUIRES_SERVER_PARSING';
  }
  
  // Try to read as text for unknown formats
  try {
    const text = await file.text();
    if (text && text.length > 20 && isPrintableText(text)) {
      return text;
    }
    return 'REQUIRES_SERVER_PARSING';
  } catch {
    return 'REQUIRES_SERVER_PARSING';
  }
}

function isImageFile(fileName: string, fileType: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];
  const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'];
  
  return imageExtensions.some(ext => fileName.endsWith(ext)) || imageTypes.includes(fileType);
}

export function isVideoFile(fileName: string, fileType: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.wmv', '.flv'];
  const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
  
  return videoExtensions.some(ext => fileName.endsWith(ext)) || videoTypes.includes(fileType);
}

function isPrintableText(text: string): boolean {
  // Check if the text is mostly printable characters
  const printable = text.replace(/[^\x20-\x7E\u0900-\u097F\s]/g, '');
  return printable.length > text.length * 0.8;
}

export function getFileIcon(fileType: string): string {
  if (fileType.includes('pdf')) return '📕';
  if (fileType.includes('word') || fileType.includes('doc')) return '📘';
  if (fileType.includes('text')) return '📄';
  if (fileType.includes('image')) return '🖼️';
  if (fileType.includes('video')) return '🎬';
  return '📁';
}

export function getSupportedFileTypes(): string {
  return '.pdf,.docx,.doc,.txt,.md,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff,.tif,.mp4,.webm,.mov,.avi,.mkv';
}

export function getSupportedFileTypesLabel(): string {
  return 'PDF, DOCX, Images, Videos';
}
