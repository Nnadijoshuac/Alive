import type { RwaAsset } from "@alive/shared";
import { AssetAvatar } from "./asset-avatar";
import styles from "./asset-identity.module.css";

/** Avatar + symbol/name stack -- the compact identity unit used in every table row and search result. */
export function AssetIdentity({
  asset,
  size = 30,
  className,
}: {
  asset: RwaAsset;
  size?: number;
  className?: string | undefined;
}) {
  return (
    <div className={[styles.identity, className].filter(Boolean).join(" ")}>
      <AssetAvatar asset={asset} size={size} />
      <div className={styles.text}>
        <span className={styles.symbol}>{asset.symbol}</span>
        <span className={styles.name}>{asset.name}</span>
      </div>
    </div>
  );
}
