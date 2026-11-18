export { Scheduler, sanitizeError } from './scheduler.ts';
export type { SchedulerJob, SchedulerJobStatus, SchedulerOptions } from './scheduler.ts';
export { buildSchedulerJobs, nextCotCheck, nextFxRefresh } from './jobs.ts';
export type { SchedulerDeps } from './jobs.ts';

export function isSchedulerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.SCHEDULER_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}
