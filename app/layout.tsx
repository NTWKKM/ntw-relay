import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Noto_Sans_Thai, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-thai',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Personal Drop — Cross-Device Clipboard & File Drop',
  description:
    'Minimalist cross-device personal clipboard and file-drop workspace with real-time Firebase sync and QR quick-share.',
  openGraph: {
    title: 'Personal Drop — Cross-Device Clipboard & File Drop',
    description:
      'Minimalist cross-device personal clipboard and file-drop workspace with real-time Firebase sync and QR quick-share.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Personal Drop — Cross-Device Clipboard & File Drop',
    description:
      'Minimalist cross-device personal clipboard and file-drop workspace with real-time Firebase sync and QR quick-share.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${plusJakartaSans.variable} ${notoSansThai.variable} ${jetbrainsMono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="min-h-screen bg-[#0B0D11] text-[#F4F5F7] antialiased selection:bg-indigo-500/30 selection:text-indigo-100"
      >
        {children}
      </body>
    </html>
  );
}
