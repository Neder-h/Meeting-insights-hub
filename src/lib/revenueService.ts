import { db } from '@/integrations/local/client';
import { MonthlyRevenue, RevenueData } from '@/types/meeting';

const DEFAULT_CURRENCY = 'TND';

function makeMonthlyId(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getCurrentMonthForYear(year: number) {
  const now = new Date();
  if (now.getFullYear() === year) return now.getMonth() + 1;
  return 12;
}

export async function getMonthlyBreakdown(year: number): Promise<MonthlyRevenue[]> {
  const rows = await db.monthly_revenue.where('year').equals(year).sortBy('month');
  return rows;
}

export async function addMonthlyRevenue(data: MonthlyRevenue): Promise<void> {
  const id = data.id || makeMonthlyId(data.year, data.month);
  await db.monthly_revenue.put({ ...data, id });
}

export async function getAnnualRevenue(year: number): Promise<RevenueData | null> {
  const existing = await db.revenue.get(year);
  if (existing) return existing;
  await recalculateTotals(year);
  return db.revenue.get(year);
}

export async function updateAnnualRevenue(year: number, updates: Partial<RevenueData>): Promise<RevenueData> {
  const current = await db.revenue.get(year);
  const merged: RevenueData = {
    year,
    total: current?.total ?? 0,
    ytd: current?.ytd ?? 0,
    currency: updates.currency || current?.currency || DEFAULT_CURRENCY,
    target: updates.target ?? current?.target,
    previousYear: updates.previousYear ?? current?.previousYear,
    lastUpdated: new Date().toISOString(),
  };
  await db.revenue.put({ ...current, ...merged, ...updates, lastUpdated: merged.lastUpdated });
  return (await db.revenue.get(year)) as RevenueData;
}

export async function getPreviousYearRevenue(year: number): Promise<RevenueData | null> {
  return db.revenue.get(year - 1) ?? null;
}

export function calculateGrowth(current?: RevenueData | null, previous?: RevenueData | null): number | null {
  if (!current || !previous || !previous.total || previous.total === 0) return null;
  return ((current.total - previous.total) / previous.total) * 100;
}

export async function calculateFromMeetings(year: number): Promise<{ total: number; ytd: number; currency: string }> {
  const rows = await db.meetings.where('status').equals('completed').toArray();
  const currentMonth = getCurrentMonthForYear(year);
  let total = 0;
  let ytd = 0;
  let currency = DEFAULT_CURRENCY;

  for (const m of rows) {
    if (m.dealStatus === 'won' && m.dealValue) {
      const dtYear = new Date(m.updated_at || m.created_at).getFullYear();
      if (dtYear === year) {
        total += m.dealValue;
        if (new Date(m.updated_at || m.created_at).getMonth() + 1 <= currentMonth) {
          ytd += m.dealValue;
        }
        currency = m.dealCurrency || currency;
      }
    }
  }

  return { total, ytd, currency };
}

export async function recalculateTotals(year: number): Promise<RevenueData> {
  const monthly = await getMonthlyBreakdown(year);
  const currentMonth = getCurrentMonthForYear(year);
  const total = monthly.reduce((sum, m) => sum + m.amount, 0);
  const ytd = monthly.reduce((sum, m) => sum + (m.month <= currentMonth ? m.amount : 0), 0);
  const prev = await getPreviousYearRevenue(year);
  const currency = monthly[0]?.currency || prev?.currency || DEFAULT_CURRENCY;

  const revenue: RevenueData = {
    year,
    total,
    ytd,
    currency,
    target: (await db.revenue.get(year))?.target,
    previousYear: prev?.total,
    lastUpdated: new Date().toISOString(),
  };

  await db.revenue.put(revenue);
  return revenue;
}
