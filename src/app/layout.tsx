import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CodeRelay — push & pull code, no auth",
  description: "Create an 8-char endpoint, push code (replace, no merge), pull anytime, or share a one-time 24-char flash link.",
  keywords: ["code", "push", "pull", "endpoint", "no-auth", "git-like"],
  authors: [{ name: "CodeRelay" }],
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "CodeRelay",
    description: "push & pull code, no auth",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "CodeRelay",
    description: "push & pull code, no auth",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
