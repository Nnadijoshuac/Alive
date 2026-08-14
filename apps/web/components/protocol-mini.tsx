"use client";

import {
  CameraIcon,
  CpuIcon,
  FingerprintIcon,
  SealCheckIcon,
  CurrencyCircleDollarIcon,
} from "@phosphor-icons/react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { useRef } from "react";
import { useHydrationSafeReducedMotion } from "@/lib/reduced-motion";

const points = [
  { icon: CameraIcon, label: "Physical capture" },
  { icon: CpuIcon, label: "Visual analysis" },
  { icon: FingerprintIcon, label: "Evidence commitment" },
  { icon: SealCheckIcon, label: "Signed attestation" },
  { icon: CurrencyCircleDollarIcon, label: "Payment outcome" },
];

export function ProtocolMini() {
  const chainRef = useRef<HTMLOListElement>(null);
  const reduceMotion = useHydrationSafeReducedMotion();
  const { scrollYProgress } = useScroll({
    target: chainRef,
    offset: ["start 88%", "end 48%"],
  });
  const easedProgress = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 24,
    mass: 0.45,
  });
  const lineScale = useTransform(easedProgress, [0, 1], [0.02, 1]);

  return (
    <ol
      ref={chainRef}
      className="protocol-mini"
      aria-label="ALIVE causal protocol chain"
    >
      <motion.span
        className="protocol-mini-progress"
        aria-hidden="true"
        style={{ scaleX: reduceMotion ? 1 : lineScale }}
      />
      {points.map(({ icon: Icon, label }, index) => (
        <motion.li
          key={label}
          initial={false}
          {...(reduceMotion ? {} : { whileHover: { y: -4 } })}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <span>
            <Icon size={20} weight="duotone" />
          </span>
          <small>{String(index + 1).padStart(2, "0")}</small>
          <strong>{label}</strong>
        </motion.li>
      ))}
    </ol>
  );
}
