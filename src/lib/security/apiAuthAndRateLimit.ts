import { createClient } from '@supabase/supabase-js';

/**
 * Couche de sécurité V1.1 pour les routes API Next.js :
 * 1. Vérification JWT Supabase (`supabase.auth.getUser`)
 *    (contournable uniquement si ALLOW_UNAUTHENTICATED_API_TEST=true en test local)
 * 2. Rate Limiter par fenêtre glissante (30 req / min / utilisateur ou IP)
 */

export interface ApiAuthCheckResult {
  authenticated: boolean;
  userId: string;
  email?: string;
  isTestBypass?: boolean;
  error?: string;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

interface RateLimitBucket {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitBucket>();

export function resetApiRateLimiter(): void {
  rateLimitStore.clear();
}

function getEnv(name: string): string | undefined {
  const env =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ??
    {};
  return env[name];
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token) return token;
  }

  // Fallback cookie Supabase Auth si présent
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const c of cookies) {
      const eqIdx = c.indexOf('=');
      if (eqIdx === -1) continue;
      const key = c.slice(0, eqIdx);
      const val = decodeURIComponent(c.slice(eqIdx + 1));
      if (key.includes('-auth-token')) {
        try {
          const parsed = JSON.parse(val) as { access_token?: string } | [string];
          if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
            return parsed[0];
          }
          if (!Array.isArray(parsed) && parsed.access_token) {
            return parsed.access_token;
          }
        } catch {
          if (val.split('.').length === 3) return val;
        }
      }
    }
  }
  return null;
}

export async function verifyApiJwtAuth(
  req: Request,
  options?: {
    verifyTokenFn?: (
      token: string
    ) => Promise<{ userId: string; email?: string } | null>;
  }
): Promise<ApiAuthCheckResult> {
  if (getEnv('ALLOW_UNAUTHENTICATED_API_TEST') === 'true') {
    return {
      authenticated: true,
      userId: 'test-local-bypass',
      isTestBypass: true,
    };
  }

  const token = extractBearerToken(req);
  if (!token) {
    return {
      authenticated: false,
      userId: 'anonymous',
      error: 'Authentification requise : jeton Bearer Supabase manquant.',
    };
  }

  if (options?.verifyTokenFn) {
    const verified = await options.verifyTokenFn(token);
    if (!verified) {
      return {
        authenticated: false,
        userId: 'anonymous',
        error: 'Jeton d’authentification invalide ou expiré.',
      };
    }
    return {
      authenticated: true,
      userId: verified.userId,
      email: verified.email,
    };
  }

  const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseKey =
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? getEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    return {
      authenticated: false,
      userId: 'anonymous',
      error: 'Configuration Supabase absente pour vérifier le jeton JWT.',
    };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return {
        authenticated: false,
        userId: 'anonymous',
        error: error?.message ?? 'Session Supabase invalide ou expirée.',
      };
    }
    return {
      authenticated: true,
      userId: data.user.id,
      email: data.user.email,
    };
  } catch (err) {
    return {
      authenticated: false,
      userId: 'anonymous',
      error: err instanceof Error ? err.message : 'Erreur vérification JWT Supabase.',
    };
  }
}

export function extractClientIdentifier(req: Request, userId: string): string {
  if (userId && userId !== 'anonymous' && userId !== 'test-local-bypass') {
    return `user:${userId}`;
  }
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
  return `ip:${ip}:${userId}`;
}

export function checkApiRateLimit(
  identifier: string,
  options?: {
    maxRequests?: number;
    windowMs?: number;
    nowFn?: () => number;
  }
): RateLimitCheckResult {
  const maxRequests = options?.maxRequests ?? 30;
  const windowMs = options?.windowMs ?? 60_000;
  const now = options?.nowFn ? options.nowFn() : Date.now();
  const windowStart = now - windowMs;

  const bucket = rateLimitStore.get(identifier) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > windowStart);

  if (bucket.timestamps.length >= maxRequests) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterMs = Math.max(1000, oldest + windowMs - now);
    rateLimitStore.set(identifier, bucket);
    return {
      allowed: false,
      limit: maxRequests,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  bucket.timestamps.push(now);
  rateLimitStore.set(identifier, bucket);

  return {
    allowed: true,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - bucket.timestamps.length),
    retryAfterSeconds: 0,
  };
}

export async function guardAiApiRequest(
  req: Request,
  options?: {
    maxRequestsPerMinute?: number;
    verifyTokenFn?: (
      token: string
    ) => Promise<{ userId: string; email?: string } | null>;
  }
): Promise<
  | { ok: true; userId: string; remaining: number }
  | { ok: false; response: Response }
> {
  const auth = await verifyApiJwtAuth(req, {
    verifyTokenFn: options?.verifyTokenFn,
  });
  if (!auth.authenticated) {
    return {
      ok: false,
      response: Response.json(
        { error: auth.error ?? 'Non autorisé (401).' },
        { status: 401 }
      ),
    };
  }

  const clientKey = extractClientIdentifier(req, auth.userId);
  const rate = checkApiRateLimit(clientKey, {
    maxRequests: options?.maxRequestsPerMinute ?? 30,
    windowMs: 60_000,
  });

  if (!rate.allowed) {
    return {
      ok: false,
      response: Response.json(
        {
          error:
            'Trop de requêtes IA (limite de 30 requêtes/minute atteinte). Veuillez patienter.',
          retryAfterSeconds: rate.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rate.retryAfterSeconds),
          },
        }
      ),
    };
  }

  return {
    ok: true,
    userId: auth.userId,
    remaining: rate.remaining,
  };
}
