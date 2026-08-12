import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { SiteShell } from "@/components/site-shell";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://alive.local"),
  title: { default: "ALIVE | Proof of Physical State", template: "%s | ALIVE" },
  description:
    "ALIVE turns observable physical asset state into signed attestations that smart contracts can consume.",
  applicationName: "ALIVE",
  keywords: [
    "Proof of Physical State",
    "physical asset verification",
    "X Layer",
    "onchain attestation",
  ],
  openGraph: {
    title: "ALIVE | Proof of Physical State",
    description: "Give smart contracts eyes.",
    type: "website",
    images: [
      {
        url: "/media/forensic-laptop.png",
        width: 1600,
        height: 900,
        alt: "A physical laptop under an ALIVE forensic scan",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#080b09",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <Providers>
          <SiteShell>{children}</SiteShell>
        </Providers>
      </body>
    </html>
  );
}
