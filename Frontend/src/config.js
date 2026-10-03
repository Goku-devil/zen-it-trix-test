// Centralized Frontend API Configuration
// Strips any trailing slashes and ensures the '/api' prefix is consistently appended.
const rawUrl = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').trim().replace(/\/+$/, '')
export const API_URL = rawUrl.endsWith('/api') ? rawUrl : `${rawUrl}/api`
