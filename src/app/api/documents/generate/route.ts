import { createClient } from '@supabase/supabase-js';
import { guardAiApiRequest } from '../../../../lib/security/apiAuthAndRateLimit';
import {
  renderParametricAct,
  type ParametricAdaptationContext,
} from '../../../../lib/domain/parametricActsEngine';
import type { ContextualDtaoAdaptationInput } from '../../../../lib/domain/officialDtaoEngine';
import { buildAdaptedOfficialDtaoDocument } from '../../../../lib/domain/officialDtaoServerLoader';
import {
  buildMultiPageOfficialPdf,
  buildOfficialDocxBuffer,
} from '../../../../lib/pdf/officeAndPdfExporter';
import { resolveGedFolderForAct } from '../../../../lib/domain/gedArchiveEngine';

export const runtime = 'nodejs';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type GenerateRequestBody =
  | {
      mode: 'PARAMETRIC_ACT';
      format: 'pdf' | 'docx';
      actCode: string;
      entityId: string;
      projectId?: string | null;
      archiveInGed?: boolean;
      primaryColorHex?: string;
      accentColorHex?: string;
      context: ParametricAdaptationContext;
    }
  | {
      mode: 'OFFICIAL_DTAO_OR_DC';
      format: 'pdf' | 'docx';
      entityId: string;
      projectId?: string | null;
      archiveInGed?: boolean;
      primaryColorHex?: string;
      accentColorHex?: string;
      dtaoInput: ContextualDtaoAdaptationInput;
    };

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json()) as GenerateRequestBody;
    const admin = getServiceSupabase();

    if (body.mode === 'PARAMETRIC_ACT') {
      const rendered = renderParametricAct(body.actCode, body.context);
      const docInput = {
        documentCategory: rendered.act.actCode,
        documentNumber: body.context.chronoNumber,
        title: rendered.subject,
        entityId: body.entityId,
        entityName: body.context.entityName,
        entityCode: body.context.entityCode,
        city: body.context.city,
        signatoryTitle: body.context.signerTitle,
        signatoryName: body.context.signerName,
        actorUserId: guard.userId,
        actorRole: rendered.act.roleOwner,
        primaryColorHex: body.primaryColorHex,
        accentColorHex: body.accentColorHex,
        sections: [
          {
            heading: 'IDENTIFICATION & TUTELLE COMPETENTE',
            body: `Commission compétente : ${rendered.commissionCompetente}\n${rendered.tutelleVisaNote}\nRéférence réglementaire : ${rendered.act.legalBasis}\nRégime fiscal applicable : ${rendered.fiscalNote}`,
          },
          {
            heading: 'DISPOSITIONS REGLEMENTAIRES VERROUILLEES (ORDRE PUBLIC)',
            body: rendered.lockedSection,
          },
          {
            heading: 'DISPOSITIF CONTEXTUEL ADAPTE',
            body: rendered.adaptableSection,
          },
        ],
        ampliations: rendered.ampliations,
      };

      const exported =
        body.format === 'docx'
          ? await buildOfficialDocxBuffer(docInput)
          : await buildMultiPageOfficialPdf(docInput);

      const bytes = 'pdfBytes' in exported ? exported.pdfBytes : exported.docxBytes;
      const sha256 = 'sha256Seal' in exported ? exported.sha256Seal : exported.sha256;
      const qrId = 'qrVerificationId' in exported ? exported.qrVerificationId : null;

      if (body.archiveInGed && admin) {
        const folderCode = resolveGedFolderForAct(rendered.act.actCode);
        await admin.from('ged_documents').insert({
          entity_id: body.entityId,
          project_id: body.projectId || null,
          folder_code: folderCode,
          document_category: body.format === 'docx' ? 'ACTE_DOCX' : 'ACTE_PDF',
          act_code: rendered.act.actCode,
          title: rendered.subject,
          chrono_number: body.context.chronoNumber,
          file_name: exported.fileName,
          mime_type:
            body.format === 'docx'
              ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : 'application/pdf',
          file_size_bytes: bytes.byteLength,
          sha256_hash: sha256,
          version_number: 1,
          lifecycle_status: 'SIGNE_SCELLE',
          content_text: rendered.fullDocumentText,
          qr_verification_id: qrId,
          actor_user_id: guard.userId,
          actor_role: rendered.act.roleOwner,
          metadata: { mode: 'PARAMETRIC_ACT', format: body.format },
        });
      }

      return Response.json({
        fileName: exported.fileName,
        mimeType:
          body.format === 'docx'
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/pdf',
        sha256,
        qrVerificationId: qrId,
        pageCount: 'pageCount' in exported ? exported.pageCount : undefined,
        previewText: rendered.fullDocumentText,
        base64: Buffer.from(bytes).toString('base64'),
      });
    }

    if (body.mode === 'OFFICIAL_DTAO_OR_DC') {
      const bundle = buildAdaptedOfficialDtaoDocument(body.dtaoInput);
      if (!bundle) {
        return Response.json(
          { error: `Modèle officiel introuvable pour slug=${body.dtaoInput.slug}` },
          { status: 404 }
        );
      }

      const sections = bundle.pages.map((p) => ({
        heading: `PAGE OFFICIELLE ${p.page} / ${bundle.totalPages}`,
        body: p.text,
      }));

      const docInput = {
        documentCategory: body.dtaoInput.slug === 'dt_demande_cotation' ? 'DOSSIER_COTATION' : 'DAO_INTEGRAL',
        documentNumber: body.dtaoInput.consultationNumber,
        title: `${bundle.title} - ${body.dtaoInput.projectTitle}`,
        entityId: body.entityId,
        entityName: body.dtaoInput.entityName,
        entityCode: body.dtaoInput.entityName.slice(0, 12).toUpperCase(),
        city: body.dtaoInput.city,
        signatoryTitle: "L'Autorité Contractante / Maître d'Ouvrage",
        signatoryName: body.dtaoInput.entityName,
        actorUserId: guard.userId,
        actorRole: 'SIGAMP' as const,
        primaryColorHex: body.primaryColorHex,
        accentColorHex: body.accentColorHex,
        sections,
      };

      const exported =
        body.format === 'docx'
          ? await buildOfficialDocxBuffer(docInput)
          : await buildMultiPageOfficialPdf(docInput);

      const bytes = 'pdfBytes' in exported ? exported.pdfBytes : exported.docxBytes;
      const sha256 = 'sha256Seal' in exported ? exported.sha256Seal : exported.sha256;
      const qrId = 'qrVerificationId' in exported ? exported.qrVerificationId : null;

      if (body.archiveInGed && admin) {
        await admin.from('ged_documents').insert({
          entity_id: body.entityId,
          project_id: body.projectId || null,
          folder_code: '02_LANCEMENT_DAO_DC',
          document_category: docInput.documentCategory,
          act_code: body.dtaoInput.slug.toUpperCase(),
          title: docInput.title,
          chrono_number: body.dtaoInput.consultationNumber,
          file_name: exported.fileName,
          mime_type:
            body.format === 'docx'
              ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : 'application/pdf',
          file_size_bytes: bytes.byteLength,
          sha256_hash: sha256,
          version_number: 1,
          lifecycle_status: 'SIGNE_SCELLE',
          content_text: bundle.pages.slice(0, 6).map((p) => p.text).join('\n\n'),
          qr_verification_id: qrId,
          actor_user_id: guard.userId,
          actor_role: 'SIGAMP',
          metadata: {
            slug: body.dtaoInput.slug,
            sourcePages: bundle.totalPages,
            format: body.format,
          },
        });
      }

      return Response.json({
        fileName: exported.fileName,
        mimeType:
          body.format === 'docx'
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/pdf',
        sha256,
        qrVerificationId: qrId,
        sourceOfficialPages: bundle.totalPages,
        generatedPages: 'pageCount' in exported ? exported.pageCount : undefined,
        appliedContextSummary: bundle.appliedContextSummary,
        previewPages: bundle.pages.slice(0, 5),
        base64: Buffer.from(bytes).toString('base64'),
      });
    }

    return Response.json({ error: 'Mode de génération inconnu.' }, { status: 400 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
