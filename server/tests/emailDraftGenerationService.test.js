import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../models/MeetingEmailFacts.js', () => ({
  default: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

import MeetingEmailFacts from '../models/MeetingEmailFacts.js';
import { generateEmailDraftPayload } from '../services/emailDraftGenerationService.js';

describe('email draft generation service', () => {
  const originalFetch = global.fetch;

  const meeting = {
    _id: { toString: () => 'meeting-1' },
    client_id: 'client-1',
    client_name: 'ACME',
    commercial_id: 'comm-1',
    commercial_name: 'Alice',
    raw_transcript: 'Bonjour on valide le budget إن شاء الله',
    transcript: 'Bonjour on valide le budget',
    createdAt: new Date('2026-04-20T10:00:00.000Z'),
  };

  const analysis = {
    summary: 'Résumé',
    sales_stage: 'offer_negotiation',
    objections: ['prix'],
    risks: ['delai'],
    next_actions: ['call'],
    key_topics: ['budget'],
    sentiment: 'positive',
    win_probability: 75,
    confidence: 65,
    duration_minutes: 10,
  };

  const req = {
    user: {
      _id: { toString: () => 'u1' },
      full_name: 'Seller',
      email: 'seller@test.local',
      role: 'user',
    },
  };

  const cfg = {
    geminiApiKey: 'k',
    geminiModel: 'gemini-2.5-flash',
  };

  function mockGeminiRoundTrip(outputs) {
    const calls = [];
    global.fetch = vi.fn(async (url, options) => {
      calls.push({ url, options });
      const asText = `${url}`;
      if (asText.includes('/models?key=')) {
        return {
          ok: true,
          json: async () => ({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }),
        };
      }

      const next = outputs.shift();
      if (!next) {
        return { ok: false, status: 500, text: async () => 'no more mocked outputs' };
      }
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: next }] } }],
        }),
      };
    });
    return calls;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('reuses cached facts when signatures match and avoids facts upsert', async () => {
    MeetingEmailFacts.findOne.mockResolvedValue(null);
    MeetingEmailFacts.findOneAndUpdate.mockResolvedValue({});

    // first call builds cache
    mockGeminiRoundTrip([
      '{"clientNeeds":["budget"],"painPoints":[],"objections":[],"constraints":[],"valueDrivers":[],"proposedFit":"fit","urgency":"","decisionProcess":"","ctaAngle":"call"}',
      '{"subject":"Subj","bodyText":"Bonjour client ceci est un email complet avec suffisamment de mots pour dépasser le minimum exigé et conclure correctement.","bodyHtml":"<p>x</p>","offerSummary":"sum","cta":"call","assumptions":[],"fieldsToVerify":[],"offerRecommendation":{"summary":"s","proposedSolution":"p","businessNeed":"b","clientPainPoints":[],"objectionHandling":[],"nextStepOffer":"n","pricingMentioned":null,"confidence":70}}',
    ]);

    const first = await generateEmailDraftPayload({ meeting, analysis, req, config: cfg, params: {} });
    expect(first.emailDraft.assumptions.some((a) => a.startsWith('prompt_variant:'))).toBe(true);
    expect(MeetingEmailFacts.findOneAndUpdate).toHaveBeenCalledTimes(1);

    const upsertArgs = MeetingEmailFacts.findOneAndUpdate.mock.calls[0][1];

    // second call should hit cached facts path
    MeetingEmailFacts.findOne.mockResolvedValueOnce({
      transcript_signature: upsertArgs.transcript_signature,
      analysis_signature: upsertArgs.analysis_signature,
      facts: upsertArgs.facts,
    });
    MeetingEmailFacts.findOneAndUpdate.mockClear();

    mockGeminiRoundTrip([
      '{"subject":"Subj2","bodyText":"Bonjour client ceci est un autre email complet avec assez de contenu pour être considéré valide et bien terminé.","bodyHtml":"<p>y</p>","offerSummary":"sum2","cta":"call","assumptions":[],"fieldsToVerify":[],"offerRecommendation":{"summary":"s","proposedSolution":"p","businessNeed":"b","clientPainPoints":[],"objectionHandling":[],"nextStepOffer":"n","pricingMentioned":null,"confidence":72}}',
    ]);

    await generateEmailDraftPayload({ meeting, analysis, req, config: cfg, params: {} });
    expect(MeetingEmailFacts.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('falls back to safe content when Gemini is unavailable', async () => {
    MeetingEmailFacts.findOne.mockResolvedValue(null);
    MeetingEmailFacts.findOneAndUpdate.mockResolvedValue({});

    global.fetch = vi.fn(async () => ({ ok: false, status: 503, text: async () => 'down' }));

    const result = await generateEmailDraftPayload({
      meeting,
      analysis,
      req,
      config: cfg,
      params: { language: 'fr', tone: 'professional' },
    });

    expect(result.emailDraft.subject.length).toBeGreaterThan(0);
    expect(result.emailDraft.bodyText).toContain('Bonjour');
    expect(result.emailDraft.assumptions.some((a) => a.includes('fallback'))).toBe(true);
  });
});
