"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ClockCounterClockwiseIcon,
  CompassIcon,
  FlaskIcon,
  HouseIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlayCircleIcon,
  StarIcon,
  XIcon,
} from "@phosphor-icons/react";
import { getIntelligenceHealth } from "@/lib/rwa-api";
import styles from "./shell.module.css";

const primaryNav = [
  { href: "/", label: "Overview", icon: HouseIcon },
  { href: "/explore", label: "Explore", icon: CompassIcon },
  { href: "/watchlist", label: "Watchlist", icon: StarIcon },
  { href: "/activity", label: "Activity", icon: ClockCounterClockwiseIcon },
] as const;

const demoNav = [
  { href: "/demo", label: "Demo", icon: PlayCircleIcon },
  { href: "/attack-lab", label: "Attack Lab", icon: FlaskIcon },
] as const;

const advancedLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/create", label: "Policy builder" },
  { href: "/markets", label: "Markets" },
  { href: "/rebalance", label: "Rebalance" },
  { href: "/protocol", label: "Protocol" },
] as const;

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: typeof HouseIcon;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      {...(onClick ? { onClick } : {})}
      aria-current={active ? "page" : undefined}
      className={active ? styles.navLinkActive : styles.navLink}
    >
      <Icon size={17} weight={active ? "fill" : "regular"} aria-hidden="true" />
      {label}
    </Link>
  );
}

function useIntelligenceStatus() {
  const [live, setLive] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    getIntelligenceHealth()
      .then(() => {
        if (!cancelled) setLive(true);
      })
      .catch(() => {
        if (!cancelled) setLive(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return live;
}

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const intelligenceLive = useIntelligenceStatus();

  useEffect(() => setMobileOpen(false), [pathname]);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/?q=${encodeURIComponent(trimmed)}`);
    setQuery("");
    setMobileOpen(false);
  }

  const allNavItems = [...primaryNav, ...demoNav];

  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <aside className={styles.rail}>
        <div>
          <Link href="/" className={styles.brand} aria-label="ALIVE home">
            ALIVE <span>RWA Intelligence</span>
          </Link>
          <nav className={styles.nav} aria-label="Primary navigation">
            {primaryNav.map((item) => (
              <NavItem key={item.href} {...item} active={isActive(item.href)} />
            ))}
          </nav>
          <hr className={styles.navSeparator} />
          <nav className={styles.nav} aria-label="Demo navigation">
            {demoNav.map((item) => (
              <NavItem key={item.href} {...item} active={isActive(item.href)} />
            ))}
          </nav>
          <hr className={styles.navSeparator} />
          <div className={styles.advancedGroup}>
            <p className={styles.advancedLabel}>Advanced</p>
            {advancedLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={styles.advancedLink}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div className={styles.railFooter}>
          <span>
            <i
              className={
                intelligenceLive ? styles.statusDotLive : styles.statusDot
              }
              aria-hidden="true"
            />
            {intelligenceLive === undefined
              ? "Checking intelligence service…"
              : intelligenceLive
                ? "Intelligence service connected"
                : "Intelligence service offline"}
          </span>
          <span>Demo data is labeled</span>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.mobileBar}>
            <Link href="/" className={styles.brand} aria-label="ALIVE home">
              ALIVE
            </Link>
            <button
              type="button"
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((value) => !value)}
            >
              {mobileOpen ? <XIcon size={20} /> : <ListIcon size={20} />}
            </button>
          </div>
          <form className={styles.topbarSearch} onSubmit={submitSearch} role="search">
            <MagnifyingGlassIcon size={15} aria-hidden="true" />
            <input
              type="text"
              inputMode="search"
              autoComplete="off"
              placeholder="Search token, issuer, asset or address"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search a tokenized asset"
            />
          </form>
        </header>

        {mobileOpen ? (
          <nav className={styles.nav} aria-label="Mobile navigation" style={{ padding: "8px 16px" }}>
            {allNavItems.map((item) => (
              <NavItem
                key={item.href}
                {...item}
                active={isActive(item.href)}
                onClick={() => setMobileOpen(false)}
              />
            ))}
          </nav>
        ) : null}

        <main id="main-content" className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
