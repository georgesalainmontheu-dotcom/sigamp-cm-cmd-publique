import fs from 'node:fs';
import path from 'node:path';
import {
  applyContextualLegalAdaptationsToText,
  type AdaptedOfficialDtaoBundle,
  type ContextualDtaoAdaptationInput,
  type OfficialPageData,
} from './officialDtaoEngine';

interface OfficialJsonDocument {
  slug: string;
  title: string;
  kind: string;
  pdfPath: string;
  totalPages: number;
  pages: OfficialPageData[];
}

const CACHE = new Map<string, OfficialJsonDocument>();

export function loadOfficialJsonDocument(slug: string): OfficialJsonDocument | null {
  const safeSlug = slug.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeSlug) return null;
  if (CACHE.has(safeSlug)) return CACHE.get(safeSlug)!;

  const filePath = path.join(process.cwd(), 'src', 'data', 'official', `${safeSlug}.json`);
  if (!fs.existsSync(filePath)) return null;

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as OfficialJsonDocument;
  CACHE.set(safeSlug, parsed);
  return parsed;
}

export function buildAdaptedOfficialDtaoDocument(
  input: ContextualDtaoAdaptationInput
): AdaptedOfficialDtaoBundle | null {
  const doc = loadOfficialJsonDocument(input.slug);
  if (!doc) return null;

  const adaptedPages = doc.pages.map((p) => ({
    page: p.page,
    text: applyContextualLegalAdaptationsToText(p.text, input),
  }));

  return {
    slug: input.slug,
    title: doc.title,
    totalPages: doc.totalPages,
    pages: adaptedPages,
    appliedContextSummary: `${input.entityName} (${input.entityType}) | ${input.consultationNumber} | ${Math.round(input.estimatedAmountTtc).toLocaleString('fr-FR')} FCFA TTC | ${input.executionDays}j`,
  };
}

export function searchOfficialLibraryPages(params: {
  slug: string;
  query?: string;
  pageStart?: number;
  limit?: number;
}): {
  slug: string;
  title: string;
  totalPages: number;
  pdfPath: string;
  matchesCount: number;
  pages: OfficialPageData[];
} | null {
  const doc = loadOfficialJsonDocument(params.slug);
  if (!doc) return null;

  const q = (params.query ?? '').trim().toLowerCase();
  const limit = Math.min(Math.max(params.limit ?? 12, 1), 50);

  if (q) {
    const matched = doc.pages.filter((p) => p.text.toLowerCase().includes(q));
    return {
      slug: doc.slug,
      title: doc.title,
      totalPages: doc.totalPages,
      pdfPath: doc.pdfPath,
      matchesCount: matched.length,
      pages: matched.slice(0, limit),
    };
  }

  const start = Math.max((params.pageStart ?? 1) - 1, 0);
  return {
    slug: doc.slug,
    title: doc.title,
    totalPages: doc.totalPages,
    pdfPath: doc.pdfPath,
    matchesCount: doc.totalPages,
    pages: doc.pages.slice(start, start + limit),
  };
}
