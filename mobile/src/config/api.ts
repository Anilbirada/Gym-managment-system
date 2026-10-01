/**
 * RSR Gym Mobile App - Centralized API Configuration
 * 
 * Secure, environment-driven configuration for backend connectivity.
 * Avoids any hardcoded temporary tunnel URLs.
 */

export const PRODUCTION_API_URL = 'https://web-production-d4ccc.up.railway.app/api';
export const LOCAL_DEV_API_URL = 'http://192.168.1.5:4000/api';

// Reads from EXPO_PUBLIC_API_URL (configured via .env or eas.json)
// with a safe fallback to the live Railway production endpoint.
const rawApiUrl = process.env.EXPO_PUBLIC_API_URL;

export const API_URL = rawApiUrl && rawApiUrl.trim().length > 0
  ? rawApiUrl.trim()
  : PRODUCTION_API_URL;

export default API_URL;

