import type { RwaAsset, RwaDeployment } from "@alive/shared";
import type { SVGProps } from "react";

export function EthereumIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path d="M11.999 1.5L4.5 13.885l7.499 4.415 7.501-4.415L11.999 1.5zm0 18.596l-7.499-4.416 7.499 6.82 7.501-6.82-7.501 4.416z" />
    </svg>
  );
}

export function XLayerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <rect x="2" y="2" width="6" height="6" rx="1.2" />
      <rect x="16" y="2" width="6" height="6" rx="1.2" />
      <rect x="9" y="9" width="6" height="6" rx="1.2" />
      <rect x="2" y="16" width="6" height="6" rx="1.2" />
      <rect x="16" y="16" width="6" height="6" rx="1.2" />
    </svg>
  );
}

export function BaseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

export function ArbitrumIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 2L2 19.5h20L12 2zm0 4.5l6.5 11.5h-13L12 6.5z" />
    </svg>
  );
}

export function PolygonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path d="M16.5 12l3.5-2V6l-3.5-2L13 6v4l3.5 2zm-9 0L4 10V6l3.5-2L11 6v4l-3.5 2zm4.5 2.5l-3.5 2v4l3.5 2 3.5-2v-4l-3.5-2z" />
    </svg>
  );
}

export function OptimismIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

/**
 * Returns the primary verified deployment for an asset, or undefined if no
 * verified deployment exists. If multiple verified deployments exist, prefers
 * X Layer or Ethereum, then the first verified deployment.
 */
export function getPrimaryVerifiedDeployment(asset: RwaAsset): RwaDeployment | undefined {
  const verified = (asset.deployments ?? []).filter(
    (d) => d.deploymentStatus === "VERIFIED",
  );
  if (verified.length === 0) return undefined;
  if (verified.length === 1) return verified[0];

  const xLayer = verified.find((d) => d.chainId === 196 || d.chainId === 1952);
  if (xLayer) return xLayer;

  const eth = verified.find((d) => d.chainId === 1);
  if (eth) return eth;

  return verified[0];
}

export function ChainLogo({
  chainId,
  chainName,
  className,
}: {
  chainId?: number | undefined;
  chainName?: string | undefined;
  className?: string | undefined;
}) {
  const normalizedName = (chainName ?? "").toLowerCase();

  if (chainId === 196 || chainId === 1952 || normalizedName.includes("x layer")) {
    return <XLayerIcon className={className} />;
  }

  if (chainId === 1 || normalizedName.includes("ethereum")) {
    return <EthereumIcon className={className} />;
  }

  if (chainId === 8453 || normalizedName.includes("base")) {
    return <BaseIcon className={className} />;
  }

  if (chainId === 42161 || normalizedName.includes("arbitrum")) {
    return <ArbitrumIcon className={className} />;
  }

  if (chainId === 137 || normalizedName.includes("polygon")) {
    return <PolygonIcon className={className} />;
  }

  if (chainId === 10 || normalizedName.includes("optimism")) {
    return <OptimismIcon className={className} />;
  }

  // Fallback: Ethereum-style glyph
  return <EthereumIcon className={className} />;
}
