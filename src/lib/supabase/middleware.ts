import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/avis',
  '/verify',
  '/legal',
  '/docs',
  '/api/',
  '/_next',
  '/sw.js',
  '/manifest.webmanifest',
  '/icon.svg',
  '/favicon.ico',
];

export function isPublicAppRoute(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );
}

export function isDemoModeAllowed(): boolean {
  return process.env.NEXT_PUBLIC_ALLOW_DEMO_ROLE_SWITCHER === 'true';
}

function extractAccessTokenFromRequest(request: NextRequest): string | null {
  const explicitCookie = request.cookies.get('sigamp-sb-access-token')?.value;
  if (explicitCookie) {
    return decodeURIComponent(explicitCookie);
  }

  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.includes('-auth-token')) {
      try {
        const decoded = decodeURIComponent(cookie.value);
        const parsed = JSON.parse(decoded) as { access_token?: string } | [string];
        if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
          return parsed[0];
        }
        if (!Array.isArray(parsed) && parsed.access_token) {
          return parsed.access_token;
        }
      } catch {
        if (cookie.value.split('.').length === 3) return cookie.value;
      }
    }
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, '').trim() || null;
  }

  return null;
}

export async function handleAuthSessionMiddleware(
  request: NextRequest,
  options?: {
    verifyUserFn?: (token: string) => Promise<boolean>;
  }
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isPublicAppRoute(pathname)) {
    return NextResponse.next();
  }

  if (isDemoModeAllowed()) {
    return NextResponse.next();
  }

  const token = extractAccessTokenFromRequest(request);
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  let isAuthenticated = false;
  if (options?.verifyUserFn) {
    isAuthenticated = await options.verifyUserFn(token);
  } else {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await supabase.auth.getUser(token);
        isAuthenticated = Boolean(!error && data.user);
      } catch {
        isAuthenticated = false;
      }
    }
  }

  if (!isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete('sigamp-sb-access-token');
    return res;
  }

  return NextResponse.next();
}
