"use client";

import {
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useRef, type ReactNode } from "react";
import { useSafeReducedMotion } from "./motion-system";

export function HeroScrollStage({
  art,
  copy,
  specs,
  topline,
}: {
  art: ReactNode;
  copy: ReactNode;
  specs: ReactNode;
  topline: ReactNode;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useSafeReducedMotion();
  const stationary = useMotionValue(0);
  const unitScale = useMotionValue(1);
  const fullOpacity = useMotionValue(1);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const progress = useSpring(scrollYProgress, {
    damping: 32,
    mass: 0.24,
    stiffness: 150,
  });
  const artY = useTransform(progress, [0, 1], [0, 120]);
  const artX = useTransform(progress, [0, 1], [0, 34]);
  const artScale = useTransform(progress, [0, 1], [1, 1.055]);
  const artOpacity = useTransform(progress, [0, 0.78, 1], [1, 0.82, 0.3]);
  const copyY = useTransform(progress, [0, 1], [0, -76]);
  const copyOpacity = useTransform(progress, [0, 0.68, 1], [1, 0.9, 0.3]);
  const specsX = useTransform(progress, [0, 1], [0, -28]);

  return (
    <section ref={sectionRef} className="landing-hero">
      <motion.div
        className="hero-art"
        aria-hidden="true"
        style={{
          opacity: reducedMotion ? fullOpacity : artOpacity,
          scale: reducedMotion ? unitScale : artScale,
          x: reducedMotion ? stationary : artX,
          y: reducedMotion ? stationary : artY,
        }}
      >
        {art}
      </motion.div>
      <div className="hero-grid shell-width">
        <div className="hero-topline">{topline}</div>
        <motion.div
          className="hero-copy"
          style={{
            opacity: reducedMotion ? fullOpacity : copyOpacity,
            y: reducedMotion ? stationary : copyY,
          }}
        >
          {copy}
        </motion.div>
        <motion.div style={{ x: reducedMotion ? stationary : specsX }}>
          {specs}
        </motion.div>
      </div>
      <motion.div
        className="hero-depth-line"
        aria-hidden="true"
        style={{ scaleX: reducedMotion ? unitScale : progress }}
      />
    </section>
  );
}

export function EvidenceScrollVisual({ children }: { children: ReactNode }) {
  const targetRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useSafeReducedMotion();
  const stationary = useMotionValue(0);
  const unitScale = useMotionValue(1);
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start 92%", "end 18%"],
  });
  const progress = useSpring(scrollYProgress, {
    damping: 30,
    mass: 0.28,
    stiffness: 145,
  });
  const y = useTransform(progress, [0, 0.55, 1], [32, 0, -18]);
  const rotate = useTransform(progress, [0, 0.55, 1], [-1.6, 0, 1.1]);
  const scale = useTransform(progress, [0, 0.55, 1], [0.96, 1, 0.985]);
  const scanY = useTransform(progress, [0, 1], ["4%", "92%"]);

  return (
    <motion.div
      ref={targetRef}
      className="evidence-motion-visual"
      style={{
        rotateZ: reducedMotion ? stationary : rotate,
        scale: reducedMotion ? unitScale : scale,
        y: reducedMotion ? stationary : y,
      }}
    >
      {children}
      <motion.span
        className="evidence-motion-scan"
        aria-hidden="true"
        style={{ top: reducedMotion ? "50%" : scanY }}
      />
      <div className="evidence-motion-readout" aria-hidden="true">
        <span>LOCAL STRUCTURE</span>
        <span>MULTI-VIEW CONSISTENCY</span>
        <span>COMMITMENT READY</span>
      </div>
    </motion.div>
  );
}
