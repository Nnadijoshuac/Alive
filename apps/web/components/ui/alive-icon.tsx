"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import styles from "./alive-icon.module.css";

export type AliveIconSize = "sm" | "md" | "lg" | "huge";
export type AliveIconTone = "default" | "muted" | "positive" | "warning" | "negative" | "inherit";

/**
 * Interface-semantic icon sizes only -- never used for real token/issuer/
 * chain logos. SM/MD/LG are control-scale (dense metadata through nav/
 * buttons); HUGE is a deliberate visual anchor (empty states, major module
 * headings), not a CSS transform on a small icon -- the stroke width is
 * tuned down as size grows so the mark doesn't look bolded-up/blurry.
 */
export const ALIVE_ICON_SIZE_PX: Record<AliveIconSize, number> = {
  sm: 16,
  md: 22,
  lg: 30,
  huge: 48,
};

const STROKE_WIDTH: Record<AliveIconSize, number> = {
  sm: 2,
  md: 1.8,
  lg: 1.6,
  huge: 1.35,
};

export function AliveIcon({
  icon,
  size = "md",
  tone = "inherit",
  decorative = true,
  label,
  className,
}: {
  icon: IconSvgElement;
  size?: AliveIconSize;
  /** "inherit" (the default) takes color from the surrounding element (e.g. a button that toggles its own color for state) -- pick an explicit tone only when the icon needs a color independent of its container. */
  tone?: AliveIconTone;
  /** Icon carries no meaning on its own (paired with visible text) -- aria-hidden. Set false + provide `label` when the icon is the only accessible name. */
  decorative?: boolean;
  label?: string;
  className?: string | undefined;
}) {
  const accessibilityProps = decorative
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": label };

  return (
    <HugeiconsIcon
      icon={icon}
      size={ALIVE_ICON_SIZE_PX[size]}
      strokeWidth={STROKE_WIDTH[size]}
      className={[styles.icon, styles[tone], className].filter(Boolean).join(" ")}
      {...accessibilityProps}
    />
  );
}

/**
 * The deliberate container for a HUGE icon acting as a page-level visual
 * anchor (empty states, major intelligence-module headings) -- a 48px icon
 * inside a ~68px restrained tile, never a glowing/gradient bubble.
 */
export function AliveIconTile({
  icon,
  tone = "muted",
  label,
  className,
}: {
  icon: IconSvgElement;
  tone?: AliveIconTone;
  label?: string;
  className?: string;
}) {
  return (
    <div className={[styles.tile, className].filter(Boolean).join(" ")}>
      <AliveIcon icon={icon} size="huge" tone={tone} decorative={!label} {...(label ? { label } : {})} />
    </div>
  );
}
