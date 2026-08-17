import type { Viewport } from "next";
import { VerifyHome } from "@/components/canon/verify-home";

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function HomePage() {
  return <VerifyHome />;
}
