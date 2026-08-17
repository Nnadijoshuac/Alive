import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import styles from "./canon.module.css";

export function CanonShell({
  children,
  homeHref = "/",
}: {
  children: ReactNode;
  homeHref?: string;
}) {
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Link href={homeHref} className={styles.wordmark}>
          ALIVE <span>Continuous RWA verification</span>
        </Link>
        <Link href="/dashboard" prefetch={false} className={styles.moreLink}>
          Full platform <ArrowUpRightIcon size={13} weight="bold" />
        </Link>
      </header>
      {children}
      <footer className={styles.footer}>
        AI proposes facts. Deterministic code decides. Smart contracts
        enforce. Demo data is labelled where it appears.
      </footer>
    </div>
  );
}

export { styles as canonStyles };
