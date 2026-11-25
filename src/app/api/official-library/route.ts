import { guardAiApiRequest } from '../../../lib/security/apiAuthAndRateLimit';
import {
  OFFICIAL_DTAO_LIST,
  OFFICIAL_LEGAL_LIBRARY_LIST,
} from '../../../lib/domain/officialDtaoEngine';
import { searchOfficialLibraryPages } from '../../../lib/domain/officialDtaoServerLoader';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');
  const q = url.searchParams.get('q') ?? undefined;
  const pageStart = Number(url.searchParams.get('pageStart') ?? '1');
  const limit = Number(url.searchParams.get('limit') ?? '8');

  if (!slug) {
    return Response.json({
      dtaoCatalog: OFFICIAL_DTAO_LIST,
      legalLibrary: OFFICIAL_LEGAL_LIBRARY_LIST,
    });
  }

  const result = searchOfficialLibraryPages({
    slug,
    query: q,
    pageStart: Number.isFinite(pageStart) ? pageStart : 1,
    limit: Number.isFinite(limit) ? limit : 8,
  });

  if (!result) {
    return Response.json({ error: `Document officiel introuvable : ${slug}` }, { status: 404 });
  }

  return Response.json(result);
}
