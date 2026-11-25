import type { AiChatMessage, AiToolCallRequest } from '../../types/ai';

export interface AnonymizationStats {
  amountsMasked: number;
  taxIdsMasked: number;
  companiesMasked: number;
  contactsMasked: number;
}

export interface AnonymizeForAiResult {
  anonymizedText: string;
  tokenMap: Record<string, string>;
  stats: AnonymizationStats;
}

export interface AnonymizeOptions {
  knownCompanyNames?: string[];
  existingTokenMap?: Record<string, string>;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Anonymise les données sensibles camerounaises avant tout envoi vers un modèle IA Cloud
 * (Gemini, Groq, Mistral, OpenRouter) :
 * - Montants financiers (FCFA / XAF)
 * - Identifiants fiscaux & commerciaux (NIU, RCCM)
 * - Noms d'entreprises soumissionnaires / titulaires
 * - Emails et numéros de téléphone
 */
export function anonymizeForAi(
  text: string,
  options?: AnonymizeOptions
): AnonymizeForAiResult {
  const tokenMap: Record<string, string> = { ...(options?.existingTokenMap ?? {}) };
  const valueToToken = new Map<string, string>();
  for (const [token, original] of Object.entries(tokenMap)) {
    valueToToken.set(original, token);
  }

  const counters: Record<string, number> = {
    MONTANT: 0,
    NIU: 0,
    RCCM: 0,
    ENTREPRISE: 0,
    EMAIL: 0,
    TEL: 0,
  };

  for (const token of Object.keys(tokenMap)) {
    const match = token.match(/^\[([A-Z]+)_(\d+)\]$/);
    if (match && match[1] && match[2]) {
      const cat = match[1];
      const num = Number(match[2]);
      if (num > (counters[cat] ?? 0)) {
        counters[cat] = num;
      }
    }
  }

  const stats: AnonymizationStats = {
    amountsMasked: 0,
    taxIdsMasked: 0,
    companiesMasked: 0,
    contactsMasked: 0,
  };

  const registerToken = (
    category: 'MONTANT' | 'NIU' | 'RCCM' | 'ENTREPRISE' | 'EMAIL' | 'TEL',
    originalValue: string
  ): string => {
    const trimmed = originalValue.trim();
    const existing = valueToToken.get(trimmed);
    if (existing) return existing;

    counters[category] = (counters[category] ?? 0) + 1;
    const token = `[${category}_${counters[category]}]`;
    tokenMap[token] = trimmed;
    valueToToken.set(trimmed, token);

    if (category === 'MONTANT') stats.amountsMasked += 1;
    else if (category === 'NIU' || category === 'RCCM') stats.taxIdsMasked += 1;
    else if (category === 'ENTREPRISE') stats.companiesMasked += 1;
    else stats.contactsMasked += 1;

    return token;
  };

  let output = text;

  // 1. Emails
  output = output.replace(
    /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    (m) => registerToken('EMAIL', m)
  );

  // 2. NIU camerounais (ex. M041912345678A ou libellé NIU : ...)
  output = output.replace(/\bNIU\s*[:#-]?\s*([A-Z0-9-]{8,20})\b/gi, (_m, idVal: string) => {
    const tok = registerToken('NIU', idVal);
    return `NIU ${tok}`;
  });
  output = output.replace(/\b[MP]\d{12}[A-Z]\b/g, (m) => registerToken('NIU', m));

  // 3. RCCM camerounais (ex. RC/DLA/2021/B/1234 ou libellé RCCM : ...)
  output = output.replace(
    /\bRC\/[A-Z]{2,6}\/\d{4}\/[A-Z]\/\d+\b/gi,
    (m) => registerToken('RCCM', m)
  );
  output = output.replace(
    /\bRCCM\s*[:#-]?\s*([A-Z0-9/-]{6,30})\b/gi,
    (_m, idVal: string) => {
      const tok = registerToken('RCCM', idVal);
      return `RCCM ${tok}`;
    }
  );

  // 4. Téléphones Cameroun (+237 6XX XX XX XX ou 6XXXXXXXX)
  output = output.replace(
    /(?:\+237|00237)[\s.-]?\d(?:[\s.-]?\d){7,8}\b/g,
    (m) => registerToken('TEL', m)
  );
  output = output.replace(
    /\b6\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}\b/g,
    (m) => registerToken('TEL', m)
  );

  // 5. Montants financiers FCFA / XAF
  output = output.replace(
    /\b\d{1,3}(?:[\s\u00A0\u202F.,]\d{3})+(?:[.,]\d{1,2})?\s*(?:F\s?CFA|FCFA|XAF)\b/gi,
    (m) => registerToken('MONTANT', m)
  );
  output = output.replace(
    /\b\d+(?:[.,]\d+)?\s*(?:millions?|milliards?)\s*(?:de\s*)?(?:F\s?CFA|FCFA|XAF)\b/gi,
    (m) => registerToken('MONTANT', m)
  );
  output = output.replace(
    /\b\d{4,}(?:[.,]\d{1,2})?\s*(?:F\s?CFA|FCFA|XAF)\b/gi,
    (m) => registerToken('MONTANT', m)
  );

  // 6. Noms d'entreprises connus passés explicitement
  if (options?.knownCompanyNames && options.knownCompanyNames.length > 0) {
    const sortedNames = [...options.knownCompanyNames]
      .filter((n) => n.trim().length > 2)
      .sort((a, b) => b.length - a.length);
    for (const company of sortedNames) {
      const rx = new RegExp(escapeRegExp(company.trim()), 'gi');
      output = output.replace(rx, (m) => registerToken('ENTREPRISE', m));
    }
  }

  // 7. Heuristique raisons sociales camerounaises (ETS ..., ... SARL/SA/SAS/SURL/GIC)
  output = output.replace(
    /\b(?:ETS|ETABLISSEMENTS?|SOCIETE|STE|GROUPE)\s+[A-Z0-9ÉÈÊÀÂÔÙÎÇ&'-]+(?:\s+[A-Z0-9ÉÈÊÀÂÔÙÎÇ&'-]+){0,4}(?:\s+(?:SARL|SA|SAS|SUARL|SURL|BTP))?\b/g,
    (m) => registerToken('ENTREPRISE', m)
  );
  output = output.replace(
    /\b[A-Z][A-Z0-9ÉÈÊÀÂÔÙÎÇ&'.-]{1,}(?:\s+[A-Z0-9ÉÈÊÀÂÔÙÎÇ&'.-]+){0,4}\s+(?:SARL|SA|SAS|SUARL|SURL|GIC)\b/g,
    (m) => registerToken('ENTREPRISE', m)
  );

  return {
    anonymizedText: output,
    tokenMap,
    stats,
  };
}

/**
 * Réinjecte les valeurs réelles dans la sortie retournée par l'IA
 * uniquement pour l'affichage côté utilisateur authentifié.
 */
export function deanonymizeAiOutput(
  text: string,
  tokenMap: Record<string, string>
): string {
  const entries = Object.entries(tokenMap).sort(
    (a, b) => b[0].length - a[0].length
  );
  let restored = text;
  for (const [token, original] of entries) {
    if (restored.includes(token)) {
      restored = restored.split(token).join(original);
    }
  }
  return restored;
}

export function anonymizeMessagesForAi(
  messages: AiChatMessage[],
  options?: AnonymizeOptions
): {
  messages: AiChatMessage[];
  tokenMap: Record<string, string>;
  stats: AnonymizationStats;
} {
  const sharedMap: Record<string, string> = { ...(options?.existingTokenMap ?? {}) };
  const totalStats: AnonymizationStats = {
    amountsMasked: 0,
    taxIdsMasked: 0,
    companiesMasked: 0,
    contactsMasked: 0,
  };

  const anonymizedMessages = messages.map((msg) => {
    // Ne pas altérer les instructions système statiques si elles ne contiennent pas de données métier
    if (msg.role === 'system') {
      return msg;
    }
    const res = anonymizeForAi(msg.content, {
      ...options,
      existingTokenMap: sharedMap,
    });
    Object.assign(sharedMap, res.tokenMap);
    totalStats.amountsMasked += res.stats.amountsMasked;
    totalStats.taxIdsMasked += res.stats.taxIdsMasked;
    totalStats.companiesMasked += res.stats.companiesMasked;
    totalStats.contactsMasked += res.stats.contactsMasked;
    return {
      ...msg,
      content: res.anonymizedText,
    };
  });

  return {
    messages: anonymizedMessages,
    tokenMap: sharedMap,
    stats: totalStats,
  };
}

export function deanonymizeToolCalls(
  toolCalls: AiToolCallRequest[],
  tokenMap: Record<string, string>
): AiToolCallRequest[] {
  if (toolCalls.length === 0 || Object.keys(tokenMap).length === 0) {
    return toolCalls;
  }

  const restoreValue = (val: unknown): unknown => {
    if (typeof val === 'string') {
      return deanonymizeAiOutput(val, tokenMap);
    }
    if (Array.isArray(val)) {
      return val.map(restoreValue);
    }
    if (val && typeof val === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        out[k] = restoreValue(v);
      }
      return out;
    }
    return val;
  };

  return toolCalls.map((tc) => ({
    ...tc,
    arguments: restoreValue(tc.arguments) as Record<string, unknown>,
  }));
}
