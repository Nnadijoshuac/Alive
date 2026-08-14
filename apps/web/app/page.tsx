import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  LockKeyIcon,
  ScanIcon,
} from "@phosphor-icons/react/dist/ssr";
import { FingerprintVisualization } from "@/components/fingerprint-visualization";
import { HeroDevice } from "@/components/hero-device";
import {
  Reveal,
  ScrollParallax,
  StaggerGroup,
  StaggerItem,
} from "@/components/motion-system";
import { PolicyPreview } from "@/components/policy-preview";
import styles from "./page.module.css";

const proofStages = [
  {
    number: "01",
    title: "Capture",
    copy: "A fresh randomized camera challenge records the object presented now.",
  },
  {
    number: "02",
    title: "Analyze",
    copy: "Visual signals produce bounded scores, uncertainty, and reason codes.",
  },
  {
    number: "03",
    title: "Attest",
    copy: "The verifier signs the asset, subject, context, result, and expiry.",
  },
  {
    number: "04",
    title: "Validate",
    copy: "The contract checks authorization, policy, freshness, and binding.",
  },
  {
    number: "05",
    title: "Settle",
    copy: "A valid unused proof can permit the configured payment outcome.",
  },
] as const;

const privateEvidence = [
  "Raw camera captures",
  "Local feature vectors",
  "OCR and image-analysis output",
] as const;

const portableEvidence = [
  "Asset and fingerprint commitment",
  "Scores, verdict, and reason codes",
  "Context, subject, timestamps, and expiry",
] as const;

const chainStages = [
  ["Capture", "Observe a fresh physical presentation."],
  ["Analyze", "Measure similarity, quality, and liveness signals."],
  ["Attest", "Sign a bounded result with visible uncertainty."],
  ["Validate", "Check the proof against contract policy."],
  ["Settle", "Consume the proof before payment can move."],
] as const;

function Chapter({ number, children }: { number: string; children: string }) {
  return (
    <p className={styles.chapter}>
      <span>{number}</span>
      <i aria-hidden="true" />
      {children}
    </p>
  );
}

export default function HomePage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="alive-hero-title">
        <div className={`${styles.shell} ${styles.heroGrid}`}>
          <Reveal className={styles.heroCopy} mode="focus" duration={0.74}>
            <div>
              <p className={styles.eyebrow}>Proof of Physical State</p>
              <h1 id="alive-hero-title" className={styles.heroTitle}>
                Physical State,
                <em>On-Chain.</em>
              </h1>
            </div>

            <div className={styles.heroIntro}>
              <p>
                Fresh camera evidence becomes a bounded attestation a contract
                can enforce.
              </p>
              <div className={styles.actions}>
                <Link className={styles.primaryAction} href="/assets/register">
                  Register an asset
                  <ArrowRightIcon size={18} weight="bold" />
                </Link>
                <Link className={styles.secondaryAction} href="/protocol">
                  Explore protocol
                  <ArrowUpRightIcon size={17} />
                </Link>
              </div>
            </div>
          </Reveal>

          <Reveal
            className={styles.heroVisual}
            mode="aperture"
            delay={0.08}
            duration={0.86}
          >
            <HeroDevice />
            <div className={styles.visualCaption}>
              <span>Interactive inspection model</span>
              <span>Pointer + scroll reactive</span>
            </div>
          </Reveal>

          <dl className={styles.heroFacts}>
            <div>
              <dt>Physical input</dt>
              <dd>Fresh camera challenge</dd>
            </div>
            <div>
              <dt>Signed output</dt>
              <dd>Context-bound attestation</dd>
            </div>
            <div>
              <dt>Contract effect</dt>
              <dd>Policy-gated settlement</dd>
            </div>
          </dl>

          <p className={styles.heroCaveat}>
            Experimental camera-based verification estimates observable
            similarity and freshness. It does not certify authenticity or
            hidden condition.
          </p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="pipeline-title">
        <div className={styles.shell}>
          <Reveal className={styles.sectionHeading} mode="focus">
            <Chapter number="01">Proof pipeline</Chapter>
            <h2 id="pipeline-title">
              From capture to <em>contract decision.</em>
            </h2>
            <p>
              One causal chain connects the physical presentation to the final
              onchain outcome. Every boundary stays explicit.
            </p>
          </Reveal>

          <div className={styles.workflowGrid}>
            <StaggerGroup
              className={styles.stageList}
              role="list"
              stagger={0.07}
            >
              {proofStages.map((stage, index) => (
                <StaggerItem
                  className={styles.stage}
                  index={index}
                  key={stage.number}
                  mode="quiet"
                  role="listitem"
                >
                  <span>{stage.number}</span>
                  <div>
                    <h3>{stage.title}</h3>
                    <p>{stage.copy}</p>
                  </div>
                </StaggerItem>
              ))}
            </StaggerGroup>

            <Reveal className={styles.workflowMedia} mode="wipe" direction="up">
              <ScrollParallax className={styles.mediaParallax} range={[18, -18]}>
                <Image
                  src="/media/alive/inspection-studio.jpg"
                  alt="Concept visualization of a wristwatch and laptop prepared for a camera inspection"
                  fill
                  sizes="(max-width: 900px) 100vw, 58vw"
                />
              </ScrollParallax>
              <div className={styles.scanSweep} aria-hidden="true" />
              <p className={styles.mediaCaption}>
                Concept visualization <span>Not a verification result</span>
              </p>
            </Reveal>
          </div>

          <Reveal className={styles.invariants} mode="trace" direction="right">
            <div>
              <ScanIcon size={22} />
              <span>
                <strong>Evidence offchain</strong>
                Raw inspection media stays outside the ledger.
              </span>
            </div>
            <div>
              <LockKeyIcon size={22} />
              <span>
                <strong>Attestations expire</strong>
                Every signed result has a short validity window.
              </span>
            </div>
            <div>
              <CheckCircleIcon size={22} />
              <span>
                <strong>Sessions are single use</strong>
                Consumed proofs cannot settle a second time.
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.boundarySection}`}
        aria-labelledby="boundary-title"
      >
        <div className={styles.shell}>
          <Reveal className={styles.boundaryHeading} mode="focus">
            <Chapter number="02">Evidence boundary</Chapter>
            <h2 id="boundary-title">
              Media stays offchain.
              <em>The signed result can travel.</em>
            </h2>
          </Reveal>

          <div className={styles.boundaryGrid}>
            <Reveal className={styles.boundaryMedia} mode="aperture">
              <ScrollParallax className={styles.mediaParallax} range={[20, -20]}>
                <Image
                  src="/media/alive/evidence-boundary-v2.webp"
                  alt="Concept visualization of a worn black watch and laptop surface crossed by a green inspection line"
                  fill
                  sizes="(max-width: 900px) 100vw, 57vw"
                />
              </ScrollParallax>
              <p className={styles.mediaCaption}>
                Observable surface detail <span>Concept visualization</span>
              </p>
            </Reveal>

            <Reveal className={styles.boundaryCopy} mode="trace" direction="left">
              <p className={styles.boundaryIntro}>
                The verifier retains the evidence it needs for analysis.
                Contracts receive only the commitment and signed decision they
                need for policy enforcement.
              </p>
              <div className={styles.boundaryLists}>
                <div>
                  <h3>Kept offchain</h3>
                  <ul>
                    {privateEvidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Committed or signed</h3>
                  <ul>
                    {portableEvidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className={styles.uncertaintyNote}>
                Reason codes and uncertainty remain visible in the verifier
                result.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.policySection}`}
        aria-labelledby="policy-title"
      >
        <div className={styles.shell}>
          <Reveal className={styles.sectionHeading} mode="focus">
            <Chapter number="03">Settlement policy</Chapter>
            <h2 id="policy-title">
              Set the policy. <em>Let proof decide release.</em>
            </h2>
            <p>
              Explore the shape of an escrow policy. The controls below change
              configuration only; they do not simulate or run verification.
            </p>
          </Reveal>
          <Reveal className={styles.policyWrap} mode="aperture" delay={0.08}>
            <PolicyPreview />
          </Reveal>
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.chainSection}`}
        aria-labelledby="chain-title"
      >
        <div className={styles.shell}>
          <Reveal className={styles.chainHeading} mode="focus">
            <Chapter number="04">One causal chain</Chapter>
            <h2 id="chain-title">
              Observed state becomes
              <em>a contract decision.</em>
            </h2>
          </Reveal>

          <div className={styles.chainVisual}>
            <Reveal className={styles.fingerprintFrame} mode="aperture">
              <FingerprintVisualization
                hash="alive-conceptual-evidence-geometry"
                label="Illustrative evidence geometry"
              />
              <span className={styles.orbit} aria-hidden="true" />
              <p>Illustrative geometry—not a live verification result.</p>
            </Reveal>

            <StaggerGroup className={styles.chainRail} role="list" stagger={0.06}>
              {chainStages.map(([title, copy], index) => (
                <StaggerItem
                  index={index}
                  key={title}
                  mode="quiet"
                  role="listitem"
                >
                  <span>0{index + 1}</span>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </div>

          <Reveal className={styles.finalCta} mode="wipe" direction="up">
            <div>
              <p>Start with one object.</p>
              <span>
                Create an offchain baseline, then walk through the complete
                proof flow.
              </span>
            </div>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} href="/assets/register">
                Begin registration
                <ArrowRightIcon size={18} weight="bold" />
              </Link>
              <Link className={styles.secondaryAction} href="/dashboard">
                Open dashboard
                <ArrowUpRightIcon size={17} />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
