import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { ReactNode } from "react";
import { AliveMotionProvider } from "@/components/motion-system";
import { SiteShell } from "@/components/site-shell";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://alive.local"),
  title: { default: "ALIVE | RWA Policy Intelligence", template: "%s | ALIVE" },
  description:
    "Tell ALIVE what you want your money to do. AI interprets the mandate, deterministic code calculates the strategy, and smart contracts enforce the rules.",
  applicationName: "ALIVE",
  keywords: [
    "tokenized real-world assets",
    "RWA portfolio policy",
    "onchain vault",
    "X Layer",
    "deterministic portfolio optimization",
  ],
  openGraph: {
    title: "ALIVE | RWA Policy Intelligence",
    description:
      "AI understands the mandate. Deterministic code calculates. Smart contracts enforce the rules.",
    type: "website",
    images: [
      {
        url: "/brand/alive-logo.png",
        width: 1280,
        height: 1280,
        alt: "ALIVE logo",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#050806",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <AliveMotionProvider>
          <SiteShell>{children}</SiteShell>
        </AliveMotionProvider>
      </body>
    </html>
  );
}
