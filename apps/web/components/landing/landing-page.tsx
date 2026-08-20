"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./landing.module.css";

export function LandingPage() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={`${styles.stage} ${isOpen ? styles.isOpen : ""}`}>
      {/* Background CloudFront Video */}
      <div className={styles.plate}>
        <video
          className={styles.plateVideo}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260808_112712_da9d53df-6d27-4b12-bdf6-aa9dc2622bdf.mp4"
            type="video/mp4"
          />
        </video>
      </div>

      {/* Header Topbar */}
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="ALIVE">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logo.webp"
            alt="ALIVE"
            className={styles.brandImg}
            width={38}
            height={38}
          />
        </Link>

        <nav className={styles.links} aria-label="Primary">
          <Link href="/explore">Explore</Link>
          <Link href="/overview">Intelligence</Link>
          <Link href="/protocol">How It Works</Link>
          <Link href="/protocol#about">About</Link>
        </nav>

        <Link href="/explore" className={`${styles.pill} ${styles.pillNav}`}>
          <span>Launch ALIVE</span>
        </Link>

        <button
          type="button"
          className={styles.burger}
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close menu" : "Toggle menu"}
          aria-expanded={isOpen}
          aria-controls="mobileMenu"
        >
          <i className={styles.burgerBar}></i>
          <i className={styles.burgerBar}></i>
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      <nav className={styles.menu} id="mobileMenu" aria-hidden={!isOpen}>
        <div className={styles.menuInner}>
          <p className={styles.menuEyebrow}>Menu</p>
          <ul className={styles.menuList}>
            <li>
              <Link href="/explore" onClick={() => setIsOpen(false)}>
                Explore
              </Link>
            </li>
            <li>
              <Link href="/overview" onClick={() => setIsOpen(false)}>
                Intelligence
              </Link>
            </li>
            <li>
              <Link href="/protocol" onClick={() => setIsOpen(false)}>
                How It Works
              </Link>
            </li>
            <li>
              <Link href="/protocol#about" onClick={() => setIsOpen(false)}>
                About
              </Link>
            </li>
          </ul>
          <div className={styles.menuFoot}>
            <Link
              href="/explore"
              className={`${styles.pill} ${styles.pillMenu}`}
              onClick={() => setIsOpen(false)}
            >
              <span>Launch ALIVE</span>
            </Link>
            <Link
              href="/protocol"
              className={styles.ghostMenu}
              onClick={() => setIsOpen(false)}
            >
              How ALIVE Works
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Hero */}
      <main className={styles.hero}>
        <h1 className={styles.headline}>
          <span>Know What’s</span>
          <span>Behind The Token</span>
        </h1>
        <p className={styles.sub}>
          <span>Verify the backing, understand what could move it,</span>
          <span>and see whether it still meets the rules.</span>
        </p>
        <div className={styles.actions}>
          <Link href="/explore" className={`${styles.pill} ${styles.pillCta}`}>
            <span>Explore RWAs</span>
          </Link>
          <Link href="/protocol" className={styles.ghost}>
            How ALIVE Works
          </Link>
        </div>
      </main>

      {/* Infrastructure Technology Strip */}
      <div className={styles.logos}>
        {/* CHAINLINK */}
        <div className={`${styles.lg} ${styles.lg1}`}>
          <svg
            viewBox="0 0 28 32"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinejoin="round"
          >
            <path d="M14 2 L26 8.9 L26 23.1 L14 30 L2 23.1 L2 8.9 Z" />
            <path
              d="M14 9 L20 12.5 L20 19.5 L14 23 L8 19.5 L8 12.5 Z"
              fill="currentColor"
              stroke="none"
            />
          </svg>
          <div className={styles.lgText}>
            <span className={styles.lgWord}>CHAINLINK</span>
            <span className={styles.lgSub}>Live oracle data</span>
          </div>
        </div>

        {/* X LAYER */}
        <div className={`${styles.lg} ${styles.lg2}`}>
          <svg viewBox="0 0 32 32" fill="currentColor">
            <rect x="2" y="2" width="8" height="8" rx="2" />
            <rect x="22" y="2" width="8" height="8" rx="2" />
            <rect x="12" y="12" width="8" height="8" rx="2" />
            <rect x="2" y="22" width="8" height="8" rx="2" />
            <rect x="22" y="22" width="8" height="8" rx="2" />
          </svg>
          <div className={styles.lgText}>
            <span className={styles.lgWord}>X LAYER</span>
            <span className={styles.lgSub}>Onchain enforcement</span>
          </div>
        </div>

        {/* GROQ */}
        <div className={`${styles.lg} ${styles.lg3}`}>
          <svg viewBox="0 0 32 32" fill="currentColor">
            <path d="M16 4C9.37 4 4 9.37 4 16s5.37 12 12 12c5.96 0 10.9-4.35 11.82-10.08h-4.14c-.84 3.48-3.99 6.08-7.68 6.08-4.41 0-8-3.59-8-8s3.59-8 8-8c3.69 0 6.84 2.6 7.68 6.08h4.14C26.9 8.35 21.96 4 16 4z" />
            <rect x="18" y="14" width="10" height="4" rx="2" />
          </svg>
          <div className={styles.lgText}>
            <span className={styles.lgWord}>GROQ</span>
            <span className={styles.lgSub}>AI document intelligence</span>
          </div>
        </div>

        {/* OKX */}
        <div className={`${styles.lg} ${styles.lg4}`}>
          <svg viewBox="0 0 32 32" fill="currentColor">
            <rect x="3" y="3" width="7" height="26" rx="2" />
            <rect x="12.5" y="3" width="7" height="26" rx="2" />
            <rect x="22" y="3" width="7" height="26" rx="2" />
          </svg>
          <div className={styles.lgText}>
            <span className={styles.lgWord}>OKX</span>
            <span className={styles.lgSub}>X Layer trading</span>
          </div>
        </div>
      </div>
    </div>
  );
}
