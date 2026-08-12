"use client";

import { CornersOutIcon, ScanIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export function Scanner({
  children,
  active = true,
  label = "Optical capture",
  footer,
  className = "",
}: {
  children: ReactNode;
  active?: boolean;
  label?: string;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`scanner ${active ? "scanner-active" : ""} ${className}`} aria-label={label}>
      <div className="scanner-stage">
        {children}
        <div className="scanner-reticle" aria-hidden="true"><CornersOutIcon size={36} /></div>
        {active ? <div className="scanner-plane" aria-hidden="true" /> : null}
        <div className="scanner-label"><ScanIcon size={15} weight="bold" />{label}</div>
      </div>
      {footer ? <div className="scanner-footer">{footer}</div> : null}
    </section>
  );
}
