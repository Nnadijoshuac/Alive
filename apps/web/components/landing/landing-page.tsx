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
        <Link href="/" className={styles.brand} aria-label="Home">
          <svg
            viewBox="0 0 31.5 48.5"
            width="31.5"
            height="48.5"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient
                id="bg1"
                x1="8"
                y1="0"
                x2="34.1"
                y2="28.9"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0" stopColor="#9e9e9e" />
                <stop offset="0.28" stopColor="#a6a6a6" />
                <stop offset="0.34" stopColor="#a3a3a3" />
                <stop offset="0.40" stopColor="#3a3a3a" />
                <stop offset="0.55" stopColor="#414141" />
                <stop offset="0.60" stopColor="#7a7a7a" />
                <stop offset="0.68" stopColor="#8e8e8e" />
                <stop offset="0.80" stopColor="#a9a9a9" />
                <stop offset="0.95" stopColor="#c4c4c4" />
                <stop offset="1" stopColor="#cccccc" />
              </linearGradient>
            </defs>
            <path
              d="M21.5 0 L21.5 19.5 L31.5 19.5 L31.5 29 L10 48.5 L10 28.5 L0.5 28.5 L0.5 18.5 Z"
              fill="url(#bg1)"
            />
            <rect x="0.5" y="18.5" width="9" height="10" fill="#fdfdfd" />
            <rect x="22" y="19.5" width="9.5" height="9.5" fill="#fdfdfd" />
          </svg>
        </Link>

        <nav className={styles.links} aria-label="Primary">
          <Link href="/explore">About</Link>
          <Link href="/explore">Features</Link>
          <Link href="/protocol">FAQ</Link>
          <Link href="/overview">Contact</Link>
        </nav>

        <Link href="/explore" className={`${styles.pill} ${styles.pillNav}`}>
          <span>Get Started</span>
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
                About
              </Link>
            </li>
            <li>
              <Link href="/explore" onClick={() => setIsOpen(false)}>
                Features
              </Link>
            </li>
            <li>
              <Link href="/protocol" onClick={() => setIsOpen(false)}>
                FAQ
              </Link>
            </li>
            <li>
              <Link href="/overview" onClick={() => setIsOpen(false)}>
                Contact
              </Link>
            </li>
          </ul>
          <div className={styles.menuFoot}>
            <Link
              href="/explore"
              className={`${styles.pill} ${styles.pillMenu}`}
              onClick={() => setIsOpen(false)}
            >
              <span>Get Started</span>
            </Link>
            <Link
              href="/explore"
              className={styles.ghostMenu}
              onClick={() => setIsOpen(false)}
            >
              View Architecture
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Hero */}
      <main className={styles.hero}>
        <h1 className={styles.headline}>
          <span>The Next Layer</span>
          <span>of Intelligence</span>
        </h1>
        <p className={styles.sub}>
          <span>A unified infrastructure platform to help teams build,</span>
          <span>ship, and scale AI systems with confidence.</span>
        </p>
        <div className={styles.actions}>
          <Link href="/explore" className={`${styles.pill} ${styles.pillCta}`}>
            <span>Get Started</span>
          </Link>
          <Link href="/explore" className={styles.ghost}>
            View Architecture
          </Link>
        </div>
      </main>

      {/* Partner Logos */}
      <div className={styles.logos}>
        {/* X LAYER */}
        <div className={`${styles.lg} ${styles.lg1}`}>
          <svg viewBox="0 0 32 32" fill="currentColor">
            <rect x="2" y="2" width="8" height="8" rx="2" />
            <rect x="22" y="2" width="8" height="8" rx="2" />
            <rect x="12" y="12" width="8" height="8" rx="2" />
            <rect x="2" y="22" width="8" height="8" rx="2" />
            <rect x="22" y="22" width="8" height="8" rx="2" />
          </svg>
          <span className={styles.lgWord}>X LAYER</span>
        </div>

        {/* ALIVE */}
        <div className={`${styles.lg} ${styles.lg2}`}>
          <svg viewBox="0 0 32 49" fill="currentColor">
            <path d="M21.5 0 L21.5 19.5 L31.5 19.5 L31.5 29 L10 48.5 L10 28.5 L0.5 28.5 L0.5 18.5 Z" />
            <rect x="0.5" y="18.5" width="9" height="10" />
            <rect x="22" y="19.5" width="9.5" height="9.5" />
          </svg>
          <span className={styles.lgWord}>ALIVE</span>
        </div>

        {/* CHAINLINK */}
        <div className={`${styles.lg} ${styles.lg3}`}>
          <svg
            viewBox="0 0 28 32"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinejoin="round"
          >
            <path d="M14 2 L26 8.9 L26 23.1 L14 30 L2 23.1 L2 8.9 Z" />
            <path
              d="M14 9 L20 12.5 L20 19.5 L14 23 L8 19.5 L8 12.5 Z"
              fill="currentColor"
              stroke="none"
            />
          </svg>
          <span className={styles.lgWord}>CHAINLINK</span>
        </div>

        {/* OKX */}
        <div className={`${styles.lg} ${styles.lg4}`}>
          <svg viewBox="0 0 32 32" fill="currentColor">
            <rect x="3" y="3" width="7" height="26" rx="2" />
            <rect x="12.5" y="3" width="7" height="26" rx="2" />
            <rect x="22" y="3" width="7" height="26" rx="2" />
          </svg>
          <span className={styles.lgWord}>OKX</span>
        </div>
      </div>
    </div>
  );
}
