import { randomUUID } from 'crypto';
import MeetingEmailFacts from '../models/MeetingEmailFacts.js';
import { clamp, safeArray, safeString, hashText, wordCount } from './meetingRouteUtils.js';

function stripCodeFences(text) {
  if (!text) return '';
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractJsonObject(raw) {
  const cleaned = stripCodeFences(raw);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

function extractFirstBalancedJson(raw) {
  const text = stripCodeFences(raw);
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function sanitizeJsonText(raw) {
  return (raw || '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
}

function parseJsonLenient(raw) {
  const attempts = [
    raw,
    stripCodeFences(raw),
    extractFirstBalancedJson(raw),
    extractJsonObject(raw),
  ].filter(Boolean);

  for (const candidate of attempts) {
    try {
      return JSON.parse(sanitizeJsonText(candidate));
    } catch {
      // continue
    }
  }

  return null;
}

function choosePromptVariant(seed) {
  const h = hashText(seed || randomUUID());
  return parseInt(h.slice(-1), 16) % 2 === 0 ? 'A' : 'B';
}

function normalizeTranscript(raw) {
  const text = safeString(raw)
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';

  const fillerWords = new Set([
    'euh', 'heu', 'uh', 'um', 'hmm', 'mmm', 'ben', 'bah', 'genre', 'tu vois', 'yakhi', 'yaani', 'يعني',
  ]);

  const tokens = text.split(' ');
  const cleaned = [];
  let repeatCount = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i].trim();
    if (!tok) continue;
    const norm = tok.toLowerCase();

    if (i > 0 && norm === tokens[i - 1].toLowerCase()) {
      repeatCount += 1;
      if (repeatCount >= 2) continue;
    } else {
      repeatCount = 0;
    }

    if (fillerWords.has(norm) && i < tokens.length - 1) {
      const prev = (cleaned[cleaned.length - 1] || '').toLowerCase();
      const next = (tokens[i + 1] || '').toLowerCase();
      if (prev === next || fillerWords.has(next)) {
        continue;
      }
    }

    cleaned.push(tok);
  }

  return cleaned.join(' ').trim();
}

function toTokenSet(text) {
  return new Set(
    safeString(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w && w.length > 2)
  );
}

function computeTranscriptAnalysisConfidence(normalizedTranscript, analysisPayload) {
  const transcriptTokens = toTokenSet(normalizedTranscript);
  const analysisText = [
    analysisPayload.summary,
    ...(analysisPayload.key_topics || []),
    ...(analysisPayload.objections || []),
    ...(analysisPayload.risks || []),
    ...(analysisPayload.next_actions || []),
  ].join(' ');
  const analysisTokens = toTokenSet(analysisText);

  if (analysisTokens.size === 0 || transcriptTokens.size === 0) return 50;

  let overlap = 0;
  analysisTokens.forEach((t) => {
    if (transcriptTokens.has(t)) overlap += 1;
  });

  const ratio = overlap / analysisTokens.size;
  return clamp(Math.round(ratio * 100), 0, 100);
}

function buildFactsFromAnalysisFallback(analysisPayload) {
  return {
    clientNeeds: safeArray(analysisPayload.key_topics).slice(0, 5),
    painPoints: safeArray(analysisPayload.risks).slice(0, 5),
    objections: safeArray(analysisPayload.objections).slice(0, 5),
    constraints: [],
    valueDrivers: safeArray(analysisPayload.key_topics).slice(0, 3),
    proposedFit: safeString(analysisPayload.summary).slice(0, 280),
    urgency: '',
    decisionProcess: '',
    ctaAngle: 'Propose a short follow-up meeting to validate scope and priorities.',
  };
}

function buildFallbackEmailContent({ language, clientName, commercialName, meetingDate, analysis, styleIndex = 0 }) {
  const isFr = language === 'fr';
  const topics = safeArray(analysis?.key_topics).slice(0, 3);
  const objections = safeArray(analysis?.objections).slice(0, 2);

  const frSubjects = [
    'Suite à notre échange',
    'Proposition adaptée à vos priorités',
    'Suivi de notre discussion',
  ];
  const enSubjects = [
    'Following our discussion',
    'Tailored proposal for your priorities',
    'Follow-up on our conversation',
  ];

  const frCtas = [
    'Seriez-vous disponible la semaine prochaine pour valider les modalités ?',
    'Je vous propose un échange court pour confirmer le cadrage et la suite.',
    'Dites-moi si vous êtes disponible pour finaliser les points clés cette semaine.',
  ];
  const enCtas = [
    'Would you be available next week to validate the key details?',
    'I suggest a short follow-up call to confirm scope and priorities.',
    'Please let me know if you are available to finalize key points this week.',
  ];

  const subject = isFr
    ? frSubjects[styleIndex % frSubjects.length]
    : enSubjects[styleIndex % enSubjects.length];

  const offerSummary = topics.length > 0
    ? (isFr
      ? `Nous vous proposons un accompagnement ciblé sur ${topics.join(', ')}.`
      : `We propose tailored support focused on ${topics.join(', ')}.`)
    : (isFr
      ? 'Nous vous proposons une offre adaptée à vos objectifs business.'
      : 'We propose a tailored offer aligned with your business goals.');

  const objectionLine = objections.length > 0
    ? (isFr
      ? `Nous avons bien pris en compte vos points d'attention, notamment ${objections.join(' et ')}.`
      : `We have taken your key concerns into account, notably ${objections.join(' and ')}.`)
    : '';

  const cta = isFr
    ? frCtas[styleIndex % frCtas.length]
    : enCtas[styleIndex % enCtas.length];

  const bodyText = isFr
    ? `Bonjour ${clientName},\n\nMerci pour notre échange${meetingDate ? ` du ${meetingDate}` : ''}.\n\n${offerSummary}\n${objectionLine ? `\n${objectionLine}\n` : ''}\n${cta}\n\nCordialement,\n${commercialName}`
    : `Hello ${clientName},\n\nThank you for our discussion${meetingDate ? ` on ${meetingDate}` : ''}.\n\n${offerSummary}\n${objectionLine ? `\n${objectionLine}\n` : ''}\n${cta}\n\nBest regards,\n${commercialName}`;

  return { subject, bodyText, bodyHtml: bodyText.replace(/\n/g, '<br>'), offerSummary, cta };
}

function buildTranscriptForPrompt(text, maxChars = 16000) {
  const t = (text || '').trim();
  if (t.length <= maxChars) return t;
  const head = t.slice(0, Math.floor(maxChars * 0.7));
  const tail = t.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n\n[... transcript truncated for length ...]\n\n${tail}`;
}

function sanitizePersonName(value, fallback) {
  const name = safeString(value);
  if (!name) return fallback;
  const normalized = name.toLowerCase();
  const generic = new Set(['client', 'customer', 'administrateur', 'administrator', 'admin', 'utilisateur', 'user']);
  return generic.has(normalized) ? fallback : name;
}

function enforceRecipientGreeting(body, language, clientName) {
  const text = safeString(body);
  if (!text) return text;
  const lines = text.split('\n');
  const first = safeString(lines[0]);
  const replacement = language === 'fr' ? `Bonjour ${clientName},` : `Hello ${clientName},`;

  if (/^(cher|chère|dear|hello|bonjour)\b/i.test(first)) {
    lines[0] = replacement;
    return lines.join('\n');
  }

  return `${replacement}\n\n${text}`;
}

function isLikelyIncompleteEmailBody(text) {
  const body = safeString(text);
  if (!body) return true;

  const words = body.split(/\s+/).filter(Boolean);
  if (words.length < 45) return true;

  const trimmed = body.trim();
  const endsWell = /([.!?…]|(Cordialement|Bien cordialement|Best regards|Sincerely),?)\s*$/i.test(trimmed);
  if (endsWell) return false;

  const lastWord = (words[words.length - 1] || '').toLowerCase();
  const dangling = new Set(['sur', 'de', 'du', 'des', 'pour', 'avec', 'et', 'ou', 'to', 'of', 'on', 'and', 'with']);
  return dangling.has(lastWord) || !endsWell;
}

async function generateWithGemini({ apiKey, model, prompt, temperature = 0.25 }) {
  const preferred = [
    model,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  let discovered = [];
  try {
    const modelsResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
    if (modelsResp.ok) {
      const modelsData = await modelsResp.json();
      discovered = (modelsData?.models || [])
        .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map((m) => (m.name || '').replace(/^models\//, '').trim())
        .filter(Boolean);
    }
  } catch {
    // Ignore discovery failures
  }

  const modelCandidates = [
    ...preferred,
    ...discovered,
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  const apiVersions = ['v1beta', 'v1'];
  const attemptErrors = [];

  for (const modelName of modelCandidates) {
    for (const version of apiVersions) {
      const url = `https://generativelanguage.googleapis.com/${version}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            topP: 0.9,
            maxOutputTokens: 1200,
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        attemptErrors.push(`${version}/${modelName}: HTTP ${response.status} ${body.slice(0, 140)}`);
        continue;
      }

      const payload = await response.json();
      const text = payload?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('\n') || '';
      if (!text.trim()) {
        attemptErrors.push(`${version}/${modelName}: empty response`);
        continue;
      }

      return { text, modelUsed: modelName };
    }
  }

  throw new Error(`Gemini generation failed. Attempts: ${attemptErrors.slice(0, 8).join(' | ')}`);
}

export async function generateEmailDraftPayload({ meeting, analysis, req, config, params = {} }) {
  const toneRaw = safeString(params?.tone, 'professional').toLowerCase();
  const tone = ['professional', 'friendly', 'executive'].includes(toneRaw)
    ? toneRaw
    : 'professional';
  const language = safeString(params?.language, 'fr').toLowerCase().startsWith('en') ? 'en' : 'fr';
  const isRegenerate = !!params?.regenerate;
  const regenerateNonce = safeString(params?.nonce, randomUUID());

  const analysisPayload = {
    summary: analysis.summary || '',
    sales_stage: analysis.sales_stage || '',
    objections: analysis.objections || [],
    risks: analysis.risks || [],
    next_actions: analysis.next_actions || [],
    key_topics: analysis.key_topics || [],
    sentiment: analysis.sentiment || '',
    win_probability: analysis.win_probability || 0,
    confidence: analysis.confidence || 0,
    duration_minutes: analysis.duration_minutes || 0,
  };

  const requestedClientName = safeString(params?.clientName || params?.client_name);
  const requestedCommercialName = safeString(params?.commercialName || params?.commercial_name);
  const clientName = sanitizePersonName(requestedClientName || meeting.client_name, 'Client');
  const commercialName = sanitizePersonName(
    requestedCommercialName || meeting.commercial_name || req.user.full_name || req.user.email,
    'Commercial representative'
  );

  const normalizedTranscript = normalizeTranscript(meeting.raw_transcript || meeting.transcript || '');
  const transcript = buildTranscriptForPrompt(normalizedTranscript);
  const promptVariant = choosePromptVariant(
    isRegenerate
      ? `${meeting._id.toString()}-${req.user._id.toString()}-${regenerateNonce}`
      : `${meeting._id.toString()}-${req.user._id.toString()}`
  );
  const styleIndex = parseInt(hashText(regenerateNonce).slice(-2), 16) % 3;

  const transcriptSignature = hashText(transcript);
  const analysisSignature = hashText(JSON.stringify(analysisPayload));
  const overlapConfidence = computeTranscriptAnalysisConfidence(transcript, analysisPayload);

  let facts = null;
  const cachedFacts = await MeetingEmailFacts.findOne({ meeting_id: meeting._id });
  if (
    cachedFacts
    && cachedFacts.transcript_signature === transcriptSignature
    && cachedFacts.analysis_signature === analysisSignature
    && cachedFacts.facts
  ) {
    facts = cachedFacts.facts;
  }

  let aiError = '';

  if (!facts) {
    const extractionPrompt = promptVariant === 'A'
      ? `Extract reliable sales facts from the data below. Prioritize structured analysis over noisy transcript fragments.
Return ONE JSON object only with keys:
clientNeeds, painPoints, objections, constraints, valueDrivers, proposedFit, urgency, decisionProcess, ctaAngle.
Use arrays for list fields and strings for the others.

Analysis JSON:
${JSON.stringify(analysisPayload)}

Normalized transcript:
${transcript}`
      : `You are an information extraction engine for sales calls.
Goal: produce compact, reliable facts for follow-up email drafting.
Rules: no invention, resolve ambiguity in favor of analysis JSON, ignore obvious transcript noise.
Output ONLY valid JSON with keys:
clientNeeds, painPoints, objections, constraints, valueDrivers, proposedFit, urgency, decisionProcess, ctaAngle.

Data:
analysis=${JSON.stringify(analysisPayload)}
transcript=${transcript}`;

    try {
      const { text: rawFacts } = await generateWithGemini({
        apiKey: config.geminiApiKey,
        model: config.geminiModel,
        prompt: extractionPrompt,
        temperature: isRegenerate ? 0.35 : 0.25,
      });
      facts = parseJsonLenient(rawFacts);
    } catch (geminiErr) {
      aiError = geminiErr?.message || 'Gemini facts extraction failed';
    }

    if (!facts) {
      facts = buildFactsFromAnalysisFallback(analysisPayload);
    }

    await MeetingEmailFacts.findOneAndUpdate(
      { meeting_id: meeting._id },
      {
        meeting_id: meeting._id,
        transcript_signature: transcriptSignature,
        analysis_signature: analysisSignature,
        prompt_variant: promptVariant,
        confidence_score: overlapConfidence,
        facts,
      },
      { upsert: true, new: true }
    );
  }

  const composePrompt = promptVariant === 'A'
    ? `Task: Write a professional follow-up sales email as the commercial representative.
Language: ${language === 'fr' ? 'French' : 'English'}
Tone: ${tone}
Length: 120-220 words.
Rules: no invented pricing/legal commitments; no mention of transcript/AI; no explicit "next steps" section.
  Greeting rule: the salutation recipient MUST be exactly "${clientName}".
Use facts as primary source and analysis for consistency.
Return ONE valid JSON with exact keys:
subject, bodyText, bodyHtml, offerSummary, cta, assumptions, fieldsToVerify, offerRecommendation.
offerRecommendation keys: summary, proposedSolution, businessNeed, clientPainPoints, objectionHandling, nextStepOffer, pricingMentioned, confidence.

Context:
client=${clientName}
commercial=${commercialName}
meeting_date=${meeting.createdAt?.toISOString?.() || ''}
facts=${JSON.stringify(facts)}
analysis=${JSON.stringify(analysisPayload)}`
    : `Compose a concise B2B follow-up offer email.
Output JSON only with keys: subject, bodyText, bodyHtml, offerSummary, cta, assumptions, fieldsToVerify, offerRecommendation.
Requirements:
- language=${language}
- tone=${tone}
- 120-220 words
- professional writing, tailored to client
- no fabricated commercial/legal details
- do not mention transcript or AI
Use:
facts=${JSON.stringify(facts)}
analysis=${JSON.stringify(analysisPayload)}
client=${clientName}
commercial=${commercialName}
variation_hint=${isRegenerate ? `Rewrite with a different wording/style than previous versions. nonce=${regenerateNonce}` : 'first-draft'}`;

  let parsed = null;

  try {
    const { text: raw } = await generateWithGemini({
      apiKey: config.geminiApiKey,
      model: config.geminiModel,
      prompt: composePrompt,
      temperature: isRegenerate ? 0.6 : 0.3,
    });

    parsed = parseJsonLenient(raw);

    if (!parsed) {
      const repairPrompt = `Convert the following model output into ONE valid JSON object only.\nDo not add explanations, markdown, or code fences.\nPreserve meaning and keys as much as possible.\n\nOutput to fix:\n${raw}`;
      const { text: repairedRaw } = await generateWithGemini({
        apiKey: config.geminiApiKey,
        model: config.geminiModel,
        prompt: repairPrompt,
        temperature: 0.2,
      });
      parsed = parseJsonLenient(repairedRaw);
    }

    if (!parsed) {
      aiError = aiError || 'Could not parse JSON from Gemini response';
    }
  } catch (geminiErr) {
    aiError = aiError || geminiErr?.message || 'Gemini composition failed';
    console.error('Gemini generation fallback activated:', aiError);
  }

  if (!parsed) parsed = {};

  const now = new Date().toISOString();
  const meetingDateLabel = meeting.createdAt
    ? new Date(meeting.createdAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')
    : '';
  const fallback = buildFallbackEmailContent({
    language,
    clientName,
    commercialName,
    meetingDate: meetingDateLabel,
    analysis: analysisPayload,
    styleIndex,
  });

  const rawBodyText = safeString(parsed.bodyText, '');
  const tooShort = wordCount(rawBodyText) < 45;
  const incomplete = isLikelyIncompleteEmailBody(rawBodyText);
  const bodyTextGenerated = tooShort || incomplete ? fallback.bodyText : rawBodyText;
  const bodyText = enforceRecipientGreeting(bodyTextGenerated, language, clientName);
  const cta = safeString(parsed.cta, fallback.cta);
  const subject = safeString(parsed.subject, fallback.subject);
  const offerSummary = safeString(parsed.offerSummary, fallback.offerSummary);
  const bodyHtml = safeString(parsed.bodyHtml, bodyText.replace(/\n/g, '<br>'));
  const inferredFields = [
    {
      field: 'clientNeeds',
      value: safeArray(facts?.clientNeeds).join(', '),
      source: safeArray(facts?.clientNeeds).length ? 'analysis' : 'fallback',
      confidence: overlapConfidence,
    },
    {
      field: 'painPoints',
      value: safeArray(facts?.painPoints).join(', '),
      source: safeArray(facts?.painPoints).length ? 'analysis' : 'fallback',
      confidence: overlapConfidence,
    },
    {
      field: 'objections',
      value: safeArray(facts?.objections).join(', '),
      source: safeArray(facts?.objections).length ? 'analysis' : 'fallback',
      confidence: overlapConfidence,
    },
    {
      field: 'ctaAngle',
      value: safeString(facts?.ctaAngle, cta),
      source: safeString(facts?.ctaAngle) ? 'analysis' : 'fallback',
      confidence: overlapConfidence,
    },
    {
      field: 'decisionProcess',
      value: safeString(facts?.decisionProcess, ''),
      source: safeString(facts?.decisionProcess) ? 'analysis' : 'fallback',
      confidence: overlapConfidence,
    },
  ].filter((item) => safeString(item.value));

  const emailDraft = {
    id: randomUUID(),
    meetingId: meeting._id.toString(),
    clientId: safeString(meeting.client_id, 'client_default'),
    clientName,
    commercialId: safeString(meeting.commercial_id, req.user._id.toString()),
    commercialName,
    subject,
    bodyText,
    bodyHtml,
    language,
    tone,
    type: 'follow_up_offer',
    offerSummary,
    cta,
    assumptions: safeArray(parsed.assumptions),
    fieldsToVerify: safeArray(parsed.fieldsToVerify),
    inferredFields,
    offerRecommendation: {
      summary: safeString(parsed.offerRecommendation?.summary, offerSummary),
      proposedSolution: safeString(parsed.offerRecommendation?.proposedSolution, offerSummary),
      businessNeed: safeString(parsed.offerRecommendation?.businessNeed, safeArray(analysisPayload.key_topics).join(', ')),
      clientPainPoints: (() => {
        const val = safeArray(parsed.offerRecommendation?.clientPainPoints);
        return val.length ? val : safeArray(analysisPayload.risks);
      })(),
      objectionHandling: (() => {
        const val = safeArray(parsed.offerRecommendation?.objectionHandling);
        return val.length ? val : safeArray(analysisPayload.objections);
      })(),
      nextStepOffer: safeString(parsed.offerRecommendation?.nextStepOffer, cta),
      pricingMentioned: typeof parsed.offerRecommendation?.pricingMentioned === 'string'
        ? parsed.offerRecommendation.pricingMentioned
        : null,
      confidence: clamp(Number(parsed.offerRecommendation?.confidence || analysis.win_probability || 50), 0, 100),
    },
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };

  if (aiError || tooShort || incomplete) {
    const fallbackReason = aiError || (tooShort ? 'AI output too short, fallback applied' : 'AI output incomplete, fallback applied');
    emailDraft.assumptions = [...emailDraft.assumptions, `AI generation fallback used: ${fallbackReason}`].slice(0, 3);
  }

  emailDraft.assumptions = [...emailDraft.assumptions, `prompt_variant:${promptVariant}`, `facts_confidence:${overlapConfidence}`].slice(0, 5);

  return {
    emailDraft,
    promptVariant,
    tooShort,
  };
}
