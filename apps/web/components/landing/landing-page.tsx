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
        {/* lg1 */}
        <div className={`${styles.lg} ${styles.lg1}`}>
          <svg viewBox="0 0 30 31" fill="currentColor">
            <mask id="lg1-mask-react">
              <rect width="30" height="31" fill="#fff" />
              <circle cx="19.5" cy="10.5" r="5.1" fill="#000" />
            </mask>
            <rect width="30" height="31" rx="6" mask="url(#lg1-mask-react)" />
            <circle cx="19.5" cy="10.5" r="3.2" />
          </svg>
          <span className={styles.lgWord}>logoipsum</span>
        </div>

        {/* lg2 */}
        <div className={`${styles.lg} ${styles.lg2}`}>
          <svg viewBox="0 0 25 30" fill="currentColor">
            <rect x="0" y="0" width="8" height="30" rx="4" />
            <circle cx="17" cy="15" r="8" />
          </svg>
          <span className={styles.lgWord}>
            logoipsum<span className={styles.dot}></span>
          </span>
        </div>

        {/* lg3 */}
        <div className={`${styles.lg} ${styles.lg3}`}>
          <svg viewBox="0 0 28 28" fill="none" stroke="currentColor">
            <circle cx="14" cy="14" r="12.35" strokeWidth="3.1" />
            <path
              d="M14 6c4 0 6 3 6 8s-2 8-6 8"
              strokeWidth="3.1"
              strokeLinecap="round"
            />
            <path
              d="M14 10c2 0 3 2 3 4s-1 4-3 4"
              strokeWidth="3.1"
              strokeLinecap="round"
            />
          </svg>
          <span className={styles.lgWord}>logoipsum</span>
        </div>

        {/* lg4 */}
        <div className={`${styles.lg} ${styles.lg4}`}>
          <svg viewBox="0 0 28 25.5" fill="none" stroke="currentColor">
            <path
              d="M2 13c3-5 8-7 12-7s9 2 12 7c-3 3-7 4.5-12 4.5S5 16 2 13z"
              fill="currentColor"
            />
            <path
              d="M4 19.5c3 2 6 3 10 3s7-1 10-3"
              strokeWidth="3.05"
              strokeLinecap="round"
            />
            <path
              d="M7 23.5c2 1 4 1.5 7 1.5s5-.5 7-1.5"
              strokeWidth="3.05"
              strokeLinecap="round"
            />
          </svg>
          <span className={styles.lgWord}>logoipsum</span>
        </div>
      </div>
    </div>
  );
}
