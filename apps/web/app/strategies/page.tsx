import { Metadata } from "next";
import { StrategiesView } from "@/components/intelligence/strategies-view";

export const metadata: Metadata = {
  title: "Strategies | ALIVE RWA Intelligence",
  description: "Discover operating strategies for ALIVE Agents on X Layer.",
};

export default function StrategiesPage() {
  return <StrategiesView />;
}
