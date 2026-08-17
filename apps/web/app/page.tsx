import type { Viewport } from "next";
import { OverviewPage } from "@/components/intelligence/overview-page";

export const viewport: Viewport = {
  themeColor: "#f7f4ee",
  colorScheme: "light",
};

export default function HomePage() {
  return <OverviewPage />;
}
