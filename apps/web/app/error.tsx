"use client";

import { WarningIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="page-width route-error"><WarningIcon size={43} /><h1>This surface could not be rendered.</h1><p>{error.message}</p><Button className="button-secondary" onClick={reset}>Try again</Button></div>;
}
