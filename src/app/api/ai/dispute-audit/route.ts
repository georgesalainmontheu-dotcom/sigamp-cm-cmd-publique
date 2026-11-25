import { analyzeAndDraftDisputeResponse } from '../../../../lib/ai/disputeAnalyzer';
import { guardAiApiRequest } from '../../../../lib/security/apiAuthAndRateLimit';
import type { DisputeAuditInput } from '../../../../types/ai';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json()) as DisputeAuditInput;

    if (
      !body.entityId ||
      !body.disputeNumber ||
      !body.filedAtIso ||
      !body.referenceEventAtIso ||
      !body.openingPv ||
      !Array.isArray(body.bids)
    ) {
      return Response.json(
        {
          error:
            'Champs obligatoires manquants : entityId, disputeNumber, filedAtIso, referenceEventAtIso, openingPv, bids.',
        },
        { status: 400 }
      );
    }

    const result = await analyzeAndDraftDisputeResponse(body);
    return Response.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erreur lors de l'audit juridique du contentieux.";
    return Response.json({ error: message }, { status: 500 });
  }
}
