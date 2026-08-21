"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import {
  ArrowRightIcon,
  ListIcon,
  XIcon,
  WalletIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { activeChain } from "@/lib/chain";
import { truncateHash } from "@/lib/format";
import styles from "./landing.module.css";

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260813_115057_94c3699b-0fd1-4124-bcf3-3626bb8c1f77.mp4";

const NAV_ITEMS = [
  { id: "01", label: "EXPLORE", href: "/explore" },
  { id: "02", label: "AGENTS", href: "/agents" },
  { id: "03", label: "STRATEGIES", href: "/strategies" },
  { id: "04", label: "HOW IT WORKS", href: "/protocol" },
] as const;

const NODES = [
  {
    id: "01",
    tag: "ASSET",
    line1: "What is it?",
    line2: "What backs it?",
    status: "VERIFIED",
  },
  {
    id: "02",
    tag: "MARKET",
    line1: "What changed?",
    line2: "What matters?",
    status: "LIVE",
  },
  {
    id: "03",
    tag: "WALLET",
    line1: "What does it",
    line2: "mean for you?",
    status: "CONTEXT",
  },
] as const;

export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const connector = connectors[0];
  const isWrongNetwork = mounted && isConnected && chainId !== activeChain.id;

  useEffect(() => {
    setMounted(true);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
        setWalletMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className={styles.heroContainer}>
      {/* Background Cinematic Video */}
      <div className={styles.videoWrapper} aria-hidden="true">
        <video
          ref={videoRef}
          className={styles.bgVideo}
          src={VIDEO_SRC}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
        <div className={styles.videoDarkener} />
      </div>

      {/* Subtle Geometric Grid & Intersection Plus Marks */}
      <div className={styles.gridOverlay} aria-hidden="true">
        <span className={`${styles.crosshair} ${styles.crossTopLeft}`}>+</span>
        <span className={`${styles.crosshair} ${styles.crossTopRight}`}>+</span>
        <span className={`${styles.crosshair} ${styles.crossMidLeft}`}>+</span>
        <span className={`${styles.crosshair} ${styles.crossMidCenter}`}>+</span>
        <span className={`${styles.crosshair} ${styles.crossMidRight}`}>+</span>
        <span className={`${styles.crosshair} ${styles.crossBottomLeft}`}>+</span>
        <span className={`${styles.crosshair} ${styles.crossBottomRight}`}>+</span>
      </div>

      {/* Top Navigation */}
      <header className={styles.header}>
        <div className={styles.navLeft}>
          <Link href="/" className={styles.wordmark} aria-label="ALIVE home">
            <Image
              src="/asset/logo.png"
              alt="ALIVE"
              width={26}
              height={26}
              className={styles.brandLogo}
              priority
            />
            <span>ALIVE</span>
          </Link>

          <nav className={styles.desktopNav} aria-label="Main Navigation">
            {NAV_ITEMS.map((item) => (
              <Link key={item.id} href={item.href} className={styles.navLink}>
                <span className={styles.navIndex}>{item.id}.</span>
                <span className={styles.navLabel}>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div className={styles.navRight}>
          {/* Network Badge */}
          <div className={styles.networkBadge}>
            <span className={styles.networkDot} aria-hidden="true" />
            <span className={styles.networkText}>X LAYER</span>
          </div>

          {/* Wallet State */}
          <div className={styles.walletContainer}>
            {!mounted || !isConnected ? (
              <button
                type="button"
                className={styles.walletConnectBtn}
                disabled={!connector || isConnecting}
                onClick={() => connector && connect({ connector })}
              >
                <WalletIcon size={14} weight="bold" aria-hidden="true" />
                <span>{isConnecting ? "CONNECTING..." : "CONNECT WALLET"}</span>
              </button>
            ) : isWrongNetwork ? (
              <button
                type="button"
                className={styles.walletWarningBtn}
                disabled={isSwitching}
                onClick={() => switchChain({ chainId: activeChain.id })}
              >
                <WarningIcon size={14} weight="bold" aria-hidden="true" />
                <span>{isSwitching ? "SWITCHING..." : "WRONG NETWORK"}</span>
              </button>
            ) : (
              <div className={styles.walletMenuWrapper}>
                <button
                  type="button"
                  className={styles.walletActiveBtn}
                  onClick={() => setWalletMenuOpen((prev) => !prev)}
                  aria-expanded={walletMenuOpen}
                >
                  <span className={styles.walletAddress}>
                    {truncateHash(address ?? "", 6, 4)}
                  </span>
                  <span className={styles.connectedTag}>[ CONNECTED ]</span>
                </button>

                {walletMenuOpen && (
                  <div className={styles.walletDropdown}>
                    <div className={styles.walletDropdownInfo}>
                      <small>NETWORK</small>
                      <strong>{activeChain.name}</strong>
                    </div>
                    <button
                      type="button"
                      className={styles.walletDisconnectBtn}
                      onClick={() => {
                        disconnect();
                        setWalletMenuOpen(false);
                      }}
                    >
                      DISCONNECT
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            className={styles.mobileMenuToggle}
            aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            {mobileMenuOpen ? (
              <XIcon size={20} weight="bold" />
            ) : (
              <ListIcon size={20} weight="bold" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className={styles.mobileNavOverlay}>
          <div className={styles.mobileNavContent}>
            <div className={styles.mobileNavHeader}>
              <div className={styles.mobileBrand}>
                <Image
                  src="/asset/logo.png"
                  alt="ALIVE"
                  width={26}
                  height={26}
                  className={styles.brandLogo}
                />
                <span className={styles.mobileWordmark}>ALIVE</span>
              </div>
              <button
                type="button"
                className={styles.mobileCloseBtn}
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation"
              >
                <XIcon size={22} weight="bold" />
              </button>
            </div>

            <nav className={styles.mobileNavList} aria-label="Mobile Navigation">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className={styles.mobileNavLink}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className={styles.mobileNavIndex}>{item.id}.</span>
                  <span className={styles.mobileNavLabel}>{item.label}</span>
                  <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
                </Link>
              ))}
            </nav>

            <div className={styles.mobileNavFooter}>
              <div className={styles.mobileNetworkRow}>
                <span className={styles.networkDot} aria-hidden="true" />
                <span>X LAYER MAINNET</span>
              </div>
              {!isConnected ? (
                <button
                  type="button"
                  className={styles.mobileWalletBtn}
                  onClick={() => {
                    if (connector) connect({ connector });
                    setMobileMenuOpen(false);
                  }}
                >
                  CONNECT WALLET
                </button>
              ) : (
                <div className={styles.mobileConnectedBox}>
                  <span>{truncateHash(address ?? "", 8, 6)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      disconnect();
                      setMobileMenuOpen(false);
                    }}
                  >
                    DISCONNECT
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Viewport Content Layout */}
      <div className={styles.viewportBody}>
        {/* Upper-Left: Main Headline & Supporting Copy */}
        <section className={styles.heroHeadlineSection}>
          <div className={styles.headlineWrapper}>
            <h1 className={styles.mainHeadline}>
              Know what&apos;s
              <br />
              behind the token.
            </h1>
            <p className={styles.supportingCopy}>
              ALIVE checks the asset,
              <br />
              watches the market,
              <br />
              and helps you act with context.
            </p>
          </div>
        </section>

        {/* Center / Right: Connected Node System */}
        <section
          className={styles.nodeNetworkSection}
          aria-label="How ALIVE assembles context"
        >
          <div className={styles.nodeNetwork}>
            {/* SVG Connector Lines */}
            <svg
              className={styles.connectorSvg}
              viewBox="0 0 720 280"
              fill="none"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {/* Path 1: Node 1 to Node 2 */}
              <path
                d="M 190 120 L 270 120"
                className={styles.connectorLine}
              />
              {/* Path 2: Node 2 to Node 3 */}
              <path
                d="M 450 120 L 530 120"
                className={styles.connectorLine}
              />
              {/* Junction Points */}
              <circle cx="190" cy="120" r="3" className={styles.connectorDot} />
              <circle cx="270" cy="120" r="3" className={styles.connectorDot} />
              <circle cx="450" cy="120" r="3" className={styles.connectorDot} />
              <circle cx="530" cy="120" r="3" className={styles.connectorDot} />
            </svg>

            {/* Rendered Nodes */}
            <div className={styles.nodeTrack}>
              {NODES.map((node, index) => (
                <div
                  key={node.id}
                  className={`${styles.nodeCard} ${styles[`nodeDelay${index + 1}`]}`}
                >
                  <div className={styles.nodeHeader}>
                    <span className={styles.nodeTag}>[ {node.tag} ]</span>
                    <span className={styles.nodeStatus}>
                      <span className={styles.statusDot} aria-hidden="true" />
                      {node.status}
                    </span>
                  </div>
                  <div className={styles.nodeBody}>
                    <p className={styles.nodeLine}>{node.line1}</p>
                    <p className={styles.nodeLine}>{node.line2}</p>
                  </div>
                  <div className={styles.nodeCornerMarks} aria-hidden="true">
                    <span className={styles.cornerTL} />
                    <span className={styles.cornerBR} />
                  </div>
                </div>
              ))}
            </div>

            {/* Visual Process Flow Ribbon */}
            <div className={styles.nodeFlowSequence} aria-hidden="true">
              <span>ASSET</span>
              <span className={styles.sequenceArrow}>→</span>
              <span>MARKET</span>
              <span className={styles.sequenceArrow}>→</span>
              <span>WALLET CONTEXT</span>
              <span className={styles.sequenceArrow}>→</span>
              <span className={styles.sequenceAction}>ACTION</span>
            </div>
          </div>
        </section>

        {/* Bottom Gutter Row: Primary CTA (Left) & Supporting Card (Right) */}
        <footer className={styles.bottomRow}>
          {/* Primary CTA Bottom-Left */}
          <div className={styles.ctaWrapper}>
            <Link href="/explore" className={styles.primaryCta}>
              <span className={styles.ctaStar} aria-hidden="true">✦</span>
              <span className={styles.ctaText}>EXPLORE RWAs</span>
              <ArrowRightIcon
                size={16}
                weight="bold"
                className={styles.ctaArrow}
                aria-hidden="true"
              />
            </Link>
          </div>

          {/* Supporting Card Bottom-Right */}
          <div className={styles.supportCardWrapper}>
            <div className={styles.supportCard}>
              <div className={styles.supportCardHeader}>
                <span className={styles.supportPrehead}>
                  LESS NOISE. MORE CONTEXT.
                </span>
              </div>
              <p className={styles.supportMessage}>
                See what matters
                <br />
                before you act.
              </p>
              <Link href="/protocol" className={styles.supportLink}>
                <span>HOW ALIVE WORKS</span>
                <ArrowRightIcon size={12} weight="bold" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
