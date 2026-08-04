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
  themeColor: "#0f172a", // slate-900 to match the background
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Watch Together | Multi-Display Video Sync",
  description:
    "A production-inspired real-time synchronization platform that maintains a single authoritative playback timeline while multiple display clients continuously synchronize under varying network conditions.",
  keywords: ["video sync", "real-time", "socket.io", "watch party", "multi-display"],
  authors: [{ name: "Aaditya Kumar Singh" }],
  openGraph: {
    title: "Watch Together | Multi-Display Video Sync",
    description: "A production-inspired real-time synchronization platform for multiple displays.",
    url: "https://watch-together.com",
    siteName: "Watch Together",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Watch Together | Multi-Display Video Sync",
    description: "A production-inspired real-time synchronization platform for multiple displays.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
