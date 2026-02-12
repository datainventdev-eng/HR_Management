'use client';

import { usePathname, useRouter } from 'next/navigation';
import { PropsWithChildren, useEffect, useState } from 'react';
import { defaultRouteForRole, getSession } from './lib.session';

const PUBLIC_ROUTES = ['/login'];

export default function AuthGate({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const session = getSession();

    if (PUBLIC_ROUTES.includes(pathname)) {
      if (session) {
        if (session.user.mustChangePassword) {
          router.replace('/change-password');
        } else {
          router.replace(defaultRouteForRole(session.user.role));
        }
        return;
      }
      setReady(true);
      return;
    }

    if (!session) {
      router.replace('/login');
      return;
    }

    if (session.user.mustChangePassword && pathname !== '/change-password') {
      router.replace('/change-password');
      return;
    }

    if (!session.user.mustChangePassword && pathname === '/change-password') {
      router.replace(defaultRouteForRole(session.user.role));
      return;
    }

    if (session.user.role === 'employee' && pathname !== '/employee' && pathname !== '/change-password') {
      router.replace('/employee');
      return;
    }

    if (session.user.role !== 'hr_admin' && pathname === '/admin-users') {
      router.replace(defaultRouteForRole(session.user.role));
      return;
    }

    setReady(true);
  }, [pathname, router]);

  if (!ready) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  return <>{children}</>;
}
