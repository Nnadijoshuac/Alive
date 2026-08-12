import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="page-width route-loading" aria-label="Loading page">
      <Skeleton className="route-loading-title" />
      <Skeleton className="skeleton-wide" />
      <Skeleton className="skeleton-tall" />
    </div>
  );
}
