import { redirect } from "next/navigation";

export default async function LegacyVerifyRedirect({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  redirect(`/assets/${encodeURIComponent(assetId)}`);
}

