import type {
  AiChatMessage,
  AiGatewayRequest,
  AiGatewayResponse,
  AiProviderAttemptLog,
  AiProviderConfig,
  AiProviderId,
  AiTaskKind,
  AiToolCallRequest,
  AiToolDefinition,
} from '../../types/ai';

/**
 * Passerelle IA Multi-Fournisseurs avec Auto-Fallback (Jalon 3)
 * - Google Gemini (Free Tier) : Analyse de longs documents (DAO, rapports SCA, requêtes) + Embeddings 768d
 * - Groq (Llama 3.3 70B Free Tier) : Commandes NLP rapides (< 1s) & Function Calling
 * - Mistral AI (Free Tier) : Rédaction administrative francophone & synthèse juridique
 * - Ollama (Local) : Bascule souveraine hors-ligne (offline-first)
 */

export const DEFAULT_AI_MODELS = {
  gemini: 'gemini-3-flash-preview',
  geminiEmbed: 'gemini-embedding-001',
  groq: 'openai/gpt-oss-120b',
  mistral: 'mistral-small-latest',
  openrouter: 'google/gemma-4-31b-it:free',
  ollama: 'llama3.2:latest',
  ollamaEmbed: 'nomic-embed-text',
} as const;

export const TASK_ROUTING_PRIORITY: Record<AiTaskKind, AiProviderId[]> = {
  LONG_DOC_ANALYSIS: ['gemini', 'mistral', 'openrouter', 'groq', 'ollama'],
  FAST_NLP_COMMAND: ['groq', 'mistral', 'openrouter', 'gemini', 'ollama'],
  FRANCOPHONE_DRAFTING: ['mistral', 'gemini', 'openrouter', 'groq', 'ollama'],
  DISPUTE_LEGAL_AUDIT: ['gemini', 'mistral', 'openrouter', 'groq', 'ollama'],
  OFFLINE_LOCAL: ['ollama'],
};

const providerCooldownUntil = new Map<AiProviderId, number>();

export function clearProviderCooldowns(): void {
  providerCooldownUntil.clear();
}

export function getProviderCooldownStatus(nowMs = Date.now()): Record<AiProviderId, number> {
  const result: Record<AiProviderId, number> = {
    gemini: 0,
    groq: 0,
    mistral: 0,
    openrouter: 0,
    ollama: 0,
  };
  for (const provider of ['gemini', 'groq', 'mistral', 'openrouter', 'ollama'] as const) {
    const until = providerCooldownUntil.get(provider) ?? 0;
    result[provider] = Math.max(0, until - nowMs);
  }
  return result;
}

export function resolveAiProviderConfig(overrides?: Partial<AiProviderConfig>): AiProviderConfig {
  const env =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ??
    {};
  return {
    geminiApiKey: overrides?.geminiApiKey ?? env.GEMINI_API_KEY,
    geminiModel: overrides?.geminiModel ?? env.GEMINI_MODEL ?? DEFAULT_AI_MODELS.gemini,
    geminiEmbedModel:
      overrides?.geminiEmbedModel ?? env.GEMINI_EMBED_MODEL ?? DEFAULT_AI_MODELS.geminiEmbed,
    groqApiKey: overrides?.groqApiKey ?? env.GROQ_API_KEY,
    groqModel: overrides?.groqModel ?? env.GROQ_MODEL ?? DEFAULT_AI_MODELS.groq,
    mistralApiKey: overrides?.mistralApiKey ?? env.MISTRAL_API_KEY,
    mistralModel: overrides?.mistralModel ?? env.MISTRAL_MODEL ?? DEFAULT_AI_MODELS.mistral,
    openrouterApiKey: overrides?.openrouterApiKey ?? env.OPENROUTER_API_KEY,
    openrouterModel:
      overrides?.openrouterModel ?? env.OPENROUTER_MODEL ?? DEFAULT_AI_MODELS.openrouter,
    ollamaBaseUrl:
      overrides?.ollamaBaseUrl ?? env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
    ollamaModel: overrides?.ollamaModel ?? env.OLLAMA_MODEL ?? DEFAULT_AI_MODELS.ollama,
    ollamaEmbedModel:
      overrides?.ollamaEmbedModel ?? env.OLLAMA_EMBED_MODEL ?? DEFAULT_AI_MODELS.ollamaEmbed,
  };
}

export function buildProviderChain(
  taskKind: AiTaskKind,
  offlineMode?: boolean,
  preferredProvider?: AiProviderId
): AiProviderId[] {
  if (offlineMode || taskKind === 'OFFLINE_LOCAL') {
    return ['ollama'];
  }
  const baseChain = [...TASK_ROUTING_PRIORITY[taskKind]];
  if (!preferredProvider) {
    return baseChain;
  }
  return [preferredProvider, ...baseChain.filter((p) => p !== preferredProvider)];
}

export interface GatewayRuntimeOptions {
  config?: Partial<AiProviderConfig>;
  fetchFn?: typeof fetch;
  nowFn?: () => number;
  ignoreCooldown?: boolean;
}

class ProviderHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly retryAfterSec?: number
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

function parseRetryAfterSeconds(headerValue: string | null): number {
  if (!headerValue) return 60;
  const parsed = Number(headerValue);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(300, Math.ceil(parsed));
  }
  return 60;
}

function getModelForProvider(provider: AiProviderId, cfg: AiProviderConfig): string {
  switch (provider) {
    case 'gemini':
      return cfg.geminiModel ?? DEFAULT_AI_MODELS.gemini;
    case 'groq':
      return cfg.groqModel ?? DEFAULT_AI_MODELS.groq;
    case 'mistral':
      return cfg.mistralModel ?? DEFAULT_AI_MODELS.mistral;
    case 'openrouter':
      return cfg.openrouterModel ?? DEFAULT_AI_MODELS.openrouter;
    case 'ollama':
      return cfg.ollamaModel ?? DEFAULT_AI_MODELS.ollama;
  }
}

function isProviderConfigured(provider: AiProviderId, cfg: AiProviderConfig): boolean {
  switch (provider) {
    case 'gemini':
      return Boolean(cfg.geminiApiKey?.trim());
    case 'groq':
      return Boolean(cfg.groqApiKey?.trim());
    case 'mistral':
      return Boolean(cfg.mistralApiKey?.trim());
    case 'openrouter':
      return Boolean(cfg.openrouterApiKey?.trim());
    case 'ollama':
      return Boolean(cfg.ollamaBaseUrl?.trim());
  }
}

// ============================================================================
// ADAPTATEURS DE REQUETE / REPONSE PAR FOURNISSEUR
// ============================================================================

function toOpenAiTools(tools?: AiToolDefinition[]): unknown[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function toOpenAiMessages(messages: AiChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      };
    }
    if (m.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: m.toolCallId ?? 'call_0',
        name: m.name,
        content: m.content,
      };
    }
    return {
      role: m.role,
      content: m.content,
    };
  });
}

function safeParseToolArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { _raw: raw };
    }
  }
  return {};
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAiCompatibleProvider(params: {
  provider: 'groq' | 'mistral' | 'openrouter';
  endpoint: string;
  apiKey: string;
  model: string;
  request: AiGatewayRequest;
  fetchFn: typeof fetch;
  timeoutMs: number;
  extraHeaders?: Record<string, string>;
}): Promise<{
  content: string;
  toolCalls: AiToolCallRequest[];
  usage?: AiGatewayResponse['usage'];
}> {
  const toolsPayload = toOpenAiTools(params.request.tools);
  const body: Record<string, unknown> = {
    model: params.model,
    messages: toOpenAiMessages(params.request.messages),
    temperature: params.request.temperature ?? 0.2,
    max_tokens: params.request.maxTokens ?? 2048,
  };
  if (toolsPayload) {
    body.tools = toolsPayload;
    body.tool_choice = 'auto';
  }
  if (params.request.responseFormat === 'json' && !toolsPayload) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetchWithTimeout(
    params.fetchFn,
    params.endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
        ...(params.extraHeaders ?? {}),
      },
      body: JSON.stringify(body),
    },
    params.timeoutMs
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new ProviderHttpError(
      res.status,
      `${params.provider} HTTP ${res.status}: ${errBody.slice(0, 300)}`,
      res.status === 429 ? parseRetryAfterSeconds(res.headers.get('retry-after')) : undefined
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: unknown };
        }>;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };

  const msg = json.choices?.[0]?.message;
  const toolCalls: AiToolCallRequest[] = (msg?.tool_calls ?? [])
    .filter((tc) => Boolean(tc.function?.name))
    .map((tc, index) => ({
      id: tc.id ?? `${params.provider}_call_${index}`,
      name: tc.function!.name!,
      arguments: safeParseToolArguments(tc.function?.arguments),
    }));

  return {
    content: msg?.content ?? '',
    toolCalls,
    usage: json.usage
      ? {
          promptTokens: json.usage.prompt_tokens ?? 0,
          completionTokens: json.usage.completion_tokens ?? 0,
          totalTokens: json.usage.total_tokens ?? 0,
        }
      : undefined,
  };
}

async function callGeminiProvider(params: {
  apiKey: string;
  model: string;
  request: AiGatewayRequest;
  fetchFn: typeof fetch;
  timeoutMs: number;
}): Promise<{
  content: string;
  toolCalls: AiToolCallRequest[];
  usage?: AiGatewayResponse['usage'];
}> {
  const systemParts = params.request.messages
    .filter((m) => m.role === 'system')
    .map((m) => ({ text: m.content }));

  const contents: unknown[] = [];
  for (const m of params.request.messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: m.name ?? 'tool_result',
              response: { result: m.content },
            },
          },
        ],
      });
      continue;
    }
    const parts: unknown[] = [];
    if (m.content) {
      parts.push({ text: m.content });
    }
    if (m.role === 'assistant' && m.toolCalls) {
      for (const tc of m.toolCalls) {
        parts.push({
          functionCall: {
            name: tc.name,
            args: tc.arguments,
          },
        });
      }
    }
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts,
    });
  }

  const generationConfig: Record<string, unknown> = {
    temperature: params.request.temperature ?? 0.2,
    maxOutputTokens: params.request.maxTokens ?? 4096,
  };
  if (params.request.responseFormat === 'json' && !params.request.tools?.length) {
    generationConfig.responseMimeType = 'application/json';
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig,
  };
  if (systemParts.length > 0) {
    body.systemInstruction = { parts: systemParts };
  }
  if (params.request.tools && params.request.tools.length > 0) {
    body.tools = [
      {
        functionDeclarations: params.request.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    params.model
  )}:generateContent?key=${encodeURIComponent(params.apiKey)}`;

  const res = await fetchWithTimeout(
    params.fetchFn,
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    params.timeoutMs
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new ProviderHttpError(
      res.status,
      `gemini HTTP ${res.status}: ${errBody.slice(0, 300)}`,
      res.status === 429 ? parseRetryAfterSeconds(res.headers.get('retry-after')) : undefined
    );
  }

  const json = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          functionCall?: { name?: string; args?: Record<string, unknown> };
        }>;
      };
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const textParts: string[] = [];
  const toolCalls: AiToolCallRequest[] = [];

  parts.forEach((part, idx) => {
    if (part.text) textParts.push(part.text);
    if (part.functionCall?.name) {
      toolCalls.push({
        id: `gemini_call_${idx}`,
        name: part.functionCall.name,
        arguments: safeParseToolArguments(part.functionCall.args),
      });
    }
  });

  return {
    content: textParts.join('\n'),
    toolCalls,
    usage: json.usageMetadata
      ? {
          promptTokens: json.usageMetadata.promptTokenCount ?? 0,
          completionTokens: json.usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: json.usageMetadata.totalTokenCount ?? 0,
        }
      : undefined,
  };
}

async function callOllamaProvider(params: {
  baseUrl: string;
  model: string;
  request: AiGatewayRequest;
  fetchFn: typeof fetch;
  timeoutMs: number;
}): Promise<{
  content: string;
  toolCalls: AiToolCallRequest[];
  usage?: AiGatewayResponse['usage'];
}> {
  const normalizedBase = params.baseUrl.replace(/\/+$/, '');
  const toolsPayload = toOpenAiTools(params.request.tools);
  const body: Record<string, unknown> = {
    model: params.model,
    stream: false,
    messages: params.request.messages.map((m) => ({
      role: m.role === 'tool' ? 'tool' : m.role,
      content: m.content,
    })),
    options: {
      temperature: params.request.temperature ?? 0.2,
      num_predict: params.request.maxTokens ?? 2048,
    },
  };
  if (toolsPayload) {
    body.tools = toolsPayload;
  }
  if (params.request.responseFormat === 'json' && !toolsPayload) {
    body.format = 'json';
  }

  const res = await fetchWithTimeout(
    params.fetchFn,
    `${normalizedBase}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    params.timeoutMs
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new ProviderHttpError(
      res.status,
      `ollama HTTP ${res.status}: ${errBody.slice(0, 300)}`
    );
  }

  const json = (await res.json()) as {
    message?: {
      content?: string;
      tool_calls?: Array<{
        function?: { name?: string; arguments?: Record<string, unknown> };
      }>;
    };
    prompt_eval_count?: number;
    eval_count?: number;
  };

  const toolCalls: AiToolCallRequest[] = (json.message?.tool_calls ?? [])
    .filter((tc) => Boolean(tc.function?.name))
    .map((tc, idx) => ({
      id: `ollama_call_${idx}`,
      name: tc.function!.name!,
      arguments: safeParseToolArguments(tc.function?.arguments),
    }));

  const promptTokens = json.prompt_eval_count ?? 0;
  const completionTokens = json.eval_count ?? 0;

  return {
    content: json.message?.content ?? '',
    toolCalls,
    usage:
      promptTokens || completionTokens
        ? {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          }
        : undefined,
  };
}

// ============================================================================
// ORCHESTRATEUR PRINCIPAL DE LA PASSERELLE AVEC AUTO-FALLBACK
// ============================================================================

export async function invokeAiGateway(
  request: AiGatewayRequest,
  runtime?: GatewayRuntimeOptions
): Promise<AiGatewayResponse> {
  const cfg = resolveAiProviderConfig(runtime?.config);
  const fetchFn = runtime?.fetchFn ?? fetch;
  const nowFn = runtime?.nowFn ?? Date.now;
  const totalStart = nowFn();
  const chain = buildProviderChain(
    request.taskKind,
    request.offlineMode,
    request.preferredProvider
  );

  const attempts: AiProviderAttemptLog[] = [];
  const timeoutMs = request.timeoutMs ?? 25_000;

  for (const provider of chain) {
    const model = getModelForProvider(provider, cfg);
    const attemptStart = nowFn();

    if (!isProviderConfigured(provider, cfg)) {
      attempts.push({
        provider,
        model,
        outcome: 'UNCONFIGURED',
        latencyMs: 0,
        errorMessage: `Clé API ou endpoint manquant pour ${provider}.`,
      });
      continue;
    }

    const cooldownUntil = providerCooldownUntil.get(provider) ?? 0;
    if (!runtime?.ignoreCooldown && cooldownUntil > nowFn()) {
      attempts.push({
        provider,
        model,
        outcome: 'SKIPPED_COOLDOWN',
        latencyMs: 0,
        errorMessage: `Fournisseur temporairement en pause suite à un quota HTTP 429.`,
      });
      continue;
    }

    try {
      let result: {
        content: string;
        toolCalls: AiToolCallRequest[];
        usage?: AiGatewayResponse['usage'];
      };

      if (provider === 'gemini') {
        result = await callGeminiProvider({
          apiKey: cfg.geminiApiKey!,
          model,
          request,
          fetchFn,
          timeoutMs,
        });
      } else if (provider === 'groq') {
        result = await callOpenAiCompatibleProvider({
          provider: 'groq',
          endpoint: 'https://api.groq.com/openai/v1/chat/completions',
          apiKey: cfg.groqApiKey!,
          model,
          request,
          fetchFn,
          timeoutMs,
        });
      } else if (provider === 'mistral') {
        result = await callOpenAiCompatibleProvider({
          provider: 'mistral',
          endpoint: 'https://api.mistral.ai/v1/chat/completions',
          apiKey: cfg.mistralApiKey!,
          model,
          request,
          fetchFn,
          timeoutMs,
        });
      } else if (provider === 'openrouter') {
        result = await callOpenAiCompatibleProvider({
          provider: 'openrouter',
          endpoint: 'https://openrouter.ai/api/v1/chat/completions',
          apiKey: cfg.openrouterApiKey!,
          model,
          request,
          fetchFn,
          timeoutMs,
          extraHeaders: {
            'HTTP-Referer': 'https://commande-publique.cm',
            'X-Title': 'SIGAMP-CM Commande Publique',
          },
        });
      } else {
        result = await callOllamaProvider({
          baseUrl: cfg.ollamaBaseUrl ?? 'http://127.0.0.1:11434',
          model,
          request,
          fetchFn,
          timeoutMs,
        });
      }

      const latencyMs = Math.max(0, nowFn() - attemptStart);
      attempts.push({
        provider,
        model,
        statusCode: 200,
        outcome: 'SUCCESS',
        latencyMs,
      });

      return {
        providerUsed: provider,
        modelUsed: model,
        content: result.content,
        toolCalls: result.toolCalls,
        isOfflineFallback: provider === 'ollama',
        latencyMs: Math.max(0, nowFn() - totalStart),
        usage: result.usage,
        attempts,
      };
    } catch (err) {
      const latencyMs = Math.max(0, nowFn() - attemptStart);
      if (err instanceof ProviderHttpError && err.statusCode === 429) {
        const cooldownMs = (err.retryAfterSec ?? 60) * 1000;
        providerCooldownUntil.set(provider, nowFn() + cooldownMs);
        attempts.push({
          provider,
          model,
          statusCode: 429,
          outcome: 'RATE_LIMITED_429',
          latencyMs,
          errorMessage: err.message,
        });
      } else {
        attempts.push({
          provider,
          model,
          statusCode: err instanceof ProviderHttpError ? err.statusCode : undefined,
          outcome: 'ERROR',
          latencyMs,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const summary = attempts
    .map((a) => `${a.provider}(${a.outcome}${a.statusCode ? `:${a.statusCode}` : ''})`)
    .join(' -> ');
  throw new Error(
    `Échec de tous les fournisseurs IA de la chaîne de repli : ${summary}`
  );
}

// ============================================================================
// EMBEDDINGS VECTORIELS 768 DIMENSIONS (pgvector legal_knowledge_chunks)
// ============================================================================

export async function generateEmbedding768(
  text: string,
  runtime?: GatewayRuntimeOptions & { offlineMode?: boolean }
): Promise<{ provider: 'gemini' | 'ollama'; embedding: number[] }> {
  const cfg = resolveAiProviderConfig(runtime?.config);
  const fetchFn = runtime?.fetchFn ?? fetch;

  if (!runtime?.offlineMode && cfg.geminiApiKey?.trim()) {
    try {
      const model = cfg.geminiEmbedModel ?? DEFAULT_AI_MODELS.geminiEmbed;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:embedContent?key=${encodeURIComponent(cfg.geminiApiKey)}`;
      const res = await fetchWithTimeout(
        fetchFn,
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            outputDimensionality: 768,
          }),
        },
        15_000
      );
      if (res.ok) {
        const data = (await res.json()) as { embedding?: { values?: number[] } };
        if (data.embedding?.values && data.embedding.values.length === 768) {
          return { provider: 'gemini', embedding: data.embedding.values };
        }
      }
    } catch {
      // Fallback silencieux vers Ollama nomic-embed-text
    }
  }

  const baseUrl = (cfg.ollamaBaseUrl ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const ollamaEmbedModel = cfg.ollamaEmbedModel ?? DEFAULT_AI_MODELS.ollamaEmbed;
  const res = await fetchWithTimeout(
    fetchFn,
    `${baseUrl}/api/embeddings`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaEmbedModel,
        prompt: text,
      }),
    },
    15_000
  );

  if (!res.ok) {
    throw new Error(`Impossible de générer l'embedding vectoriel (Ollama HTTP ${res.status}).`);
  }

  const data = (await res.json()) as { embedding?: number[] };
  if (!data.embedding || data.embedding.length === 0) {
    throw new Error('Réponse embedding Ollama vide.');
  }
  return { provider: 'ollama', embedding: data.embedding };
}
