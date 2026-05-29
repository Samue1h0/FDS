import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';

import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';

const outfit = Outfit({
  subsets: ["latin"],
});

// Default tab title for pages that don't set their own (e.g. the dashboard,
// which is a client component and can't export metadata). Pages that export
// their own `title` override this.
export const metadata: Metadata = {
  title: {
    default: "Dashboard | Fraud Analysis System",
  },
  description: "Real-time fraud detection and review dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.className} dark:bg-gray-900`}>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
