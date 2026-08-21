"use client";

import {
  MotionConfig,
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  type HTMLMotionProps,
  type MotionValue,
  type UseScrollOptions,
  type Variants,
} from "motion/react";
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type Ref,
} from "react";
import { useHydrationSafeReducedMotion } from "@/lib/reduced-motion";

const ARRIVAL_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EXIT_EASE: [number, number, number, number] = [0.4, 0, 1, 1];

type RevealState = "concealed" | "visible";

export type RevealMode = "aperture" | "focus" | "trace" | "wipe";
export type RevealDirection = "down" | "left" | "right" | "up";
export type StaggerItemMode = "focus" | "quiet" | "trace" | "wipe";

export interface ProgressiveRevealOptions {
  /** Fraction of the element that must enter the viewport. */
  amount?: number | undefined;
  disabled?: boolean | undefined;
  /** IntersectionObserver root margin. */
  margin?: string | undefined;
  once?: boolean | undefined;
}

export interface ProgressiveRevealResult<T extends HTMLElement> {
  isVisible: boolean;
  reducedMotion: boolean;
  ref: React.RefObject<T | null>;
  state: RevealState;
}

/**
 * Returns `true` during SSR and the first hydrated frame, then resolves the
 * user's preference. This keeps motion-dependent markup deterministic and
 * prevents a pre-hydration flash of concealed content.
 */
export function useSafeReducedMotion(): boolean {
  const prefersReducedMotion = useHydrationSafeReducedMotion();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window.requestAnimationFrame !== "function") {
      const timeout = window.setTimeout(() => setHydrated(true), 0);
      return () => window.clearTimeout(timeout);
    }

    const frame = window.requestAnimationFrame(() => setHydrated(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return !hydrated || prefersReducedMotion;
}

/**
 * Progressive-enhancement viewport state. Content starts visible in the
 * server response; only offscreen content is armed for a reveal after mount.
 */
export function useProgressiveReveal<T extends HTMLElement>({
  amount = 0.14,
  disabled = false,
  margin = "0px 0px -10% 0px",
  once = true,
}: ProgressiveRevealOptions = {}): ProgressiveRevealResult<T> {
  const ref = useRef<T>(null);
  const reducedMotion = useSafeReducedMotion();
  const [state, setState] = useState<RevealState>("visible");

  useEffect(() => {
    const node = ref.current;

    if (
      !node ||
      disabled ||
      reducedMotion ||
      typeof IntersectionObserver === "undefined"
    ) {
      setState("visible");
      return;
    }

    const bounds = node.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const isAlreadyVisible =
      bounds.bottom < 0 ||
      (bounds.top <= viewportHeight * 0.96 && bounds.bottom >= 0);

    if (isAlreadyVisible) {
      setState("visible");
      return;
    }

    setState("concealed");

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;

        // A fast anchor/keyboard jump can move an armed element from below the
        // viewport to above it without ever producing an intersecting frame.
        // Treat that as revealed so content cannot remain permanently clipped.
        if (entry.isIntersecting || entry.boundingClientRect.bottom <= 0) {
          setState("visible");
          if (once) observer.disconnect();
        } else if (!once) {
          setState("concealed");
        }
      },
      {
        rootMargin: margin,
        threshold: Math.min(Math.max(amount, 0), 0.35),
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [amount, disabled, margin, once, reducedMotion]);

  return {
    isVisible: state === "visible",
    reducedMotion,
    ref,
    state,
  };
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

function useMergedRef<T>(...refs: Array<Ref<T> | undefined>): Ref<T> {
  const refsRef = useRef(refs);
  refsRef.current = refs;

  return useMemo(
    () => (value: T | null) => {
      refsRef.current.forEach((ref) => assignRef(ref, value));
    },
    [],
  );
}

function concealedClip(direction: RevealDirection): string {
  switch (direction) {
    case "down":
      return "inset(100% 0% 0% 0% round 12px)";
    case "left":
      return "inset(0% 0% 0% 100% round 12px)";
    case "right":
      return "inset(0% 100% 0% 0% round 12px)";
    case "up":
    default:
      return "inset(0% 0% 100% 0% round 12px)";
  }
}

function revealVariants(
  mode: RevealMode,
  direction: RevealDirection,
  duration: number,
  delay: number,
): Variants {
  const visible = {
    clipPath: "inset(0% 0% 0% 0% round 0px)",
    filter: "blur(0px)",
    opacity: 1,
    scale: 1,
    transition: {
      delay,
      duration,
      ease: ARRIVAL_EASE,
    },
  };

  const concealedByMode = {
    aperture: {
      clipPath: "inset(7% 5% 7% 5% round 18px)",
      filter: "blur(8px)",
      opacity: 0.35,
      scale: 0.992,
    },
    focus: {
      clipPath: "inset(0% 0% 0% 0% round 0px)",
      filter: "blur(12px)",
      opacity: 0.18,
      scale: 0.988,
    },
    trace: {
      clipPath: concealedClip(direction),
      filter: "blur(3px)",
      opacity: 0.72,
      scale: 1,
    },
    wipe: {
      clipPath: concealedClip(direction),
      filter: "blur(0px)",
      opacity: 1,
      scale: 1,
    },
  } satisfies Record<RevealMode, object>;

  return {
    concealed: {
      ...concealedByMode[mode],
      transition: {
        duration: Math.min(duration * 0.45, 0.22),
        ease: EXIT_EASE,
      },
    },
    visible,
  };
}

type ControlledMotionProps = "animate" | "initial" | "transition" | "variants";

export interface RevealProps extends Omit<
  HTMLMotionProps<"div">,
  ControlledMotionProps
> {
  amount?: number;
  delay?: number;
  direction?: RevealDirection;
  disabled?: boolean;
  duration?: number;
  margin?: string;
  mode?: RevealMode;
  once?: boolean;
}

/**
 * A directional, scanner-like reveal. It intentionally renders in its visible
 * state on the server and only conceals content that is still below the fold.
 */
export const Reveal = forwardRef<HTMLDivElement, RevealProps>(function Reveal(
  {
    amount,
    delay = 0,
    direction = "right",
    disabled,
    duration = 0.62,
    margin,
    mode = "aperture",
    once,
    ...props
  },
  forwardedRef,
) {
  const reveal = useProgressiveReveal<HTMLDivElement>({
    amount,
    disabled,
    margin,
    once,
  });
  const mergedRef = useMergedRef(reveal.ref, forwardedRef);
  const variants = useMemo(
    () =>
      revealVariants(
        mode,
        direction,
        Math.min(Math.max(duration, 0.2), 0.9),
        Math.min(Math.max(delay, 0), 0.4),
      ),
    [delay, direction, duration, mode],
  );

  return (
    <motion.div
      {...props}
      ref={mergedRef}
      initial={false}
      animate={reveal.state}
      variants={variants}
      data-motion-state={reveal.state}
    />
  );
});

interface StaggerContextValue {
  reducedMotion: boolean;
}

const StaggerContext = createContext<StaggerContextValue>({
  reducedMotion: true,
});

export interface StaggerGroupProps extends Omit<
  HTMLMotionProps<"div">,
  ControlledMotionProps
> {
  amount?: number;
  delay?: number;
  disabled?: boolean;
  margin?: string;
  once?: boolean;
  order?: "forward" | "reverse";
  stagger?: number;
}

/** Use only when the children form a meaningful sequence or list. */
export const StaggerGroup = forwardRef<HTMLDivElement, StaggerGroupProps>(
  function StaggerGroup(
    {
      amount,
      delay = 0,
      disabled,
      margin,
      once,
      order = "forward",
      stagger = 0.075,
      ...props
    },
    forwardedRef,
  ) {
    const reveal = useProgressiveReveal<HTMLDivElement>({
      amount,
      disabled,
      margin,
      once,
    });
    const mergedRef = useMergedRef(reveal.ref, forwardedRef);
    const groupVariants = useMemo<Variants>(
      () => ({
        concealed: {
          transition: {
            staggerChildren: Math.min(stagger, 0.12),
            staggerDirection: order === "forward" ? -1 : 1,
          },
        },
        visible: {
          transition: {
            delayChildren: Math.min(Math.max(delay, 0), 0.3),
            staggerChildren: Math.min(Math.max(stagger, 0.02), 0.12),
            staggerDirection: order === "forward" ? 1 : -1,
          },
        },
      }),
      [delay, order, stagger],
    );

    return (
      <StaggerContext.Provider value={{ reducedMotion: reveal.reducedMotion }}>
        <motion.div
          {...props}
          ref={mergedRef}
          initial={false}
          animate={reveal.state}
          variants={groupVariants}
          data-motion-state={reveal.state}
        />
      </StaggerContext.Provider>
    );
  },
);

export interface StaggerItemProps extends Omit<
  HTMLMotionProps<"div">,
  "transition" | "variants"
> {
  index?: number;
  mode?: StaggerItemMode;
}

function staggerModeForIndex(index: number): StaggerItemMode {
  return (["trace", "focus", "wipe"] as const)[Math.abs(index) % 3] ?? "trace";
}

function staggerItemVariants(mode: StaggerItemMode): Variants {
  const concealedByMode = {
    focus: {
      clipPath: "inset(0% 0% 0% 0% round 0px)",
      filter: "blur(9px)",
      opacity: 0.18,
      scale: 0.992,
    },
    quiet: {
      clipPath: "inset(0% 0% 0% 0% round 0px)",
      filter: "blur(4px)",
      opacity: 0,
      scale: 1,
    },
    trace: {
      clipPath: "inset(0% 100% 0% 0% round 10px)",
      filter: "blur(2px)",
      opacity: 0.7,
      scale: 1,
    },
    wipe: {
      clipPath: "inset(100% 0% 0% 0% round 10px)",
      filter: "blur(0px)",
      opacity: 1,
      scale: 1,
    },
  } satisfies Record<StaggerItemMode, object>;

  return {
    concealed: concealedByMode[mode],
    visible: {
      clipPath: "inset(0% 0% 0% 0% round 0px)",
      filter: "blur(0px)",
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.54,
        ease: ARRIVAL_EASE,
      },
    },
  };
}

export const StaggerItem = forwardRef<HTMLDivElement, StaggerItemProps>(
  function StaggerItem({ index = 0, mode, ...props }, ref) {
    const { reducedMotion } = useContext(StaggerContext);
    const resolvedMode = mode ?? staggerModeForIndex(index);

    return (
      <motion.div
        {...props}
        ref={ref}
        {...(reducedMotion
          ? {}
          : { variants: staggerItemVariants(resolvedMode) })}
      />
    );
  },
);

export interface PageScrollSignal {
  progress: MotionValue<number>;
  rawProgress: MotionValue<number>;
  reducedMotion: boolean;
  scrollY: MotionValue<number>;
}

/** A shared, damped page-scroll signal suitable for UI or Three.js state. */
export function usePageScrollSignal(): PageScrollSignal {
  const reducedMotion = useSafeReducedMotion();
  const { scrollY, scrollYProgress } = useScroll();
  const smoothedProgress = useSpring(scrollYProgress, {
    damping: 34,
    mass: 0.22,
    stiffness: 170,
  });

  return {
    progress: reducedMotion ? scrollYProgress : smoothedProgress,
    rawProgress: scrollYProgress,
    reducedMotion,
    scrollY,
  };
}

export interface ScrollProgressProps extends Omit<
  HTMLMotionProps<"div">,
  "children"
> {
  color?: string;
  thickness?: number;
}

/** Decorative global page-depth indicator. */
export function ScrollProgress({
  color = "var(--accent)",
  style,
  thickness = 2,
  ...props
}: ScrollProgressProps) {
  const { progress } = usePageScrollSignal();

  return (
    <motion.div
      aria-hidden="true"
      {...props}
      style={{
        position: "fixed",
        inset: "0 0 auto 0",
        zIndex: 80,
        height: Math.max(1, thickness),
        pointerEvents: "none",
        transformOrigin: "0% 50%",
        backgroundColor: color,
        scaleX: progress,
        ...style,
      }}
    />
  );
}

export interface ScrollParallaxProps extends Omit<
  HTMLMotionProps<"div">,
  "style"
> {
  axis?: "x" | "y";
  disabled?: boolean;
  offset?: UseScrollOptions["offset"];
  range?: readonly [number, number];
  style?: HTMLMotionProps<"div">["style"];
}

/**
 * Scroll-linked spatial continuity for a bounded visual layer. Avoid wrapping
 * reading text or controls: this primitive is intended for art and diagrams.
 */
export const ScrollParallax = forwardRef<HTMLDivElement, ScrollParallaxProps>(
  function ScrollParallax(
    {
      axis = "y",
      disabled = false,
      offset = ["start end", "end start"],
      range = [24, -24],
      style,
      ...props
    },
    forwardedRef,
  ) {
    const targetRef = useRef<HTMLDivElement>(null);
    const mergedRef = useMergedRef(targetRef, forwardedRef);
    const reducedMotion = useSafeReducedMotion();
    const stationary = useMotionValue(0);
    const { scrollYProgress } = useScroll({
      target: targetRef,
      offset,
    });
    const displacement = useTransform(
      scrollYProgress,
      [0, 1],
      [range[0], range[1]],
    );
    const smoothedDisplacement = useSpring(displacement, {
      damping: 32,
      mass: 0.28,
      stiffness: 140,
    });
    const position =
      disabled || reducedMotion ? stationary : smoothedDisplacement;
    const axisStyle = axis === "x" ? { x: position } : { y: position };

    return (
      <motion.div
        {...props}
        ref={mergedRef}
        style={{ ...style, ...axisStyle }}
      />
    );
  },
);

export interface MotionSurfaceProps extends Omit<
  HTMLMotionProps<"div">,
  "transition" | "whileHover" | "whileTap"
> {
  feedback?: "press" | "quiet";
}

/** Tactile feedback for an already-interactive card or surface. */
export const MotionSurface = forwardRef<HTMLDivElement, MotionSurfaceProps>(
  function MotionSurface({ feedback = "quiet", ...props }, ref) {
    const reducedMotion = useSafeReducedMotion();
    const hover =
      feedback === "press" ? { scale: 1.006, y: -2 } : { scale: 1.003, y: -1 };

    return (
      <motion.div
        {...props}
        ref={ref}
        {...(reducedMotion
          ? {}
          : {
              whileHover: hover,
              whileTap: { scale: 0.994, y: 0 },
            })}
        transition={{ duration: 0.18, ease: ARRIVAL_EASE }}
      />
    );
  },
);

export type MotionButtonProps = Omit<
  HTMLMotionProps<"button">,
  "transition" | "whileHover" | "whileTap"
>;

/** Button feedback that preserves native disabled and keyboard behavior. */
export const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>(
  function MotionButton({ disabled, ...props }, ref) {
    const reducedMotion = useSafeReducedMotion();
    const canRespond = !disabled && !reducedMotion;

    return (
      <motion.button
        {...props}
        ref={ref}
        disabled={disabled ?? false}
        {...(canRespond
          ? {
              whileHover: { scale: 1.012, y: -1 },
              whileTap: { scale: 0.982, y: 0 },
            }
          : {})}
        transition={{ duration: 0.15, ease: ARRIVAL_EASE }}
      />
    );
  },
);

/** Optional root wrapper for consistent user-preference handling. */
export function AliveMotionProvider({ children }: PropsWithChildren) {
  return (
    <MotionConfig reducedMotion="user" transition={{ ease: ARRIVAL_EASE }}>
      {children}
    </MotionConfig>
  );
}
