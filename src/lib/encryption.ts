// Web Crypto API based E2E encryption for secure messaging

// Generate a new key pair for a user
export async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: arrayBufferToBase64(publicKeyBuffer),
    privateKey: arrayBufferToBase64(privateKeyBuffer),
  };
}

// Import a public key from base64 string
export async function importPublicKey(publicKeyBase64: string): Promise<CryptoKey> {
  const keyBuffer = base64ToArrayBuffer(publicKeyBase64);
  return window.crypto.subtle.importKey(
    'spki',
    keyBuffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
}

// Import a private key from base64 string
export async function importPrivateKey(privateKeyBase64: string): Promise<CryptoKey> {
  const keyBuffer = base64ToArrayBuffer(privateKeyBase64);
  return window.crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );
}

// Generate a symmetric AES key for message encryption
async function generateAESKey(): Promise<CryptoKey> {
  return window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// Encrypt a message using hybrid encryption (RSA + AES)
export async function encryptMessage(
  message: string,
  recipientPublicKey: string
): Promise<{ encryptedContent: string; iv: string; encryptedKey: string }> {
  // Generate a random AES key for this message
  const aesKey = await generateAESKey();
  
  // Generate random IV
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt the message with AES
  const encoder = new TextEncoder();
  const messageBuffer = encoder.encode(message);
  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    messageBuffer
  );

  // Export the AES key
  const aesKeyBuffer = await window.crypto.subtle.exportKey('raw', aesKey);
  
  // Encrypt the AES key with the recipient's RSA public key
  const publicKey = await importPublicKey(recipientPublicKey);
  const encryptedKey = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    aesKeyBuffer
  );

  return {
    encryptedContent: arrayBufferToBase64(encryptedContent),
    iv: arrayBufferToBase64(iv.buffer),
    encryptedKey: arrayBufferToBase64(encryptedKey),
  };
}

// Decrypt a message using hybrid decryption
export async function decryptMessage(
  encryptedContent: string,
  iv: string,
  encryptedKey: string,
  privateKey: string
): Promise<string> {
  // Import private key
  const privateKeyObj = await importPrivateKey(privateKey);
  
  // Decrypt the AES key
  const encryptedKeyBuffer = base64ToArrayBuffer(encryptedKey);
  const aesKeyBuffer = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKeyObj,
    encryptedKeyBuffer
  );

  // Import the AES key
  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    aesKeyBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // Decrypt the message
  const ivBuffer = base64ToArrayBuffer(iv);
  const contentBuffer = base64ToArrayBuffer(encryptedContent);
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
    aesKey,
    contentBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// ============ GROUP CHAT ENCRYPTION ============

// Generate a symmetric key for group encryption (as base64 string)
export async function generateGroupKey(): Promise<string> {
  const key = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const exported = await window.crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64(exported);
}

// Encrypt group key for a member using their public key
export async function encryptGroupKey(groupKey: string, publicKeyBase64: string): Promise<string> {
  const publicKey = await importPublicKey(publicKeyBase64);
  const keyBuffer = base64ToArrayBuffer(groupKey);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    keyBuffer
  );
  return arrayBufferToBase64(encrypted);
}

// Decrypt group key using private key
export async function decryptGroupKey(encryptedKey: string, privateKeyBase64: string): Promise<string> {
  const privateKey = await importPrivateKey(privateKeyBase64);
  const encryptedBuffer = base64ToArrayBuffer(encryptedKey);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encryptedBuffer
  );
  return arrayBufferToBase64(decrypted);
}

// Encrypt message with group symmetric key
export async function encryptWithGroupKey(
  message: string,
  groupKeyBase64: string
): Promise<{ encryptedContent: string; iv: string }> {
  const keyBuffer = base64ToArrayBuffer(groupKeyBase64);
  const key = await window.crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(message)
  );
  
  return {
    encryptedContent: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

// Decrypt message with group symmetric key
export async function decryptWithGroupKey(
  encryptedContent: string,
  iv: string,
  groupKeyBase64: string
): Promise<string> {
  const keyBuffer = base64ToArrayBuffer(groupKeyBase64);
  const key = await window.crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const ivBuffer = base64ToArrayBuffer(iv);
  const contentBuffer = base64ToArrayBuffer(encryptedContent);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
    key,
    contentBuffer
  );
  
  return new TextDecoder().decode(decrypted);
}

// ============ HELPER FUNCTIONS ============

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Store private key securely in IndexedDB
const DB_NAME = 'gyaankosh_keys';
const STORE_NAME = 'private_keys';

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
  });
}

export async function storePrivateKey(userId: string, privateKey: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ id: userId, privateKey });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPrivateKey(userId: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(userId);
    request.onsuccess = () => resolve(request.result?.privateKey || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deletePrivateKey(userId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(userId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
