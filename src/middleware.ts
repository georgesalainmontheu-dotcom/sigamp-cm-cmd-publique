import type { NextRequest } from 'next/server';
import { handleAuthSessionMiddleware } from './lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return handleAuthSessionMiddleware(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icon.svg|tit-cs-logo.svg|official-docs/).*)',
  ],
};
