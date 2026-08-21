import Link from "next/link";
import { QuestionIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="page-width route-error">
      <QuestionIcon size={43} />
      <h1>Protocol route not found.</h1>
      <p>The requested asset, escrow, or interface path does not exist.</p>
      <Button asChild variant="outline">
        <Link href="/dashboard">Return to dashboard</Link>
      </Button>
    </div>
  );
}
