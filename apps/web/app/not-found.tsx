import Link from "next/link";
import { QuestionIcon } from "@phosphor-icons/react/dist/ssr";
import { buttonClass } from "@/components/ui";

export default function NotFound() { return <div className="page-width route-error"><QuestionIcon size={43} /><h1>Protocol route not found.</h1><p>The requested asset, escrow, or interface path does not exist.</p><Link className={`${buttonClass} button-secondary`} href="/dashboard">Return to dashboard</Link></div>; }
