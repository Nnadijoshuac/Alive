import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { ReactNode } from "react";
import { SiteShell } from "@/components/site-shell";
import "./globals.css";

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
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
