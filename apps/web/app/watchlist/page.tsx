import type { Metadata } from "next";
import { WatchlistPage } from "@/components/intelligence/watchlist-page";

export const metadata: Metadata = {
  title: "Watchlist | ALIVE",
  description: "Assets you're tracking in this browser.",
};

export default function Page() {
  return <WatchlistPage />;
}
