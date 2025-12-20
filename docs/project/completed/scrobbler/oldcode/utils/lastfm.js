import CryptoJS from 'crypto-js';

export function generateSessionId() {
  return CryptoJS.lib.WordArray.random(16).toString();
}

export function createAuthUrl(apiKey, callbackUrl) {
  const baseUrl = 'https://www.last.fm/api/auth/';
  const params = new URLSearchParams({
    api_key: apiKey,
    cb: callbackUrl
  });
  
  return `${baseUrl}?${params.toString()}`;
}

export function generateApiSig(params, secret) {
  // Remove format and callback parameters for signature
  const sigParams = { ...params };
  delete sigParams.format;
  delete sigParams.callback;
  
  // Sort parameters alphabetically
  const sortedKeys = Object.keys(sigParams).sort();
  
  // Create parameter string
  let paramString = '';
  for (const key of sortedKeys) {
    paramString += key + sigParams[key];
  }
  
  // Append secret and generate MD5 hash
  paramString += secret;
  return CryptoJS.MD5(paramString).toString();
}

export function parseDuration(durationString) {
  if (!durationString) return null;
  
  // Handle formats like "3:45", "03:45", "1:23:45"
  const parts = durationString.split(':').map(p => parseInt(p, 10));
  
  if (parts.length === 2) {
    // MM:SS format
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // HH:MM:SS format
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  
  return null;
} 