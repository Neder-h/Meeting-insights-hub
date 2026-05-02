import { db } from '@/integrations/local/client';
import {
  Commercial,
  CommercialTarget,
  CommercialRevenue,
  CommercialPerformance,
} from '@/types/meeting';
import { apiClient } from '@/lib/apiClient';

const DEFAULT_CURRENCY = 'TND';

function uuid() {
  return crypto.randomUUID();
}

export function calculateQuarter(month: number): number {
  return Math.ceil(month / 3);
}

export function getQuarterMonths(quarter: number): number[] {
  const start = (quarter - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

export function getCurrentQuarter(): number {
  return calculateQuarter(new Date().getMonth() + 1);
}

export function calculateProgress(actual: number, target?: number | null): number {
  if (!target || target <= 0) return 0;
  return Math.min(999, Math.round((actual / target) * 100));
}

export function calculateProjection(ytd: number, currentMonth: number): number {
  if (currentMonth <= 0) return 0;
  const avg = ytd / currentMonth;
  return avg * 12;
}

export function determineStatus(currentQuarterProgress: number, ytdProgress: number, currentQuarter: number): 'on-track' | 'at-risk' | 'behind' {
  if (currentQuarterProgress >= 90) return 'on-track';
  if (currentQuarterProgress < 70) {
    const expected = (currentQuarter / 4) * 100;
    if (ytdProgress < expected - 10) return 'behind';
    return 'at-risk';
  }
  return 'at-risk';
}

// Commercial management
export async function getAllCommercials(): Promise<Commercial[]> {
  return db.commercials.toArray();
}

export async function getActiveCommercials(): Promise<Commercial[]> {
  const all = await db.commercials.toArray();
  return all.filter(c => c.active);
}

export async function syncCommercialsFromUsers(): Promise<Commercial[]> {
  try {
    const users = await apiClient.get<any[]>('/users');
    const now = new Date().toISOString();
    const validUsers = users.filter((u) => (u.role || 'user') !== 'admin');
    const keepIds = new Set<string>();

    for (const u of validUsers) {
      const id = u.id || u._id;
      keepIds.add(id);
      const existing = await db.commercials.get(id);
      const record: Commercial = {
        id,
        name: u.full_name || u.email || 'Commercial',
        email: u.email,
        phone: existing?.phone,
        active: true,
        startDate: existing?.startDate || now,
        avatar: existing?.avatar,
        createdAt: existing?.createdAt || now,
      };
      await db.commercials.put(record);
    }

    // Deactivate entries not in the user list (e.g., removed users or admin)
    const current = await db.commercials.toArray();
    for (const c of current) {
      if (!keepIds.has(c.id) || !c.active) {
        await db.commercials.update(c.id, { active: keepIds.has(c.id) });
      }
    }

    return getActiveCommercials();
  } catch (error) {
    console.error('Failed to sync commercials from users', error);
    return getActiveCommercials();
  }
}

export async function getCommercialById(id: string): Promise<Commercial | undefined> {
  return db.commercials.get(id);
}

export async function createCommercial(data: Omit<Commercial, 'id' | 'createdAt'> & { id?: string }): Promise<Commercial> {
  const now = new Date().toISOString();
  const record: Commercial = {
    id: data.id || uuid(),
    createdAt: now,
    active: true,
    ...data,
  } as Commercial;
  await db.commercials.put(record);
  return record;
}

export async function updateCommercial(id: string, data: Partial<Commercial>): Promise<void> {
  await db.commercials.update(id, data);
}

export async function deactivateCommercial(id: string): Promise<void> {
  await updateCommercial(id, { active: false });
}

export async function deleteCommercial(id: string): Promise<void> {
  await db.commercials.delete(id);
}

// Targets
export async function getCommercialTarget(commercialId: string, year: number): Promise<CommercialTarget | undefined> {
  return db.commercial_targets.where('[commercialId+year]').equals([commercialId, year]).first();
}

export async function setCommercialTarget(data: CommercialTarget): Promise<void> {
  await db.commercial_targets.put(data);
}

export async function updateQuarterlyTargets(commercialId: string, year: number, quarters: Partial<Pick<CommercialTarget, 'q1Target' | 'q2Target' | 'q3Target' | 'q4Target'>>): Promise<void> {
  const existing = await getCommercialTarget(commercialId, year);
  if (!existing) return;
  await db.commercial_targets.put({ ...existing, ...quarters, lastUpdated: new Date().toISOString() });
}

export async function getAllTargetsForYear(year: number): Promise<CommercialTarget[]> {
  return db.commercial_targets.where('year').equals(year).toArray();
}

// Revenue
export async function getCommercialRevenue(commercialId: string, year: number): Promise<CommercialRevenue[]> {
  return db.commercial_revenue.where('[commercialId+year]').equals([commercialId, year]).sortBy('month');
}

export async function addCommercialRevenue(data: Omit<CommercialRevenue, 'id' | 'recordedAt'> & { id?: string; recordedAt?: string }): Promise<CommercialRevenue> {
  const record: CommercialRevenue = {
    id: data.id || uuid(),
    recordedAt: data.recordedAt || new Date().toISOString(),
    source: data.source,
    meetingId: data.meetingId,
    ...data,
  } as CommercialRevenue;
  await db.commercial_revenue.put(record);
  return record;
}

export async function getQuarterlyRevenue(commercialId: string, year: number, quarter: number): Promise<number> {
  const months = getQuarterMonths(quarter);
  const rows = await getCommercialRevenue(commercialId, year);
  return rows.filter(r => months.includes(r.month)).reduce((sum, r) => sum + r.amount, 0);
}

export async function calculateRevenueFromMeetings(commercialId: string, year: number): Promise<number> {
  const meetings = await db.meetings.where('commercialId').equals(commercialId).toArray();
  return meetings.reduce((sum, m) => {
    if (m.dealStatus === 'won' && m.dealValue) {
      const dt = m.closedDate || m.updated_at || m.created_at;
      const dtYear = new Date(dt).getFullYear();
      if (dtYear === year) return sum + m.dealValue;
    }
    return sum;
  }, 0);
}

// Performance
export async function getCommercialPerformance(commercialId: string, year: number): Promise<CommercialPerformance | null> {
  const [commercial, target, revenueRows] = await Promise.all([
    getCommercialById(commercialId),
    getCommercialTarget(commercialId, year),
    getCommercialRevenue(commercialId, year),
  ]);
  if (!commercial) return null;

  const sums = { q1: 0, q2: 0, q3: 0, q4: 0, ytd: 0 };
  const now = new Date();
  const currentMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const currentQuarter = calculateQuarter(currentMonth);

  for (const r of revenueRows) {
    const quarter = calculateQuarter(r.month);
    if (quarter === 1) sums.q1 += r.amount;
    if (quarter === 2) sums.q2 += r.amount;
    if (quarter === 3) sums.q3 += r.amount;
    if (quarter === 4) sums.q4 += r.amount;
    if (r.month <= currentMonth) sums.ytd += r.amount;
  }

  const quarterTargets = {
    1: target?.q1Target || 0,
    2: target?.q2Target || 0,
    3: target?.q3Target || 0,
    4: target?.q4Target || 0,
  } as Record<number, number>;

  const currentQuarterAmount = [sums.q1, sums.q2, sums.q3, sums.q4][currentQuarter - 1] || 0;
  const annualProgress = calculateProgress(sums.q1 + sums.q2 + sums.q3 + sums.q4, target?.annualTarget);
  const qProgress = (q: number, amount: number) => calculateProgress(amount, quarterTargets[q]);
  const currentQuarterProgress = qProgress(currentQuarter, currentQuarterAmount);
  const projectedAnnual = calculateProjection(sums.ytd, currentMonth);
  const status = determineStatus(currentQuarterProgress, annualProgress, currentQuarter);

  return {
    commercial,
    target: target || null,
    revenue: {
      ytd: sums.ytd,
      q1: sums.q1,
      q2: sums.q2,
      q3: sums.q3,
      q4: sums.q4,
      currentQuarter: currentQuarterAmount,
    },
    progress: {
      annualProgress,
      q1Progress: qProgress(1, sums.q1),
      q2Progress: qProgress(2, sums.q2),
      q3Progress: qProgress(3, sums.q3),
      q4Progress: qProgress(4, sums.q4),
      currentQuarterProgress,
    },
    status,
    projectedAnnual,
  };
}

export async function getAllPerformances(year: number): Promise<CommercialPerformance[]> {
  const commercials = await getActiveCommercials();
  const performances: CommercialPerformance[] = [];
  for (const c of commercials) {
    const perf = await getCommercialPerformance(c.id, year);
    if (perf) performances.push(perf);
  }
  return performances;
}

export function getQuarterDateRange(year: number, quarter: number) {
  const months = getQuarterMonths(quarter);
  const start = new Date(Date.UTC(year, months[0] - 1, 1));
  const end = new Date(Date.UTC(year, months[2], 0, 23, 59, 59, 999));
  return { start, end };
}

export { DEFAULT_CURRENCY };
