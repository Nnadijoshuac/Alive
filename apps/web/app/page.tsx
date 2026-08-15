import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  CpuIcon,
  DatabaseIcon,
  LockKeyIcon,
  RepeatIcon,
  ShieldWarningIcon,
} from "@phosphor-icons/react/dist/ssr";
import { HeroDevice } from "@/components/hero-device";
import {
  Reveal,
  ScrollParallax,
  StaggerGroup,
  StaggerItem,
} from "@/components/motion-system";
import styles from "./page.module.css";

const assetClasses = [
  { name: "Treasuries", purpose: "Income and duration" },
  { name: "Gold", purpose: "Defensive exposure" },
  { name: "Equities", purpose: "Bounded growth" },
  { name: "Credit", purpose: "Issuer-aware yield" },
  { name: "Cash", purpose: "Liquidity reserve" },
] as const;

const policyRows = [
  {
    name: "Treasuries",
    range: "50-80%",
    current: "62%",
    proposed: "64%",
    trackClass: styles.treasuryTrack,
  },
  {
    name: "Gold",
    range: "5-20%",
    current: "12%",
    proposed: "14%",
    trackClass: styles.goldTrack,
  },
  {
    name: "Equities",
    range: "0-20%",
    current: "16%",
    proposed: "12%",
    trackClass: styles.equityTrack,
  },
  {
    name: "Cash",
    range: "10-30%",
    current: "10%",
    proposed: "10%",
    trackClass: styles.cashTrack,
  },
] as const;

const responseStages = [
  {
    title: "Observe the market",
    copy: "A sourced snapshot carries provider, timestamp, and freshness status.",
    icon: DatabaseIcon,
  },
  {
    title: "Detect policy drift",
    copy: "Deterministic checks compare the portfolio with its signed mandate.",
    icon: ShieldWarningIcon,
  },
  {
    title: "Propose a bounded rebalance",
    copy: "The user reviews the calculation before any authorized execution.",
    icon: RepeatIcon,
  },
] as const;

export default function HomePage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="alive-hero-title">
        <div className={`${styles.shell} ${styles.heroGrid}`}>
          <Reveal className={styles.heroCopy} mode="focus" duration={0.76}>
            <p className={styles.eyebrow}>RWA policy intelligence, prototype</p>
            <h1 id="alive-hero-title">
              <span>
                <span>Tell ALIVE</span> <span>what you want</span>
              </span>
              <span>
                <span>your money</span> <span>to do.</span>
              </span>
            </h1>
            <p className={styles.heroSummary}>
              AI understands the mandate. Deterministic code calculates. Smart
              contracts enforce the rules.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryAction} href="/create">
                Build my RWA strategy
                <ArrowRightIcon size={18} weight="bold" aria-hidden="true" />
              </Link>
              <Link className={styles.textAction} href="/attack-lab">
                Try to break ALIVE
                <ArrowUpRightIcon size={17} aria-hidden="true" />
              </Link>
            </div>
          </Reveal>

          <Reveal
            className={styles.heroVisual}
            mode="aperture"
            delay={0.08}
            duration={0.84}
          >
            <HeroDevice />
            <p className={styles.visualNote}>
              Illustrative policy universe. No live prices or allocations.
            </p>
          </Reveal>
        </div>
      </section>

      <section className={styles.causalSection} aria-label="How ALIVE works">
        <div className={styles.shell}>
          <StaggerGroup
            className={styles.causalRail}
            role="list"
            stagger={0.08}
          >
            <StaggerItem role="listitem" index={0} mode="trace">
              <CpuIcon size={20} weight="regular" aria-hidden="true" />
              <span>
                <strong>AI interprets</strong>
                Candidate intent, research, and explanation
              </span>
            </StaggerItem>
            <StaggerItem role="listitem" index={1} mode="trace">
              <CheckCircleIcon size={20} weight="regular" aria-hidden="true" />
              <span>
                <strong>Code calculates</strong>
                Strict validation and portfolio arithmetic
              </span>
            </StaggerItem>
            <StaggerItem role="listitem" index={2} mode="trace">
              <LockKeyIcon size={20} weight="regular" aria-hidden="true" />
              <span>
                <strong>Contracts enforce</strong>
                Approved assets, bounds, freshness, authorization
              </span>
            </StaggerItem>
          </StaggerGroup>
          <p className={styles.buildDisclosure}>
            The current build uses clearly labeled demo market data. Onchain
            actions still require explicit authorization.
          </p>
        </div>
      </section>

      <section className={styles.assetSection} aria-labelledby="assets-title">
        <div className={`${styles.shell} ${styles.assetLayout}`}>
          <Reveal className={styles.assetStatement} mode="focus">
            <h2 id="assets-title">RWAs are multiplying.</h2>
            <p>
              Access is expanding. Selection, allocation, and enforceable risk
              limits are now the harder problem.
            </p>
            <Link className={styles.textAction} href="/markets">
              Inspect the market layer
              <ArrowUpRightIcon size={17} aria-hidden="true" />
            </Link>
          </Reveal>

          <ScrollParallax className={styles.assetField} range={[34, -34]}>
            <ul>
              {assetClasses.map((asset) => (
                <li key={asset.name}>
                  <span>{asset.name}</span>
                  <small>{asset.purpose}</small>
                </li>
              ))}
            </ul>
            <p>
              What should
              <strong>you own?</strong>
            </p>
          </ScrollParallax>
        </div>
      </section>

      <section
        className={styles.mandateSection}
        aria-labelledby="mandate-title"
      >
        <div className={`${styles.shell} ${styles.mandateLayout}`}>
          <Reveal className={styles.mandateCopy} mode="trace" direction="right">
            <h2 id="mandate-title">Say what you want.</h2>
            <p>
              Start with the outcome in plain language. ALIVE turns the request
              into a candidate policy you can inspect and change.
            </p>
            <div className={styles.mandatePrinciple}>
              <span>Natural language begins the flow.</span>
              <strong>It never becomes executable authority.</strong>
            </div>
          </Reveal>

          <Reveal className={styles.promptSurface} mode="aperture" delay={0.08}>
            <form action="/create" method="get">
              <label htmlFor="landing-mandate">
                Tell ALIVE what you want your money to do.
              </label>
              <textarea
                id="landing-mandate"
                name="mandate"
                rows={5}
                placeholder="Protect capital and earn yield. Keep at least 50% in Treasuries and never put more than 20% into equities."
              />
              <div>
                <p>Nothing is signed or submitted from this landing page.</p>
                <button type="submit">
                  Compile mandate
                  <ArrowRightIcon size={18} weight="bold" aria-hidden="true" />
                </button>
              </div>
            </form>
          </Reveal>
        </div>
      </section>

      <section className={styles.policySection} aria-labelledby="policy-title">
        <div className={styles.shell}>
          <Reveal className={styles.sectionHeading} mode="focus">
            <p className={styles.eyebrow}>A strict policy, not a prompt</p>
            <h2 id="policy-title">ALIVE turns intent into policy.</h2>
            <p>
              Ambiguity becomes typed limits. Portfolio math stays
              deterministic, inspectable, and contract-compatible.
            </p>
          </Reveal>

          <div className={styles.policyComposition}>
            <Reveal
              className={styles.policySource}
              mode="wipe"
              direction="right"
            >
              <p>Example mandate</p>
              <blockquote>
                Protect capital, keep most funds in Treasuries, retain cash, and
                cap equity exposure.
              </blockquote>
              <dl>
                <div>
                  <dt>Interpretation</dt>
                  <dd>Candidate only</dd>
                </div>
                <div>
                  <dt>Arithmetic</dt>
                  <dd>Deterministic</dd>
                </div>
                <div>
                  <dt>Execution</dt>
                  <dd>User authorized</dd>
                </div>
              </dl>
            </Reveal>

            <Reveal className={styles.policyMap} mode="aperture" delay={0.08}>
              <header>
                <div>
                  <span>Your ALIVE mandate</span>
                  <strong>Example policy</strong>
                </div>
                <p>Synthetic allocations</p>
              </header>
              <div className={styles.policyLegend} aria-hidden="true">
                <span>Allowed range</span>
                <span>Current</span>
                <span>Proposed</span>
              </div>
              <div className={styles.policyRows}>
                {policyRows.map((row) => (
                  <div className={styles.policyRow} key={row.name}>
                    <div>
                      <strong>{row.name}</strong>
                      <span>{row.range}</span>
                    </div>
                    <div
                      className={`${styles.rangeLine} ${row.trackClass}`}
                      role="img"
                      aria-label={`${row.name}: allowed ${row.range}, current ${row.current}, proposed ${row.proposed}`}
                    >
                      <span className={styles.allowedRange} />
                      <i className={styles.currentMarker} />
                      <b className={styles.proposedMarker} />
                    </div>
                    <div className={styles.policyValues}>
                      <span>{row.current}</span>
                      <strong>{row.proposed}</strong>
                    </div>
                  </div>
                ))}
              </div>
              <footer>
                <span>Single asset max 20%</span>
                <span>Single issuer max 25%</span>
              </footer>
            </Reveal>
          </div>
        </div>
      </section>

      <section
        className={styles.rejectionSection}
        aria-labelledby="rejection-title"
      >
        <div className={`${styles.shell} ${styles.rejectionLayout}`}>
          <Reveal className={styles.rejectionCopy} mode="focus">
            <h2 id="rejection-title">The AI can&apos;t break your rules.</h2>
            <p>
              A persuasive model output still fails when it violates the
              canonical policy. The wall is code, not a suggestion.
            </p>
            <Link className={styles.textAction} href="/attack-lab">
              Try the policy attacks
              <ArrowUpRightIcon size={17} aria-hidden="true" />
            </Link>
          </Reveal>

          <Reveal className={styles.rejectionVisual} mode="aperture">
            <div className={styles.requestBlock}>
              <span>AI proposal</span>
              <strong>100%</strong>
              <p>Equities</p>
            </div>
            <div className={styles.policyWall}>
              <span>Policy wall</span>
              <strong>20% max</strong>
            </div>
            <div className={styles.rejectedProbe} aria-hidden="true">
              <i />
            </div>
            <div className={styles.rejectionResult}>
              <ShieldWarningIcon size={22} weight="fill" aria-hidden="true" />
              <span>
                <strong>Rejected before execution</strong>
                EQUITY_CLASS_LIMIT_EXCEEDED
              </span>
            </div>
            <p className={styles.exampleLabel}>
              Illustrative violation against the example policy above.
            </p>
          </Reveal>
        </div>
      </section>

      <section
        className={styles.responseSection}
        aria-labelledby="response-title"
      >
        <div className={styles.shell}>
          <Reveal className={styles.sectionHeading} mode="focus">
            <h2 id="response-title">Portfolios that can respond.</h2>
            <p>
              Monitor changing conditions, surface drift, and prepare a bounded
              rebalance without giving the model control of the wallet.
            </p>
          </Reveal>

          <StaggerGroup
            className={styles.responseRail}
            role="list"
            stagger={0.09}
          >
            {responseStages.map((stage, index) => (
              <StaggerItem key={stage.title} role="listitem" index={index}>
                <stage.icon size={24} weight="regular" aria-hidden="true" />
                <span>{stage.title}</span>
                <p>{stage.copy}</p>
              </StaggerItem>
            ))}
          </StaggerGroup>

          <Reveal
            className={styles.responseActions}
            mode="trace"
            direction="right"
          >
            <p>
              <strong>Market snapshot to execution outcome.</strong>
              Every boundary remains visible.
            </p>
            <Link className={styles.secondaryAction} href="/rebalance">
              Open rebalance
              <ArrowRightIcon size={18} weight="bold" aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
      </section>

      <section className={styles.finalSection} aria-labelledby="final-title">
        <div className={`${styles.shell} ${styles.finalPanel}`}>
          <Reveal mode="focus">
            <h2 id="final-title">Your mandate is the product.</h2>
            <p>
              Let intelligence propose. Keep calculation and authority inside
              rules you can inspect.
            </p>
          </Reveal>
          <div className={styles.finalActions}>
            <Link className={styles.primaryAction} href="/create">
              Build my RWA strategy
              <ArrowRightIcon size={18} weight="bold" aria-hidden="true" />
            </Link>
            <Link className={styles.textAction} href="/demo">
              View the demo flow
              <ArrowUpRightIcon size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
