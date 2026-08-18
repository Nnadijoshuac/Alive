import styles from "./issuer-badge.module.css";

/**
 * A quiet text chip for an issuer/manager name. Deliberately no avatar --
 * the real-logo resolution pipeline (network + contract address, verified
 * against CoinGecko/Trust Wallet) applies to tokens, not to companies, and
 * inventing a mark for "Invesco Advisers, Inc." would be exactly the kind
 * of manufactured branding this feature exists to avoid.
 */
export function IssuerBadge({
  issuerName,
  className,
}: {
  issuerName: string;
  className?: string | undefined;
}) {
  return <span className={[styles.badge, className].filter(Boolean).join(" ")}>{issuerName}</span>;
}
