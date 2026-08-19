const BACKEND_URL = import.meta.env.VITE_BACKEND_URL !== undefined
  ? import.meta.env.VITE_BACKEND_URL
  : (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:3001`);

/**
 * Fetch wrapper that auto-attaches JWT token to all requests.
 */
export async function apiFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = localStorage.getItem('collab-lens-token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers
  });
}
