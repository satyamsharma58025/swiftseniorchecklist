import type { Metadata } from "next";
import { Archivo_Black, Geist_Mono, Space_Grotesk } from "next/font/google";

import { AppFooter } from "@/components/AppFooter";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
});

const displayBlack = Archivo_Black({
  variable: "--font-display-black",
  subsets: ["latin"],
  weight: "400",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s · Swift Senior Checklist",
  },
  description: "Daily checklist and escalation management dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${grotesk.variable} ${displayBlack.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-paper text-ink">
        <a className="skip-link" href="#main">Skip to main content</a>
        <AppNav />
        <main id="main" className="mx-auto min-h-screen min-w-0 w-full max-w-screen-2xl bg-paper px-3 text-ink md:px-6">
          {children}
        </main>
        <AppFooter />
      </body>
    </html>
  );
}
