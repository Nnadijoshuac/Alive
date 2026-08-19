"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";

const STATS = [
  { glyph: "#", target: 20, label: "Real RWA Products", delay: "0.50s" },
  { glyph: "*", target: 7, label: "X Layer Assets", delay: "0.58s" },
  { glyph: "%", target: 5, label: "Fully Evaluated", delay: "0.66s" },
  { glyph: "<", target: 1, label: "Live Chainlink Feed", delay: "0.74s" },
];

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [counts, setCounts] = useState<number[]>([0, 0, 0, 0]);
  const statsRef = useRef<HTMLElement>(null);
  const animatedRef = useRef(false);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion) {
      setCounts(STATS.map((s) => s.target));
      return;
    }

    function runAnimation() {
      if (animatedRef.current) return;
      animatedRef.current = true;

      STATS.forEach((stat, index) => {
        const duration = 1500 + index * 80;
        const delay = 480 + index * 90;

        setTimeout(() => {
          const startTime = performance.now();

          function update(now: number) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = easeOutCubic(progress);
            const val = Math.round(stat.target * eased);

            setCounts((prev) => {
              const next = [...prev];
              next[index] = val;
              return next;
            });

            if (progress < 1) {
              requestAnimationFrame(update);
            } else {
              setCounts((prev) => {
                const next = [...prev];
                next[index] = stat.target;
                return next;
              });
            }
          }

          requestAnimationFrame(update);
        }, delay);
      });
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            runAnimation();
            observer.disconnect();
          }
        });
      },
      { threshold: 0.25 },
    );

    if (statsRef.current) {
      observer.observe(statsRef.current);
    } else {
      runAnimation();
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={styles.container}>
      {/* Background Video */}
      <div className={styles.bg}>
        <video
          className={styles.bgVideo}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4"
            type="video/mp4"
          />
        </video>
        <div className={styles.bgOverlay} />
      </div>

      {/* Page Single Viewport Content */}
      <div className={styles.page}>
        {/* Header */}
        <header className={styles.header}>
          <Link href="/" className={styles.logoBtn} aria-label="ALIVE Home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/alive-logo.png" alt="ALIVE" width={52} height={52} />
          </Link>

          <nav className={styles.navPill} aria-label="Main navigation">
            <Link href="/" className={`${styles.navLink} ${styles.active}`}>
              Home
            </Link>
            <Link href="/explore" className={styles.navLink}>
              Explore
            </Link>
            <Link href="/overview" className={styles.navLink}>
              Intelligence
            </Link>
            <Link href="/protocol" className={styles.navLink}>
              How It Works
            </Link>
          </nav>

          <Link href="/explore" className={styles.launchBtn}>
            Launch ALIVE
          </Link>

          <button
            type="button"
            className={`${styles.burgerBtn} ${mobileOpen ? styles.open : ""}`}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
          >
            <span className={styles.burgerBar} />
            <span className={styles.burgerBar} />
            <span className={styles.burgerBar} />
          </button>
        </header>

        {/* Hero Section */}
        <main className={styles.hero}>
          {/* Trust Row */}
          <div className={`${styles.trustRow} ${styles.anim}`} style={{ "--d": "0.05s" } as React.CSSProperties}>
            <div className={styles.trustAvatars}>
              <div className={styles.trustAvatar}>
                <div className={styles.trustInner}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <rect x="9" y="9" width="6" height="6" />
                    <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
                  </svg>
                </div>
              </div>
              <div className={styles.trustAvatar}>
                <div className={styles.trustInner}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
              </div>
              <div className={styles.trustAvatar}>
                <div className={styles.trustInner}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m3 3 7 7 4-4 7 7" />
                    <path d="M14 13h7v7" />
                  </svg>
                </div>
              </div>
            </div>
            <div className={styles.trustPill}>
              Built for the next generation of RWAs
            </div>
          </div>

          {/* Headline */}
          <h1 className={styles.headline}>
            <span className={`${styles.headlineLine} ${styles.line1}`}>Intelligence</span>
            <span className={`${styles.headlineLine} ${styles.line2}`}>For What’s Real</span>
          </h1>

          {/* Subhead */}
          <p className={`${styles.subhead} ${styles.anim}`} style={{ "--d": "0.28s" } as React.CSSProperties}>
            Understand what backs an RWA, what could move it, and whether it still
            meets the rules — before capital moves.
          </p>

          {/* CTA Group */}
          <div className={`${styles.ctaGroup} ${styles.animPulse}`} style={{ "--d": "0.40s" } as React.CSSProperties}>
            <Link href="/explore" className={styles.ctaBtn}>
              Explore RWAs
            </Link>
            <span className={styles.ctaMicrocopy}>Built on X Layer</span>
          </div>
        </main>

        {/* Stats Footer */}
        <footer className={styles.stats} ref={statsRef}>
          {STATS.map((stat, i) => (
            <div
              key={stat.label}
              className={`${styles.statItem} ${styles.anim}`}
              style={{ "--d": stat.delay } as React.CSSProperties}
            >
              <div className={styles.statGlyph}>{stat.glyph}</div>
              <div className={styles.statValue}>{counts[i]}</div>
              <div className={styles.statLabel}>{stat.label}</div>
            </div>
          ))}
        </footer>
      </div>

      {/* Mobile Drawer Overlay & Sheet */}
      {mobileOpen ? (
        <div
          className={styles.mobileOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileOpen(false);
          }}
        >
          <div className={styles.mobileSheet}>
            <nav className={styles.mobileNav}>
              <Link
                href="/"
                className={`${styles.mobileNavLink} ${styles.mobileNavActive}`}
                onClick={() => setMobileOpen(false)}
              >
                Home
              </Link>
              <Link
                href="/explore"
                className={styles.mobileNavLink}
                onClick={() => setMobileOpen(false)}
              >
                Explore
              </Link>
              <Link
                href="/overview"
                className={styles.mobileNavLink}
                onClick={() => setMobileOpen(false)}
              >
                Intelligence
              </Link>
              <Link
                href="/protocol"
                className={styles.mobileNavLink}
                onClick={() => setMobileOpen(false)}
              >
                How It Works
              </Link>
            </nav>
            <Link
              href="/explore"
              className={styles.mobileLaunchBtn}
              onClick={() => setMobileOpen(false)}
            >
              Launch ALIVE
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
