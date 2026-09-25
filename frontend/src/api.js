const API_BASE = import.meta.env.VITE_API_BASE || '';

let unauthorizedHandler = null;

export function setOnUnauthorized(handler) {
  unauthorizedHandler = handler;
}

export function getAuthToken() {
  return (
    localStorage.getItem('gym_ai_token') ||
    sessionStorage.getItem('gym_ai_token') ||
    ''
  );
}

export function setAuthToken(token, rememberMe = true) {
  localStorage.removeItem('gym_ai_token');
  sessionStorage.removeItem('gym_ai_token');
  if (token) {
    if (rememberMe) {
      localStorage.setItem('gym_ai_token', token);
    } else {
      sessionStorage.setItem('gym_ai_token', token);
    }
  }
}

export function clearAuthToken() {
  localStorage.removeItem('gym_ai_token');
  sessionStorage.removeItem('gym_ai_token');
}

export async function apiFetch(path, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (
      response.status === 401 &&
      !path.includes('/api/auth/login') &&
      !path.includes('/api/auth/register')
    ) {
      clearAuthToken();
      if (unauthorizedHandler) {
        unauthorizedHandler();
      }
    }
    throw new Error(data.detail || data.message || `API Error (${response.status})`);
  }
  return data;
}
