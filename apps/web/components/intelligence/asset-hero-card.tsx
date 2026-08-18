import type { RwaAsset } from "@alive/shared";
import { AssetAvatar } from "./asset-avatar";
import { IssuerBadge } from "./issuer-badge";
import styles from "./asset-hero-card.module.css";

/** The large identity treatment for an asset's own detail page header. */
export function AssetHeroCard({ asset, size = 52 }: { asset: RwaAsset; size?: number }) {
  return (
    <div className={styles.hero}>
      <AssetAvatar asset={asset} size={size} className={styles.heroAvatar} />
      <div className={styles.heroText}>
        <div className={styles.eyebrowRow}>
          <span>{asset.assetClass}</span>
          <span>·</span>
          <IssuerBadge issuerName={asset.issuerName} />
        </div>
        <h1 className={styles.symbol}>{asset.symbol}</h1>
        <p className={styles.name}>{asset.name}</p>
      </div>
    </div>
  );
}
