import type { Metadata } from "next";
import { ActivityPage } from "@/components/intelligence/activity-page";

export const metadata: Metadata = {
  title: "Activity | ALIVE",
  description: "Recent verification activity in this browser.",
};

export default function Page() {
  return <ActivityPage />;
}
