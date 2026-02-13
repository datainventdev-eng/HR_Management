import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AuthGate from './auth-gate';
import { NetworkProgressBar } from './components/ui-feedback';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'HR Manager Dashboard',
  description: 'V1 HR management dashboard',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <NetworkProgressBar />
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
