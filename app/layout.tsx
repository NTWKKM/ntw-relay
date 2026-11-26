import type { Metadata } from 'next';
import { Fraunces, Manrope, Noto_Sans_Thai, IBM_Plex_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai'],
  variable: '--font-thai',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NTW Relay — Cross-Device Clipboard & File Handoff',
  description:
    'Private cross-device clipboard, screenshot, and file handoff workspace with real-time Firebase sync and QR phone pickup.',
  openGraph: {
    title: 'NTW Relay — Cross-Device Clipboard & File Handoff',
    description:
      'Private cross-device clipboard, screenshot, and file handoff workspace with real-time Firebase sync and QR phone pickup.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NTW Relay — Cross-Device Clipboard & File Handoff',
    description:
      'Private cross-device clipboard, screenshot, and file handoff workspace with real-time Firebase sync and QR phone pickup.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${manrope.variable} ${notoSansThai.variable} ${ibmPlexMono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="min-h-screen bg-[#F5F2EB] text-[#181715] dark:bg-[#121110] dark:text-[#F3EFE8] antialiased selection:bg-[#1D4ED8]/15 selection:text-[#181715] dark:selection:bg-[#60A5FA]/25 dark:selection:text-[#F3EFE8] transition-colors duration-150"
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
