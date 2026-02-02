/**
 * Kruti Dev ↔ Unicode Hindi Converter
 * Provides conversion between Kruti Dev (legacy ASCII-based Hindi font) and Unicode Devanagari
 */

// Kruti Dev to Unicode mapping (carefully deduplicated)
const krutiToUnicodeMap: Record<string, string> = {
  // Vowels
  'v': 'अ', 'vk': 'आ', 'b': 'इ', 'bZ': 'ई', 'm': 'उ', 'Å': 'ऊ',
  '_': 'ऋ', '`': 'ए', '~': 'ऐ', 'vks': 'ओ', 'vkS': 'औ', 'va': 'अं', 'v%': 'अः',
  
  // Consonants
  'd': 'क', '[k': 'ख', 'x': 'ग', '?k': 'घ', '³': 'ङ',
  'p': 'च', 'N': 'छ', 't': 'ज', '÷': 'झ', '×': 'ञ',
  'V': 'ट', 'B': 'ठ', 'M': 'ड', '<': 'ढ', '.k': 'ण',
  'r': 'त', 'Fk': 'थ', 'n': 'द', '/': 'ध', 'u': 'न',
  'i': 'प', 'Q': 'फ', 'c': 'ब', 'Hk': 'भ', 'e': 'म',
  ';': 'य', 'j': 'र', 'y': 'ल', 'o': 'व',
  "'k": 'श', '"k': 'ष', 'l': 'स', 'g': 'ह',
  
  // Conjuncts
  '{': 'क्ष', '=': 'त्र', 'K': 'ज्ञ',
  
  // Matras (vowel signs)
  'k': 'ा', 'h': 'ी', 'q': 'ु', 'w': 'ू', '^': 'े', 'S': 'ै',
  'ks': 'ो', 'kS': 'ौ', 'a': 'ं', '%': 'ः', 'z': '्',
  
  // Numbers
  '0': '०', '1': '१', '2': '२', '3': '३', '4': '४',
  '5': '५', '6': '६', '7': '७', '8': '८', '9': '९',
  
  // Punctuation
  '|': '।', '||': '॥',
  
  // Whitespace preservation
  ' ': ' ', '\n': '\n', '\t': '\t',
};

// Unicode to Kruti Dev mapping (reverse)
const unicodeToKrutiMap: Record<string, string> = {
  // Vowels
  'अ': 'v', 'आ': 'vk', 'इ': 'b', 'ई': 'bZ', 'उ': 'm', 'ऊ': 'Å',
  'ऋ': '_', 'ए': '`', 'ऐ': '~', 'ओ': 'vks', 'औ': 'vkS', 'अं': 'va', 'अः': 'v%',
  
  // Consonants
  'क': 'd', 'ख': '[k', 'ग': 'x', 'घ': '?k', 'ङ': '³',
  'च': 'p', 'छ': 'N', 'ज': 't', 'झ': '÷', 'ञ': '×',
  'ट': 'V', 'ठ': 'B', 'ड': 'M', 'ढ': '<', 'ण': '.k',
  'त': 'r', 'थ': 'Fk', 'द': 'n', 'ध': '/', 'न': 'u',
  'प': 'i', 'फ': 'Q', 'ब': 'c', 'भ': 'Hk', 'म': 'e',
  'य': ';', 'र': 'j', 'ल': 'y', 'व': 'o',
  'श': "'k", 'ष': '"k', 'स': 'l', 'ह': 'g',
  
  // Conjuncts
  'क्ष': '{', 'त्र': '=', 'ज्ञ': 'K',
  
  // Matras
  'ा': 'k', 'ी': 'h', 'ु': 'q', 'ू': 'w', 'े': '^', 'ै': 'S',
  'ो': 'ks', 'ौ': 'kS', 'ं': 'a', 'ः': '%', '्': 'z',
  
  // Numbers
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
  
  // Punctuation
  '।': '|', '॥': '||',
};

// Extended character mappings for complex conjuncts
const complexKrutiPatterns: [RegExp, string][] = [
  [/D;k/g, 'क्या'],
  [/D;/g, 'क्य'],
  [/Ø/g, 'क्र'],
  [/Ák/g, 'प्र'],
  [/Áz/g, 'प्र्'],
  [/J/g, 'श्र'],
  [/ñ/g, 'ह्र'],
  [/æ/g, 'द्र'],
  [/ð/g, 'द्व'],
  [/f'k/g, 'शि'],
  [/f"k/g, 'षि'],
  [/fØ/g, 'क्रि'],
  [/Ír/g, 'त्त'],
  [/ÍV/g, 'ट्ट'],
  [/í/g, 'द्द'],
  [/ê/g, 'न्न'],
  [/ë/g, 'प्प'],
  [/ì/g, 'म्म'],
  [/î/g, 'य्य'],
  [/ï/g, 'ल्ल'],
  [/fê/g, 'न्नि'],
];

const complexUnicodePatterns: [RegExp, string][] = [
  [/क्या/g, 'D;k'],
  [/क्य/g, 'D;'],
  [/क्र/g, 'Ø'],
  [/प्र/g, 'Ák'],
  [/श्र/g, 'J'],
  [/ह्र/g, 'ñ'],
  [/द्र/g, 'æ'],
  [/द्व/g, 'ð'],
  [/शि/g, 'f\'k'],
  [/षि/g, 'f"k'],
  [/त्त/g, 'Ír'],
  [/द्द/g, 'í'],
  [/न्न/g, 'ê'],
  [/प्प/g, 'ë'],
  [/म्म/g, 'ì'],
  [/य्य/g, 'î'],
  [/ल्ल/g, 'ï'],
];

/**
 * Convert Kruti Dev text to Unicode Hindi
 */
export function krutiToUnicode(text: string): string {
  if (!text) return '';
  
  let result = text;
  
  // Apply complex patterns first
  for (const [pattern, replacement] of complexKrutiPatterns) {
    result = result.replace(pattern, replacement);
  }
  
  // Sort keys by length (longest first) for proper matching
  const sortedKeys = Object.keys(krutiToUnicodeMap).sort((a, b) => b.length - a.length);
  
  for (const key of sortedKeys) {
    const regex = new RegExp(escapeRegex(key), 'g');
    result = result.replace(regex, krutiToUnicodeMap[key]);
  }
  
  return result;
}

/**
 * Convert Unicode Hindi to Kruti Dev
 */
export function unicodeToKruti(text: string): string {
  if (!text) return '';
  
  let result = text;
  
  // Apply complex patterns first
  for (const [pattern, replacement] of complexUnicodePatterns) {
    result = result.replace(pattern, replacement);
  }
  
  // Sort keys by length (longest first) for proper matching
  const sortedKeys = Object.keys(unicodeToKrutiMap).sort((a, b) => b.length - a.length);
  
  for (const key of sortedKeys) {
    const regex = new RegExp(escapeRegex(key), 'g');
    result = result.replace(regex, unicodeToKrutiMap[key]);
  }
  
  return result;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detect if text is likely Kruti Dev encoded
 */
export function isLikelyKrutiDev(text: string): boolean {
  if (!text) return false;
  
  // If has Unicode Hindi characters, it's not Kruti Dev
  const unicodeHindiRange = /[\u0900-\u097F]/;
  if (unicodeHindiRange.test(text)) return false;
  
  // Check if text contains common English words - if yes, it's likely English, not Kruti Dev
  const commonEnglishWords = /\b(the|is|are|was|were|have|has|had|to|of|and|or|but|in|on|at|for|with|by|from|as|an|a|this|that|these|those|it|they|we|you|he|she|system|decision|judgment|built|simply|replaceable|imreplaceble|imreplaceable)\b/i;
  if (commonEnglishWords.test(text)) {
    return false; // Contains English words, not Kruti Dev
  }
  
  // Check for Kruti Dev specific multi-character sequences
  // These are characteristic patterns that appear in Kruti Dev but not normal English
  const krutiDevSequences = [
    /vk[ksS]/,            // आक/आख/आग patterns (आ + consonant)
    /bZ/,                 // ई (specific pattern)
    /[vVbBmM_`~][ksS]/,  // Vowel + matra combinations
    /[dk]h/,              // क/ख with ई matra
    /[xp]k/,              // ग/घ with आ matra  
    /Fk/,                 // थ
    /Hk/,                 // भ
    /\.k/,                // ण
    /\[k\]/,              // ख (bracketed)
    /'k/,                 // श
    /"k/,                 // ष
    /D;k/,                // क्या
    /D;/,                 // क्य
    /Ø/,                  // क्र
    /Á[zk]/,              // प्र
    /J/,                  // श्र
    /ñ/,                  // ह्र
    /æ/,                  // द्र
    /ð/,                  // द्व
    /Ír/,                 // त्त
    /ÍV/,                 // ट्ट
    /í/,                  // द्द
    /ê/,                  // न्न
    /ë/,                  // प्प
    /ì/,                  // म्म
    /î/,                  // य्य
    /ï/,                  // ल्ल
  ];
  
  // Count distinct Kruti Dev sequences found
  let krutiSequenceCount = 0;
  for (const pattern of krutiDevSequences) {
    if (pattern.test(text)) {
      krutiSequenceCount++;
    }
  }
  
  // Require at least 2 distinct Kruti Dev sequences to be confident
  // This prevents false positives from English text that happens to contain
  // individual letters that match single-character patterns
  return krutiSequenceCount >= 2;
}

/**
 * Smart convert - auto-detect and convert
 */
export function smartConvert(text: string): { result: string; wasKruti: boolean } {
  const wasKruti = isLikelyKrutiDev(text);
  return {
    result: wasKruti ? krutiToUnicode(text) : text,
    wasKruti,
  };
}
