"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRightIcon, ListIcon, XIcon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { AliveLogo } from "./logo";

const headerButtonClass =
  "button inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap px-4 text-sm font-semibold";

const navigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/assets/register", label: "Register" },
  { href: "/attack-lab", label: "Attack Lab" },
  { href: "/protocol", label: "Protocol" },
];

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname === "/demo") return <>{children}</>;

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="shell-width nav-row">
          <Link href="/" className="logo-link" aria-label="ALIVE home">
            <AliveLogo />
          </Link>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-current={
                  pathname.startsWith(item.href) ? "page" : undefined
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="nav-wallet">
            <Link
              href="/dashboard"
              prefetch={false}
              className={`${headerButtonClass} button-secondary`}
            >
              Launch app
              <ArrowRightIcon size={18} weight="bold" />
            </Link>
          </div>
          <button
            className="mobile-menu-button"
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            aria-label="Toggle navigation"
          >
            {open ? <XIcon size={22} /> : <ListIcon size={22} />}
          </button>
        </div>
        {open ? (
          <nav
            id="mobile-navigation"
            className="mobile-nav"
            aria-label="Mobile navigation"
          >
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/dashboard"
              prefetch={false}
              className={`${headerButtonClass} button-secondary`}
              onClick={() => setOpen(false)}
            >
              Launch app
              <ArrowRightIcon size={18} weight="bold" />
            </Link>
          </nav>
        ) : null}
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <div className="shell-width footer-grid">
          <AliveLogo />
          <p>Observable physical state, signed for programmable settlement.</p>
          <div>
            <Link href="/protocol">Security model</Link>
            <Link href="/dev/design-system">Design system</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
