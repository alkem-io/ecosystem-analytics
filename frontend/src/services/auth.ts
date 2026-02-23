/**
 * Frontend auth service — manages the Alkemio-issued JWT in memory.
 * The token is NEVER persisted to localStorage, sessionStorage, or cookies (TR-015).
 *
 * Authentication flow:
 * 1. Frontend opens a popup to the Alkemio Kratos login page
 * 2. User authenticates (password or OIDC) in the popup
 * 3. Popup obtains a tokenized JWT via /sessions/whoami?tokenize_as=...
 * 4. Popup sends JWT to parent via postMessage
 * 5. Frontend stores JWT in memory, sends as Bearer to BFF
 */

let bearerToken: string | null = null;

/** Store the token in memory */
export function setToken(token: string): void {
  bearerToken = token;
}

/** Get the current token (null if not authenticated) */
export function getToken(): string | null {
  return bearerToken;
}

/** Clear the token (logout) */
export function clearToken(): void {
  bearerToken = null;
}

/** Check if the user is authenticated */
export function isAuthenticated(): boolean {
  return bearerToken !== null;
}

/** The expected message shape from the auth popup */
interface AuthPopupMessage {
  type: 'alkemio-auth-success';
  token: string;
}

function isAuthMessage(data: unknown): data is AuthPopupMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as AuthPopupMessage).type === 'alkemio-auth-success' &&
    typeof (data as AuthPopupMessage).token === 'string'
  );
}

/**
 * Open a popup to the Alkemio Kratos login page and wait for the JWT token.
 * Returns the JWT on success, or throws on failure/cancellation.
 */
export function openAuthPopup(alkemioUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const loginUrl = `${alkemioUrl}/login?returnUrl=${encodeURIComponent(`${alkemioUrl}/auth/callback-popup`)}`;

    const width = 500;
    const height = 700;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;

    const popup = window.open(
      loginUrl,
      'alkemio-auth',
      `width=${width},height=${height},left=${left},top=${top},popup=yes`,
    );

    if (!popup) {
      reject(new Error('Popup was blocked. Please allow popups for this site.'));
      return;
    }

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(pollTimer);
    };

    const onMessage = (event: MessageEvent) => {
      // Validate origin matches the Alkemio URL
      if (event.origin !== new URL(alkemioUrl).origin) return;

      if (isAuthMessage(event.data)) {
        cleanup();
        popup.close();
        resolve(event.data.token);
      }
    };

    window.addEventListener('message', onMessage);

    // Poll to detect if popup was closed without completing auth
    const pollTimer = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('Authentication was cancelled'));
      }
    }, 500);
  });
}
