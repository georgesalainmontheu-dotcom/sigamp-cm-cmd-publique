import {
  buildProviderChain,
  generateEmbedding768,
  getProviderCooldownStatus,
  invokeAiGateway,
  resolveAiProviderConfig,
  TASK_ROUTING_PRIORITY,
} from '../../../../lib/ai/aiGateway';
import {
  AI_TOOL_DEFINITIONS,
  runAgenticWorkflow,
} from '../../../../lib/ai/aiTools';
import { guardAiApiRequest } from '../../../../lib/security/apiAuthAndRateLimit';
import type {
  AiChatMessage,
  AiProviderId,
  AiTaskKind,
  AiToolExecutionContext,
} from '../../../../types/ai';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const cfg = resolveAiProviderConfig();
  return Response.json({
    status: 'ok',
    service: 'Passerelle IA Multi-Fournisseurs Commande Publique CM',
    providers: {
      gemini: { configured: Boolean(cfg.geminiApiKey), model: cfg.geminiModel },
      groq: { configured: Boolean(cfg.groqApiKey), model: cfg.groqModel },
      mistral: { configured: Boolean(cfg.mistralApiKey), model: cfg.mistralModel },
      openrouter: { configured: Boolean(cfg.openrouterApiKey), model: cfg.openrouterModel },
      ollama: { configured: Boolean(cfg.ollamaBaseUrl), baseUrl: cfg.ollamaBaseUrl, model: cfg.ollamaModel },
    },
    routingPriority: TASK_ROUTING_PRIORITY,
    cooldownRemainingMs: getProviderCooldownStatus(),
    availableTools: AI_TOOL_DEFINITIONS.map((t) => t.name),
  });
}

interface GatewayPostBody {
  mode?: 'gateway' | 'copilot' | 'embed';
  taskKind?: AiTaskKind;
  messages?: AiChatMessage[];
  userPrompt?: string;
  history?: AiChatMessage[];
  context?: AiToolExecutionContext;
  textToEmbed?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
  offlineMode?: boolean;
  preferredProvider?: AiProviderId;
  enableTools?: boolean;
}

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json()) as GatewayPostBody;
    const mode = body.mode ?? (body.userPrompt && body.context ? 'copilot' : 'gateway');

    if (mode === 'embed') {
      if (!body.textToEmbed?.trim()) {
        return Response.json(
          { error: 'Le champ "textToEmbed" est requis pour le mode embed.' },
          { status: 400 }
        );
      }
      const embedded = await generateEmbedding768(body.textToEmbed, {
        offlineMode: body.offlineMode,
      });
      return Response.json({
        mode: 'embed',
        provider: embedded.provider,
        dimensions: embedded.embedding.length,
        embedding: embedded.embedding,
      });
    }

    if (mode === 'copilot') {
      if (!body.userPrompt?.trim() || !body.context) {
        return Response.json(
          {
            error:
              'Les champs "userPrompt" et "context" (entité, acteur, exercice) sont requis pour le mode copilot.',
          },
          { status: 400 }
        );
      }
      const result = await runAgenticWorkflow({
        userPrompt: body.userPrompt,
        history: body.history,
        context: body.context,
        offlineMode: body.offlineMode,
      });
      return Response.json({ mode: 'copilot', ...result });
    }

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return Response.json(
        { error: 'Le tableau "messages" est requis et ne peut pas être vide.' },
        { status: 400 }
      );
    }

    const taskKind: AiTaskKind = body.taskKind ?? 'FAST_NLP_COMMAND';
    const response = await invokeAiGateway({
      taskKind,
      messages: body.messages,
      tools: body.enableTools ? AI_TOOL_DEFINITIONS : undefined,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      responseFormat: body.responseFormat,
      offlineMode: body.offlineMode,
      preferredProvider: body.preferredProvider,
    });

    return Response.json({
      mode: 'gateway',
      routingChain: buildProviderChain(taskKind, body.offlineMode, body.preferredProvider),
      ...response,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne passerelle IA.';
    const status = message.includes('Échec de tous les fournisseurs') ? 503 : 500;
    return Response.json({ error: message }, { status });
  }
}
