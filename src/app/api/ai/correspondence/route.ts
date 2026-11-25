import {
  DEFAULT_NATIONAL_TEMPLATES,
  generateAdministrativeCorrespondence,
  learnTemplateFromValidatedDocument,
} from '../../../../lib/ai/correspondenceGenerator';
import type {
  GenerateCorrespondenceInput,
  LearnTemplateInput,
} from '../../../../types/ai';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return Response.json({
    status: 'ok',
    nationalTemplatesCount: DEFAULT_NATIONAL_TEMPLATES.length,
    supportedCaseTypes: Array.from(
      new Set(DEFAULT_NATIONAL_TEMPLATES.map((t) => t.caseType))
    ),
  });
}

type CorrespondencePostBody =
  | ({ action?: 'generate' } & GenerateCorrespondenceInput)
  | ({ action: 'learn' } & LearnTemplateInput);

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as CorrespondencePostBody;

    if (body.action === 'learn') {
      if (!body.validatedBody?.trim() || !body.validatedSubject?.trim()) {
        return Response.json(
          { error: 'validatedSubject et validatedBody sont requis pour capitaliser un modèle.' },
          { status: 400 }
        );
      }
      const proposal = learnTemplateFromValidatedDocument(body);
      return Response.json({ action: 'learn', ...proposal });
    }

    if (!body.entityId || !body.caseType || !body.header || !body.sqlContext) {
      return Response.json(
        { error: 'entityId, caseType, header et sqlContext sont requis.' },
        { status: 400 }
      );
    }

    const generated = await generateAdministrativeCorrespondence(body);
    return Response.json({ action: 'generate', ...generated });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Erreur lors de la génération de correspondance.';
    return Response.json({ error: message }, { status: 500 });
  }
}
