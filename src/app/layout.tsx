import type { Metadata } from "next";
import { Archivo_Black, Geist_Mono, Space_Grotesk } from "next/font/google";

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
  title: "Swift Senior Checklist",
  description: "Daily checklist and escalation management dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${grotesk.variable} ${displayBlack.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-paper text-ink">
        <AppNav />
        {children}
      </body>
    </html>
  );
}
