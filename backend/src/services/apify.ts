import { config } from '../config.js';
import { ApifyRun, ApifyState, Property } from '../db/models.js';
import { logger } from '../logger.js';
import { budgetAllows, buildTarget, buildTargets, dedupe, mapMagicBricksItem, SOURCE, type ScrapeTarget, type TargetMode } from './apifyMap.js';

/**
 * Apify → Backend → MongoDB.
 * Every APIFY_SYNC_INTERVAL_MIN minutes: collect finished actor runs and upsert their listings,
 * mark listings that dropped out of their search as inactive, record the last successful sync,
 * then start the next scrape if the budget allows. The API token never leaves the backend.
 */

const API = 'https://api.apify.com/v2';
/** Public queries use this: only live, active listings — never the old demo data. */
export const LIVE_FILTER = { source: SOURCE, active: true } as const;

export function apifyConfigured(): boolean {
  return config.APIFY_ENABLED && Boolean(config.APIFY_API_TOKEN);
}

async function apify<T = any>(path: string, init: RequestInit = {}, timeoutMs = 30000): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.APIFY_API_TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Apify ${init.method ?? 'GET'} ${path.split('?')[0]} → HTTP ${res.status}: ${text.slice(0, 160)}`);
  return (text ? JSON.parse(text) : null) as T;
}

const targets = () => buildTargets(config.APIFY_CITIES.split(','), config.APIFY_MAX_RESULTS);
const estRunUsd = () => config.APIFY_MAX_RESULTS * config.APIFY_PRICE_PER_RESULT_USD + 0.0001;

async function state() {
  return (await ApifyState.findOneAndUpdate({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { upsert: true, new: true }))!;
}

async function usage(): Promise<{ usageUsd: number; limitUsd: number | null; cycleStart: Date; cycleEnd: Date }> {
  const r = await apify<{ data: any }>('/users/me/limits');
  const d = r.data;
  return {
    usageUsd: Number(d?.current?.monthlyUsageUsd ?? 0),
    limitUsd: d?.limits?.maxMonthlyUsageUsd ?? null,
    cycleStart: new Date(d?.monthlyUsageCycle?.startAt ?? Date.now() - 15 * 864e5),
    cycleEnd: new Date(d?.monthlyUsageCycle?.endAt ?? Date.now() + 15 * 864e5),
  };
}

async function startRun(t: ScrapeTarget, reason: 'scheduled' | 'bootstrap' | 'on-demand') {
  const r = await apify<{ data: { id: string; defaultDatasetId: string; status: string } }>(
    `/acts/${encodeURIComponent(config.APIFY_ACTOR)}/runs?memory=1024&timeout=300`,
    { method: 'POST', body: JSON.stringify(t.input) },
  );
  await ApifyRun.create({ runId: r.data.id, datasetId: r.data.defaultDatasetId, target: t.key, input: t.input, status: r.data.status, reason });
  await ApifyState.updateOne({ key: 'main' }, { $set: { lastRunStartedAt: new Date() } });
  logger.info({ target: t.key, runId: r.data.id, reason }, 'Apify scrape started');
}

/** Upsert a finished run's listings; deactivate listings of the same target that are no longer present. */
async function processRun(runDoc: InstanceType<typeof ApifyRun>, target: ScrapeTarget) {
  const items = await apify<Record<string, any>[]>(`/datasets/${runDoc.datasetId}/items?clean=true&format=json&limit=1000`, {}, 60000);
  const now = new Date();
  const mapped = dedupe(items.map((i) => mapMagicBricksItem(i, target, now)).filter((p): p is NonNullable<typeof p> => Boolean(p)));
  runDoc.items = items.length;
  if (!mapped.length) {
    // An empty result is treated as a failed scrape (portal blocked / timeout): keep existing data.
    runDoc.status = 'PROCESS_FAILED';
    runDoc.error = items.length ? 'no usable listings in dataset' : 'empty dataset';
    runDoc.finishedAt = now;
    await runDoc.save();
    logger.warn({ target: target.key, runId: runDoc.runId, items: items.length }, 'Apify run returned no usable listings — kept existing data');
    return;
  }
  let upserted = 0;
  for (const p of mapped) {
    const { slug, ...fields } = p;
    const res = await Property.updateOne(
      { source: SOURCE, externalId: p.externalId },
      { $set: { ...fields, active: true, inactiveAt: null, lastSeenAt: now }, $setOnInsert: { slug, firstSeenAt: now } },
      { upsert: true },
    );
    if (res.upsertedCount || res.modifiedCount) upserted++;
  }
  const seen = mapped.map((p) => p.externalId);
  const gone = await Property.updateMany({ source: SOURCE, target: target.key, active: true, externalId: { $nin: seen } }, { $set: { active: false, inactiveAt: now } });
  runDoc.status = 'PROCESSED';
  runDoc.upserted = upserted;
  runDoc.deactivated = gone.modifiedCount;
  runDoc.finishedAt = now;
  await runDoc.save();
  await ApifyState.updateOne({ key: 'main' }, { $set: { lastSuccessfulSyncAt: now, [`targetsLastSuccess.${target.key.replace(/\./g, '_')}`]: now } });
  logger.info({ target: target.key, items: items.length, listings: mapped.length, upserted, deactivated: gone.modifiedCount }, 'Apify listings synced');
}

/** Poll runs we started; process the ones that finished. */
async function collectRuns() {
  const pending = await ApifyRun.find({ status: { $in: ['READY', 'RUNNING'] } });
  for (const run of pending) {
    const r = await apify<{ data: { status: string; usageTotalUsd?: number; statusMessage?: string } }>(`/actor-runs/${run.runId}`);
    const st = r.data.status;
    if (st === 'READY' || st === 'RUNNING') {
      if (Date.now() - run.startedAt.getTime() > 20 * 60_000) {
        await apify(`/actor-runs/${run.runId}/abort`, { method: 'POST' }).catch(() => null);
        run.status = 'ABORTED';
        run.error = 'aborted after 20 minutes';
        await run.save();
      }
      continue;
    }
    run.costUsd = Number(r.data.usageTotalUsd ?? 0);
    const [mode, ...cityParts] = run.target.split(':');
    const target = buildTarget(mode as TargetMode, cityParts.join(':'), Number((run.input as any)?.maxResults ?? config.APIFY_MAX_RESULTS));
    target.input = run.input as Record<string, unknown>;
    if (st === 'SUCCEEDED') {
      try {
        await processRun(run, target);
      } catch (e) {
        run.status = 'PROCESS_FAILED';
        run.error = (e as Error).message.slice(0, 300);
        run.finishedAt = new Date();
        await run.save();
      }
    } else {
      run.status = st; // FAILED / TIMED-OUT / ABORTED
      run.error = r.data.statusMessage ?? st;
      run.finishedAt = new Date();
      await run.save();
      logger.warn({ target: run.target, runId: run.runId, status: st }, 'Apify run did not succeed — kept existing data');
    }
  }
}

/** Pick what to scrape next: never-fetched targets first (bootstrap), then the stalest target. */
async function maybeStartScrape() {
  const running = await ApifyRun.countDocuments({ status: { $in: ['READY', 'RUNNING'] } });
  if (running >= 2) return;
  const st = await state();
  const lastOk = (st.targetsLastSuccess ?? {}) as Record<string, string>;
  const inFlight = new Set((await ApifyRun.find({ status: { $in: ['READY', 'RUNNING'] } }, { target: 1 }).lean()).map((r) => r.target));
  const recentFails = new Set(
    (await ApifyRun.find({ status: { $nin: ['READY', 'RUNNING', 'PROCESSED'] }, finishedAt: { $gt: new Date(Date.now() - 60 * 60_000) } }, { target: 1 }).lean()).map((r) => r.target),
  );
  const all = targets().filter((t) => !inFlight.has(t.key) && !recentFails.has(t.key));
  if (!all.length) return;
  const never = all.filter((t) => !lastOk[t.key.replace(/\./g, '_')]);
  const u = await usage();
  await ApifyState.updateOne({ key: 'main' }, { $set: { monthlyUsageUsd: u.usageUsd, monthlyLimitUsd: u.limitUsd } });
  const slots = 2 - running;
  if (never.length) {
    for (const t of never.slice(0, slots)) {
      const b = budgetAllows({ ...u, budgetUsd: config.APIFY_MONTHLY_BUDGET_USD, now: new Date(), estimatedRunUsd: estRunUsd(), bootstrap: true });
      if (!b.ok) return logger.warn({ usage: u.usageUsd, cap: b.capUsd }, 'Apify budget cap reached — not starting new scrapes');
      await startRun(t, 'bootstrap');
      u.usageUsd += estRunUsd();
    }
    return;
  }
  const stalest = [...all].sort((a, b) => new Date(lastOk[a.key.replace(/\./g, '_')]).getTime() - new Date(lastOk[b.key.replace(/\./g, '_')]).getTime())[0];
  const b = budgetAllows({ ...u, budgetUsd: config.APIFY_MONTHLY_BUDGET_USD, now: new Date(), estimatedRunUsd: estRunUsd() });
  if (!b.ok) {
    logger.debug({ usage: u.usageUsd.toFixed(3), allowed: b.allowedUsd.toFixed(3) }, 'Apify scrape deferred (budget pacing)');
    return;
  }
  await startRun(stalest, 'scheduled');
}

let ticking = false;
/** One sync cycle. Errors are recorded; the website keeps serving the last synced data. */
export async function apifyTick(): Promise<void> {
  if (!apifyConfigured() || ticking) return;
  ticking = true;
  try {
    await ApifyState.updateOne({ key: 'main' }, { $set: { lastTickAt: new Date() } }, { upsert: true });
    await collectRuns();
    await maybeStartScrape();
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await ApifyState.updateOne({ key: 'main' }, { $set: { lastError: msg, lastErrorAt: new Date() } }).catch(() => null);
    logger.warn({ err: msg }, 'Apify sync failed — serving last synced data');
  } finally {
    ticking = false;
  }
}

/**
 * Chatbot / lead asked for a city+mode we have no fresh data for: queue a targeted scrape
 * (budget permitting). The reply uses what is in MongoDB right now; the broker gets fresh data.
 */
export async function requestFreshData(city: string, intent: string): Promise<void> {
  if (!apifyConfigured() || !city || !/^[a-z .'-]{2,40}$/i.test(city)) return;
  const mode: TargetMode = intent === 'renter' ? 'rent' : intent === 'investor' ? 'invest' : 'buy';
  const t = buildTarget(mode, city, config.APIFY_MAX_RESULTS);
  const st = await state();
  const last = (st.targetsLastSuccess ?? {})[t.key.replace(/\./g, '_')] as string | undefined;
  if (last && Date.now() - new Date(last).getTime() < 6 * 60 * 60_000) return;
  if (await ApifyRun.exists({ target: t.key, status: { $in: ['READY', 'RUNNING'] } })) return;
  if (await ApifyRun.exists({ target: t.key, finishedAt: { $gt: new Date(Date.now() - 60 * 60_000) }, status: { $ne: 'PROCESSED' } })) return;
  try {
    const u = await usage();
    const b = budgetAllows({ ...u, budgetUsd: config.APIFY_MONTHLY_BUDGET_USD, now: new Date(), estimatedRunUsd: estRunUsd(), bootstrap: true });
    if (b.ok) await startRun(t, 'on-demand');
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'on-demand Apify scrape not started');
  }
}

export async function apifyStatus() {
  const st = await ApifyState.findOne({ key: 'main' }).lean();
  const [active, inactive, running, lastRun] = await Promise.all([
    Property.countDocuments(LIVE_FILTER),
    Property.countDocuments({ source: SOURCE, active: false }),
    ApifyRun.countDocuments({ status: { $in: ['READY', 'RUNNING'] } }),
    ApifyRun.findOne().sort({ startedAt: -1 }).lean(),
  ]);
  return {
    configured: apifyConfigured(),
    actor: config.APIFY_ACTOR,
    source: 'MagicBricks (via Apify)',
    syncIntervalMin: config.APIFY_SYNC_INTERVAL_MIN,
    lastSuccessfulSyncAt: st?.lastSuccessfulSyncAt ?? null,
    lastTickAt: st?.lastTickAt ?? null,
    lastError: st?.lastError ?? null,
    lastErrorAt: st?.lastErrorAt ?? null,
    monthlyUsageUsd: st?.monthlyUsageUsd ?? null,
    budgetUsd: config.APIFY_MONTHLY_BUDGET_USD,
    activeListings: active,
    inactiveListings: inactive,
    runningScrapes: running,
    lastRun: lastRun ? { target: lastRun.target, status: lastRun.status, startedAt: lastRun.startedAt, items: lastRun.items } : null,
  };
}

let timer: NodeJS.Timeout | null = null;
export function startApifyScheduler(): void {
  if (timer) return;
  if (!apifyConfigured()) {
    logger.warn('APIFY_API_TOKEN not set — live property sync disabled (website shows no listings)');
    return;
  }
  // The old sample listings must never appear on the website.
  void Property.updateMany({ source: { $in: ['demo', null] }, active: { $ne: false } }, { $set: { active: false, source: 'demo', inactiveAt: new Date() } })
    .then((r) => r.modifiedCount && logger.info({ count: r.modifiedCount }, 'demo properties deactivated'))
    .catch(() => null);
  setTimeout(() => void apifyTick(), 5000);
  timer = setInterval(() => void apifyTick(), config.APIFY_SYNC_INTERVAL_MIN * 60_000);
  logger.info({ everyMin: config.APIFY_SYNC_INTERVAL_MIN, actor: config.APIFY_ACTOR, budgetUsd: config.APIFY_MONTHLY_BUDGET_USD }, 'Apify property sync scheduled');
}
