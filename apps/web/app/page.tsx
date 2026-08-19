import type { Viewport } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function HomePage() {
  return <LandingPage />;
}

