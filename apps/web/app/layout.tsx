import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { ReactNode } from "react";
import { AliveMotionProvider } from "@/components/motion-system";
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
        url: "/media/alive/inspection-studio.jpg",
        width: 1536,
        height: 1024,
        alt: "A conceptual studio view of a wristwatch beside an ALIVE inspection laptop",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#141518",
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
