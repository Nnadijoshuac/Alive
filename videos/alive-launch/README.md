# ALIVE launch video

This package contains the independently renderable 40-second, 16:9 ALIVE product launch composition requested for the hackathon submission and social reuse.

The still in `public/forensic-laptop.png` is an original generated project asset. It is used as a clearly illustrative scanner scene, not as evidence of an actual verification.

```bash
pnpm --filter @alive/launch-video dev
pnpm --filter @alive/launch-video render
```

The final render is written to `renders/alive-launch.mp4`, which is ignored by Git.
