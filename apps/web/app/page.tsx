import Link from "next/link";
import {
  ArrowRightIcon,
  BracketsCurlyIcon,
  CameraIcon,
  EyeIcon,
  FingerprintIcon,
  LockKeyIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react/dist/ssr";
import { HeroDevice } from "@/components/hero-device";
import { ProtocolMini } from "@/components/protocol-mini";
import { buttonClass, SectionHeading } from "@/components/ui";
import { FingerprintVisualization } from "@/components/fingerprint-visualization";

const exampleCommitment =
  "0x714cc16ae18881c9ae606e988b4b87380572d8daee7c5d9a198cd16d06101211";

export default function HomePage() {
  return (
    <>
      <section className="landing-hero shell-width">
        <div className="hero-copy">
          <p className="eyebrow">Proof of Physical State</p>
          <h1>Give smart contracts eyes.</h1>
          <p>
            AI verifies physical reality. Signed evidence makes it programmable
            on X Layer.
          </p>
          <div className="hero-actions">
            <Link
              className={`${buttonClass} button-primary`}
              href="/assets/register"
            >
              Register an asset <ArrowRightIcon size={17} weight="bold" />
            </Link>
            <Link className={`${buttonClass} button-secondary`} href="/demo">
              Try the demo
            </Link>
          </div>
        </div>
        <HeroDevice />
      </section>

      <section className="causal-band">
        <div className="shell-width">
          <ProtocolMini />
        </div>
      </section>

      <section className="page-section page-width landing-problem">
        <div className="problem-statement">
          <EyeIcon size={34} weight="duotone" />
          <h2>Ownership is visible. Physical condition is not.</h2>
          <p>
            A ledger can track a token while the object behind it is damaged,
            replaced, replayed from a photo, or gone.
          </p>
        </div>
        <div className="problem-cases">
          <article>
            <span>01</span>
            <strong>Identity</strong>
            <p>Is this sufficiently likely to be the same physical instance?</p>
          </article>
          <article>
            <span>02</span>
            <strong>Liveness</strong>
            <p>
              Did fresh observations satisfy an unpredictable challenge
              sequence?
            </p>
          </article>
          <article>
            <span>03</span>
            <strong>Change</strong>
            <p>What observable visual differences exist since registration?</p>
          </article>
          <article>
            <span>04</span>
            <strong>Settlement</strong>
            <p>Does the signed result satisfy the transaction policy?</p>
          </article>
        </div>
      </section>

      <section className="page-section evidence-section">
        <div className="page-width">
          <SectionHeading
            title="A private fingerprint, not a public surveillance feed."
            description="Raw inspection media stays offchain. Compact evidence commitments and signed outcomes cross the protocol boundary."
          />
          <div className="evidence-layout">
            <FingerprintVisualization
              hash={exampleCommitment}
              label="Example commitment visualization"
            />
            <div className="evidence-notes">
              <article>
                <CameraIcon size={25} />
                <div>
                  <h3>Observe from multiple views</h3>
                  <p>
                    Guided captures combine global similarity, local features,
                    identifiers, motion, freshness, and replay signals.
                  </p>
                </div>
              </article>
              <article>
                <FingerprintIcon size={25} />
                <div>
                  <h3>Commit without exposing media</h3>
                  <p>
                    The visual fingerprint remains offchain while a
                    deterministic hash anchors the registered state.
                  </p>
                </div>
              </article>
              <article>
                <ShieldCheckIcon size={25} />
                <div>
                  <h3>State uncertainty explicitly</h3>
                  <p>
                    Every decision carries bounded scores and reason codes.
                    ALIVE does not claim perfect authenticity.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="page-section page-width settlement-section">
        <SectionHeading
          title="Verification becomes a financial primitive."
          description="A fresh, single-use attestation can unlock escrow only when identity and liveness policies are satisfied."
        />
        <div className="settlement-grid">
          <div className="settlement-code">
            <BracketsCurlyIcon size={28} weight="duotone" />
            <code>
              <span>if (attestation.assetId == escrow.assetId)</span>
              <span>&amp;&amp; attestation.verified</span>
              <span>&amp;&amp; identityScore &gt;= policy.identity</span>
              <span>&amp;&amp; livenessScore &gt;= policy.liveness</span>
              <strong>release(payment)</strong>
            </code>
          </div>
          <div className="settlement-outcomes">
            <article>
              <LockKeyIcon size={25} />
              <span>Rejected or uncertain</span>
              <strong>Funds remain locked</strong>
            </article>
            <article className="accepted-outcome">
              <ShieldCheckIcon size={25} />
              <span>Fresh signed proof</span>
              <strong>Settlement permitted</strong>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-cta page-width">
        <div>
          <h2>Turn one physical object into verifiable state.</h2>
          <p>
            Start with a camera, a wallet, and an asset you can place in frame.
          </p>
        </div>
        <Link
          className={`${buttonClass} button-primary`}
          href="/assets/register"
        >
          Begin registration <ArrowRightIcon size={17} />
        </Link>
      </section>
    </>
  );
}
