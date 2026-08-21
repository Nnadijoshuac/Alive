"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CheckCircleIcon,
  CircleNotchIcon,
  ClockCounterClockwiseIcon,
  CompassIcon,
  FlaskIcon,
  HouseIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlayCircleIcon,
  RobotIcon,
  SlidersHorizontalIcon,
  StarIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { getIntelligenceHealth } from "@/lib/rwa-api";
import styles from "./shell.module.css";

const intelligenceNav = [
  { href: "/explore", label: "Discover", icon: CompassIcon },
  { href: "/overview", label: "Verify", icon: MagnifyingGlassIcon },
  { href: "/dashboard", label: "Portfolio", icon: HouseIcon },
  { href: "/watchlist", label: "Watchlist", icon: StarIcon },
  { href: "/activity", label: "Activity", icon: ClockCounterClockwiseIcon },
] as const;

const policyControlNav = [
  { href: "/create", label: "Mandate", icon: SlidersHorizontalIcon },
  { href: "/attack-lab", label: "Proof Lab", icon: FlaskIcon },
] as const;

const labsNav = [
  { href: "/agents", label: "Agent Preview", icon: RobotIcon },
  { href: "/strategies", label: "Strategy Library", icon: PlayCircleIcon },
] as const;

const advancedLinks = [
  { href: "/markets", label: "Markets" },
  { href: "/rebalance", label: "Rebalance" },
  { href: "/protocol", label: "Protocol" },
  { href: "/demo", label: "Demo controls" },
] as const;

type NavItemDefinition =
  | (typeof intelligenceNav)[number]
  | (typeof policyControlNav)[number]
  | (typeof labsNav)[number];

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: NavItemDefinition & { active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      prefetch={false}
      {...(onClick ? { onClick } : {})}
      aria-current={active ? "page" : undefined}
      className={active ? styles.navLinkActive : styles.navLink}
    >
      <Icon size={16} weight={active ? "fill" : "regular"} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

function ServiceStatus({
  live,
  long = false,
  className,
}: {
  live: boolean | undefined;
  long?: boolean;
  className?: string | undefined;
}) {
  const Icon =
    live === true
      ? CheckCircleIcon
      : live === false
        ? WarningCircleIcon
        : CircleNotchIcon;
  const label =
    live === undefined
      ? long
        ? "Checking service"
        : "Checking"
      : live
        ? long
          ? "Service connected"
          : "Connected"
        : long
          ? "Service offline"
          : "Offline";

  return (
    <Badge
      variant={live === true ? "positive" : live === false ? "destructive" : "outline"}
      className={className}
      data-state={live === undefined ? "checking" : live ? "online" : "offline"}
    >
      <Icon
        weight={live === true ? "fill" : "regular"}
        className={live === undefined ? styles.checkingIcon : undefined}
        aria-hidden="true"
      />
      {label}
    </Badge>
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
  const searchRef = useRef<HTMLInputElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const intelligenceLive = useIntelligenceStatus();

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches(
        "input, textarea, select, [contenteditable='true']",
      );
      if (event.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (event.key === "/" && !isEditing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  if (pathname === "/") return <>{children}</>;

  function isActive(href: string) {
    return href === "/overview"
      ? pathname === "/overview" || pathname.startsWith("/assets/") || pathname.startsWith("/verify")
      : pathname.startsWith(href);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/overview?q=${encodeURIComponent(trimmed)}`);
    setQuery("");
    setMobileOpen(false);
  }

  const allNavItems = [...intelligenceNav, ...policyControlNav, ...labsNav];
  const currentLabel = (() => {
    const direct = [...allNavItems, ...advancedLinks].find((item) =>
      isActive(item.href),
    );
    if (pathname.startsWith("/assets/")) return "Asset passport";
    if (pathname.startsWith("/policy/")) return "Policy record";
    if (pathname.startsWith("/vault/")) return "Vault";
    return direct?.label ?? "ALIVE";
  })();

  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <aside className={styles.rail}>
        <div>
          <Link href="/" className={styles.brand} aria-label="ALIVE home">
            <Image
              src="/asset/logo.png"
              alt="ALIVE"
              width={28}
              height={28}
              className={styles.brandLogo}
              priority
            />
            <span className={styles.brandCopy}>
              <strong>ALIVE</strong>
              <small>Policy intelligence</small>
            </span>
          </Link>

          <div className={styles.navGroup}>
            <p className={styles.navLabel}>Intelligence</p>
            <nav className={styles.nav} aria-label="Intelligence navigation">
              {intelligenceNav.map((item) => (
                <NavItem key={item.href} {...item} active={isActive(item.href)} />
              ))}
            </nav>
          </div>

          <div className={styles.navGroup}>
            <p className={styles.navLabel}>Policy &amp; Control</p>
            <nav className={styles.nav} aria-label="Policy and control navigation">
              {policyControlNav.map((item) => (
                <NavItem key={item.href} {...item} active={isActive(item.href)} />
              ))}
            </nav>
          </div>

          <div className={styles.navGroup}>
            <p className={styles.navLabel}>Labs</p>
            <nav className={styles.nav} aria-label="Labs navigation">
              {labsNav.map((item) => (
                <NavItem key={item.href} {...item} active={isActive(item.href)} />
              ))}
            </nav>
          </div>

          <Separator className={styles.railSeparator} />
          <details className={styles.moreGroup}>
            <summary>More tools</summary>
            <div className={styles.moreLinks}>
              {advancedLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={
                    isActive(item.href)
                      ? styles.advancedLinkActive
                      : styles.advancedLink
                  }
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        </div>

        <div className={styles.railFooter}>
          <ServiceStatus
            live={intelligenceLive}
            long
            className={styles.railStatus}
          />
          <span>Demo and snapshot data stay labelled</span>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.mobileBar}>
            <Link href="/" className={styles.mobileBrand} aria-label="ALIVE home">
              ALIVE
            </Link>
            <span>{currentLabel}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={styles.mobileMenuButton}
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMobileOpen((value) => !value)}
            >
              {mobileOpen ? <XIcon size={19} /> : <ListIcon size={19} />}
            </Button>
          </div>

          <div className={styles.routeContext}>
            <span>{currentLabel}</span>
            <small>RWA control room</small>
          </div>

          <form className={styles.topbarSearch} onSubmit={submitSearch} role="search">
            <MagnifyingGlassIcon size={15} aria-hidden="true" />
            <Input
              ref={searchRef}
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder="Search asset, issuer or address"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search a tokenized asset"
              className={styles.searchInput}
            />
            <kbd aria-hidden="true">/</kbd>
          </form>

          <div className={styles.contextBadges} aria-label="Application context">
            <Badge variant="outline" className={styles.networkBadge}>
              X Layer
            </Badge>
            <ServiceStatus
              live={intelligenceLive}
              className={styles.serviceBadge}
            />
          </div>
        </header>

        {mobileOpen ? (
          <div id="mobile-navigation" className={styles.mobileMenu}>
            <nav className={styles.mobileNav} aria-label="Mobile navigation">
              {allNavItems.map((item) => (
                <NavItem
                  key={item.href}
                  {...item}
                  active={isActive(item.href)}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
              <div className={styles.mobileMore}>
                <ServiceStatus
                  live={intelligenceLive}
                  long
                  className={styles.mobileService}
                />
                {advancedLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={isActive(item.href) ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </nav>
          </div>
        ) : null}

        <main id="main-content" className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
