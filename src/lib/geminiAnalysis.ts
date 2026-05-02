import { MeetingAnalysis, SalesStage, Sentiment } from '@/types/meeting';

const ANALYZE_BACKEND_URL = 'http://127.0.0.1:9000/analyze';
const ANALYZE_HEALTH_URL = 'http://127.0.0.1:9000/analyze/health';

/**
 * Check if Gemini API is configured on the backend (API key in .env)
 * Caches the result for 30 seconds to avoid spamming the backend.
 */
let _geminiConfiguredCache: { value: boolean; ts: number } | null = null;

export async function checkGeminiConfigured(): Promise<boolean> {
  const now = Date.now();
  if (_geminiConfiguredCache && now - _geminiConfiguredCache.ts < 30_000) {
    return _geminiConfiguredCache.value;
  }

  try {
    const response = await fetch(ANALYZE_HEALTH_URL, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) {
      _geminiConfiguredCache = { value: false, ts: now };
      return false;
    }
    const data = await response.json();
    const configured = !!data?.configured;
    _geminiConfiguredCache = { value: configured, ts: now };
    return configured;
  } catch {
    _geminiConfiguredCache = { value: false, ts: now };
    return false;
  }
}

/**
 * Synchronous check using cached value. Returns false if never checked.
 * Use checkGeminiConfigured() for the async authoritative check.
 */
export function isGeminiConfigured(): boolean {
  return _geminiConfiguredCache?.value ?? false;
}

/**
 * Invalidate the cached Gemini config status (e.g. after user changes .env)
 */
export function invalidateGeminiCache(): void {
  _geminiConfiguredCache = null;
}

/**
 * Analyze a meeting transcript via the backend /analyze endpoint.
 * The backend reads the GEMINI_API_KEY from its .env and calls Gemini server-side.
 * Supports transcriptions in Tunisian Arabic (Derja), French, or mixed.
 */
export async function analyzeWithGemini(
  transcript: string,
  durationSeconds?: number
): Promise<MeetingAnalysis> {
  const durationMinutes = durationSeconds ? Math.round(durationSeconds / 60) : 0;

  console.log('[Gemini] Sending transcript to backend for analysis, length:', transcript.length, 'chars');

  const response = await fetch(ANALYZE_BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript,
      duration_minutes: durationMinutes,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    const errorMessage = errorData?.detail || `HTTP ${response.status}`;
    console.error('[Gemini] Backend analysis error:', errorMessage);
    throw new Error(`Erreur analyse Gemini: ${errorMessage}`);
  }

  const parsed = await response.json();

  // Validate sales_stage and sentiment enums
  const validStages: SalesStage[] = ['contact_visits', 'value_proposition', 'offer_negotiation', 'closing', 'closed_lost'];
  const validSentiments: Sentiment[] = ['positive', 'neutral', 'negative'];

  const analysis: MeetingAnalysis = {
    id: crypto.randomUUID(),
    summary: parsed.summary || 'Analyse non disponible',
    sales_stage: validStages.includes(parsed.sales_stage) ? parsed.sales_stage : 'value_proposition',
    sentiment: validSentiments.includes(parsed.sentiment) ? parsed.sentiment : 'neutral',
    objections: Array.isArray(parsed.objections) ? parsed.objections : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    next_actions: Array.isArray(parsed.next_actions) ? parsed.next_actions : [],
    key_topics: Array.isArray(parsed.key_topics) ? parsed.key_topics : [],
    win_probability: typeof parsed.win_probability === 'number' ? parsed.win_probability : 50,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
    duration_minutes: durationMinutes,
  };

  console.log('[Gemini] Analysis complete:', {
    stage: analysis.sales_stage,
    sentiment: analysis.sentiment,
    winProb: analysis.win_probability,
    confidence: analysis.confidence,
  });

  return analysis;
}
