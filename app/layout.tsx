import type { Metadata } from 'next';
import { Manrope, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-manrope',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Relay — Cross-Device Clipboard & File Handoff',
  description:
    'Private cross-device clipboard, screenshot, and file handoff workspace with real-time Firebase sync and QR phone pickup.',
  openGraph: {
    title: 'Relay — Cross-Device Clipboard & File Handoff',
    description:
      'Private cross-device clipboard, screenshot, and file handoff workspace with real-time Firebase sync and QR phone pickup.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Relay — Cross-Device Clipboard & File Handoff',
    description:
      'Private cross-device clipboard, screenshot, and file handoff workspace with real-time Firebase sync and QR phone pickup.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${geistMono.variable}`}
    >
      <head>
        <link
          href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-dvh bg-desk text-ink antialiased transition-colors duration-150"
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
