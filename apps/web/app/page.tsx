import type { Metadata, Viewport } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "ALIVE — Intelligence For What’s Real",
  description:
    "Verify the backing, understand what could move it, and see whether it still meets the rules.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function HomePage() {
  return <LandingPage />;
}
