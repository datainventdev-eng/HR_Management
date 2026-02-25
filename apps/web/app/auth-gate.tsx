'use client';

import { usePathname, useRouter } from 'next/navigation';
import { PropsWithChildren, useEffect, useState } from 'react';
import { clearSession, defaultRouteForRole, getSession, setSession, SessionData } from './lib.session';

const PUBLIC_ROUTES = ['/login'];
const EMPLOYEE_ALLOWED_ROUTES = ['/employee', '/attendance-time', '/timesheets', '/leave-management', '/wfh', '/payroll', '/change-password', '/settings'];
const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function AuthGate({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function parsePayload(response: Response) {
      const raw = await response.text();
      if (!raw) return {} as any;
      try {
        return JSON.parse(raw) as any;
      } catch {
        return { message: raw } as any;
      }
    }

    async function hydrateSession(session: SessionData) {
      const meResponse = await fetch(`${apiBase}/auth/me`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      });

      if (meResponse.ok) {
        const mePayload = await parsePayload(meResponse);
        const next = { ...session, user: { ...session.user, ...mePayload } };
        setSession(next);
        return next;
      }

      if (meResponse.status !== 401 || !session.refreshToken) {
        clearSession();
        return null;
      }

      const refreshResponse = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      if (!refreshResponse.ok) {
        clearSession();
        return null;
      }

      const refreshedSession = (await parsePayload(refreshResponse)) as SessionData;
      if (!refreshedSession?.accessToken || !refreshedSession?.refreshToken || !refreshedSession?.user) {
        clearSession();
        return null;
      }

      setSession(refreshedSession);
      return refreshedSession;
    }

    async function run() {
      const existing = getSession();
      const hydrated = existing ? await hydrateSession(existing) : null;
      if (cancelled) return;

      if (PUBLIC_ROUTES.includes(pathname)) {
        if (hydrated) {
          if (hydrated.user.mustChangePassword) {
            router.replace('/change-password');
          } else {
            router.replace(defaultRouteForRole(hydrated.user.role));
          }
          return;
        }
        setReady(true);
        return;
      }

      if (!hydrated) {
        router.replace('/login');
        return;
      }

      if (hydrated.user.mustChangePassword && pathname !== '/change-password') {
        router.replace('/change-password');
        return;
      }

      if (!hydrated.user.mustChangePassword && pathname === '/change-password') {
        router.replace(defaultRouteForRole(hydrated.user.role));
        return;
      }

      if (hydrated.user.role === 'employee' && !EMPLOYEE_ALLOWED_ROUTES.includes(pathname)) {
        router.replace('/employee');
        return;
      }

      if (hydrated.user.role !== 'hr_admin' && pathname === '/admin-users') {
        router.replace(defaultRouteForRole(hydrated.user.role));
        return;
      }

      setReady(true);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!ready) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  return <>{children}</>;
}
