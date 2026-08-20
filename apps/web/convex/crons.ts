import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Schedule trigger-oriented Agent check every 5 minutes
// Adheres to $0 free-tier discipline by performing cheap delta checks first
crons.interval(
  "autonomous-agent-cycle",
  { minutes: 5 },
  internal.scheduler.scheduledAgentCycle,
  {}
);

export default crons;
