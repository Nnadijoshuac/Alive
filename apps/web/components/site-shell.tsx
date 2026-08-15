"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRightIcon,
  DatabaseIcon,
  FlaskIcon,
  FlowArrowIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlayCircleIcon,
  PlusIcon,
  RepeatIcon,
  SquaresFourIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
import { AliveLogo } from "./logo";
import { ScrollProgress, useSafeReducedMotion } from "./motion-system";

const headerButtonClass =
  "button inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap px-4 text-sm font-semibold";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: SquaresFourIcon },
  { href: "/verify", label: "Verify", icon: MagnifyingGlassIcon },
  { href: "/create", label: "Create", icon: PlusIcon },
  { href: "/markets", label: "Markets", icon: DatabaseIcon },
  { href: "/rebalance", label: "Rebalance", icon: RepeatIcon },
  { href: "/attack-lab", label: "Attack Lab", icon: FlaskIcon },
  { href: "/protocol", label: "Protocol", icon: FlowArrowIcon },
  { href: "/demo", label: "Demo", icon: PlayCircleIcon },
] as const;

const landingNavigation = navigation.filter((item) => item.href !== "/create");

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [open, setOpen] = useState(false);
  const reducedMotion = useSafeReducedMotion();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [open]);

  if (pathname === "/demo") return <>{children}</>;

  return (
    <div className={`site-shell${isHome ? " site-shell-home" : ""}`}>
      <ScrollProgress className="site-scroll-progress" />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      {!isHome ? (
        <aside className="site-rail">
          <div>
            <Link href="/" className="logo-link" aria-label="ALIVE home">
              <AliveLogo />
            </Link>
            <nav className="rail-nav" aria-label="Primary navigation">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  aria-current={
                    pathname.startsWith(item.href) ? "page" : undefined
                  }
                >
                  {pathname.startsWith(item.href) ? (
                    <motion.span
                      className="rail-active-line"
                      layoutId="rail-active-line"
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    />
                  ) : null}
                  <item.icon size={18} weight="regular" aria-hidden="true" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="rail-meta">
            <span className="rail-status">Policy engine</span>
            <span>Demo data is labeled</span>
            <span>Execution requires authorization</span>
          </div>
        </aside>
      ) : null}

      <div className={`site-frame${isHome ? " site-frame-home" : ""}`}>
        <header
          className={`site-header${isHome ? " landing-site-header" : ""}`}
        >
          <div
            className={`shell-width nav-row${isHome ? " home-nav-row" : ""}`}
          >
            <Link
              href="/"
              className={isHome ? "landing-brand" : "mobile-brand"}
              aria-label="ALIVE home"
            >
              <AliveLogo compact={!isHome} />
            </Link>

            {isHome ? (
              <nav
                className="landing-desktop-nav"
                aria-label="Landing navigation"
              >
                {landingNavigation.map((item) => (
                  <Link key={item.href} href={item.href} prefetch={false}>
                    {item.label}
                  </Link>
                ))}
              </nav>
            ) : (
              <div className="protocol-ticker" aria-label="System boundaries">
                <span>Candidate policy</span>
                <span>Deterministic strategy</span>
                <span>Authorized execution</span>
              </div>
            )}

            <div className="nav-wallet">
              <Link
                href="/create"
                prefetch={false}
                className={`${headerButtonClass} button-paper`}
              >
                {isHome ? "Build strategy" : "New policy"}
                <ArrowRightIcon size={18} weight="bold" aria-hidden="true" />
              </Link>
            </div>

            <button
              className="mobile-menu-button"
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls="mobile-navigation"
              aria-label={open ? "Close navigation" : "Open navigation"}
            >
              {open ? <XIcon size={22} /> : <ListIcon size={22} />}
            </button>
          </div>

          <AnimatePresence initial={false}>
            {open ? (
              <motion.nav
                id="mobile-navigation"
                className="mobile-nav"
                aria-label="Mobile navigation"
                initial={
                  reducedMotion
                    ? false
                    : { clipPath: "inset(0 0 100% 0)", opacity: 0.65 }
                }
                animate={{ clipPath: "inset(0 0 0% 0)", opacity: 1 }}
                exit={{ clipPath: "inset(0 0 100% 0)", opacity: 0 }}
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
              >
                {navigation.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    aria-current={
                      pathname.startsWith(item.href) ? "page" : undefined
                    }
                    onClick={() => setOpen(false)}
                  >
                    <item.icon size={20} aria-hidden="true" />
                    {item.label}
                  </Link>
                ))}
              </motion.nav>
            ) : null}
          </AnimatePresence>
        </header>

        <motion.main
          id="main-content"
          key={pathname}
          initial={false}
          animate={
            reducedMotion
              ? { opacity: 1, y: 0 }
              : { opacity: [0.985, 1], y: [6, 0] }
          }
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.main>

        <footer
          className={`site-footer${isHome ? " landing-site-footer" : ""}`}
        >
          <div className="shell-width footer-grid">
            <div className="footer-brand">
              <AliveLogo />
              <p>
                AI-native intelligence and policy infrastructure for tokenized
                real-world assets.
              </p>
            </div>
            <div className="footer-meta">
              <span>AI interprets</span>
              <span>Code calculates</span>
              <span>Contracts enforce</span>
              <span>X Layer target</span>
            </div>
            <div className="footer-links">
              <Link href="/markets">Markets</Link>
              <Link href="/protocol">Protocol</Link>
              <Link href="/attack-lab">Attack Lab</Link>
              <Link href="/dev/design-system">Interface system</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
