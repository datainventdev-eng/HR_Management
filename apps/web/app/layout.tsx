import type { Metadata } from 'next';
import './globals.css';
import AuthGate from './auth-gate';

export const metadata: Metadata = {
  title: 'HR Manager Dashboard',
  description: 'V1 HR management dashboard',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
