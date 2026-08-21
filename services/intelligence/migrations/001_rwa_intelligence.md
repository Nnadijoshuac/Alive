# Intelligence schema v1

The executable migration is versioned in `src/repository.ts` so it ships with the compiled service.
Version 1 creates the required MVP records for assets, asset sources, market quotes,
market snapshots, policies, policy versions, portfolio proposals, vaults, holdings,
strategy proposals, executions, and risk snapshots.

SQLite stores canonical structured objects as validated JSON alongside indexed identity,
status, provider, and timestamp columns. Application code validates every object with the
shared strict schemas before it enters or leaves the repository.
