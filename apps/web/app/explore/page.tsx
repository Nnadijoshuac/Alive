import type { Metadata } from "next";
import { ExplorePage } from "@/components/intelligence/explore-page";

export const metadata: Metadata = {
  title: "Explore | ALIVE",
  description: "Discover and filter tokenized real-world assets.",
};

export default function Page() {
  return <ExplorePage />;
}
