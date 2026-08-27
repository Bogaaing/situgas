let idToken: string | null = null;

export function setIdToken(token: string | null) {
  idToken = token;
}

export function getIdToken() {
  return idToken;
}

export async function apiRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (idToken) {
    headers.set('Authorization', `Bearer ${idToken}`);
  }
  if (options.body && !(options.body instanceof FormData) && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errText = await res.text();
    let errJson: any;
    try {
      errJson = JSON.parse(errText);
    } catch {}
    throw new Error(errJson?.error || errText || 'API Request failed');
  }

  return res.json();
}
