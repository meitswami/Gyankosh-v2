import { supabase } from '@/integrations/supabase/client';
import { encryptMessage, getPrivateKey, decryptMessage } from './encryption';

// Encrypt and upload a file for chat
export async function uploadEncryptedFile(
  file: File,
  recipientPublicKey: string,
  senderId: string
): Promise<{
  fileUrl: string;
  encryptedFileKey: string;
  iv: string;
  fileName: string;
  fileSize: number;
  fileType: string;
} | null> {
  try {
    // Read file as ArrayBuffer
    const fileBuffer = await file.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);
    
    // Convert to base64 for encryption
    const base64File = btoa(String.fromCharCode(...fileBytes));
    
    // Encrypt the file content
    const { encryptedContent, iv, encryptedKey } = await encryptMessage(
      base64File,
      recipientPublicKey
    );
    
    // Create a blob from encrypted content
    const encryptedBlob = new Blob([encryptedContent], { type: 'application/encrypted' });
    
    // Upload to Supabase storage
    const filePath = `${senderId}/${Date.now()}_${file.name}.encrypted`;
    const { error: uploadError } = await supabase.storage
      .from('chat-files')
      .upload(filePath, encryptedBlob);
    
    if (uploadError) throw uploadError;
    
    // Get the URL (private bucket, so we need signed URL)
    const { data: urlData } = await supabase.storage
      .from('chat-files')
      .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days
    
    return {
      fileUrl: urlData?.signedUrl || filePath,
      encryptedFileKey: encryptedKey,
      iv,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    };
  } catch (error) {
    console.error('Error uploading encrypted file:', error);
    return null;
  }
}

// Download and decrypt a file
export async function downloadDecryptedFile(
  fileUrl: string,
  iv: string,
  encryptedFileKey: string,
  userId: string,
  fileName: string,
  fileType: string
): Promise<boolean> {
  try {
    // Get private key
    const privateKey = await getPrivateKey(userId);
    if (!privateKey) throw new Error('No private key found');
    
    // Fetch encrypted file
    const response = await fetch(fileUrl);
    const encryptedContent = await response.text();
    
    // Decrypt the file content
    const decryptedBase64 = await decryptMessage(
      encryptedContent,
      iv,
      encryptedFileKey,
      privateKey
    );
    
    // Convert base64 back to binary
    const binaryString = atob(decryptedBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Create blob and download
    const blob = new Blob([bytes], { type: fileType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return true;
  } catch (error) {
    console.error('Error downloading decrypted file:', error);
    return false;
  }
}

// Get file icon based on type
export function getFileIcon(fileType: string): string {
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType.startsWith('video/')) return '🎥';
  if (fileType.startsWith('audio/')) return '🎵';
  if (fileType.includes('pdf')) return '📄';
  if (fileType.includes('word') || fileType.includes('document')) return '📝';
  if (fileType.includes('sheet') || fileType.includes('excel')) return '📊';
  if (fileType.includes('presentation') || fileType.includes('powerpoint')) return '📽️';
  if (fileType.includes('zip') || fileType.includes('archive')) return '📦';
  return '📎';
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}
