import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HR Manager Dashboard',
  description: 'V1 HR management dashboard',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
