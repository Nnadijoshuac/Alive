import { redirect } from "next/navigation";

export default function LegacyEscrowRedirect() {
  redirect("/dashboard");
}
