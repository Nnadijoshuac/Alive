"use client";

import { useState, type CSSProperties } from "react";
import { CoinIcon } from "@phosphor-icons/react";
import type { RwaAsset } from "@alive/shared";
import styles from "./asset-avatar.module.css";

/**
 * Renders an asset's REAL token logo -- resolved server-side by network +
 * canonical contract address (see services/intelligence's logo-resolver
 * and resolve-token-logos script), never guessed from the symbol. If no
 * verified logo exists, or the image URL fails to load, this shows one
 * neutral generic coin glyph -- the same glyph for every unresolved
 * asset, deliberately not styled to look like a distinguishing brand
 * mark. It never fabricates initials and presents them as if they were
 * official artwork, and it never shows a broken-image icon.
 */
export function AssetAvatar({
  asset,
  size = 32,
  shape = "circle",
  className,
}: {
  asset: RwaAsset;
  size?: number;
  shape?: "circle" | "square";
  className?: string | undefined;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const visual = asset.visual;
  const showImage = visual?.logoStatus === "RESOLVED" && !imageFailed;

  const style = {
    "--avatar-size": `${size}px`,
    "--avatar-icon-size": `${Math.max(12, Math.round(size * 0.52))}px`,
  } as CSSProperties;

  return (
    <span
      className={[styles.avatar, shape === "square" ? styles.square : styles.circle, className]
        .filter(Boolean)
        .join(" ")}
      style={style}
      role="img"
      aria-label={
        showImage
          ? `${asset.symbol} token logo`
          : `${asset.symbol} -- no verified token logo available`
      }
      data-mode={showImage ? "resolved" : "unavailable"}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={visual.logoUrl}
          alt=""
          className={styles.image}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <CoinIcon className={styles.placeholderIcon} weight="light" />
      )}
    </span>
  );
}
