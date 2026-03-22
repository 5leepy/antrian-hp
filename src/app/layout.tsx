import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#14b8a6",
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Green SM Charging",
  description: "Aplikasi manajemen antrian pengisian daya taksi Green SM",
  manifest: "/manifest",
  appleWebApp: {
    capable: true,
    title: "Green SM",
    statusBarStyle: "black-translucent",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="apple-touch-icon" href="/icon" />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-slate-950 overscroll-none">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', function() { navigator.serviceWorker.register('/sw.js'); }); }`,
          }}
        />
      </body>
    </html>
  );
}
