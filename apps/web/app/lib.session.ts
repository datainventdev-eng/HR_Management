export type AppRole = 'employee' | 'manager' | 'hr_admin';

export type SessionData = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: AppRole;
    employeeId?: string | null;
    mustChangePassword?: boolean;
  };
};

const KEY = 'hr_session';

export function getSession(): SessionData | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export function setSession(session: SessionData) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
}

export function defaultRouteForRole(role: AppRole) {
  return role === 'employee' ? '/employee' : '/';
}
