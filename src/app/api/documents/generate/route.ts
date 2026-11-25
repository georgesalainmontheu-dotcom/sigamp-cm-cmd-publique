import { createClient } from '@supabase/supabase-js';
import { guardAiApiRequest } from '../../../../lib/security/apiAuthAndRateLimit';
import {
  buildBpuTableRows,
  buildDqeTableRows,
  computeBpuDqeSummary,
  formatBpuDqeTextBlock,
  type BpuDqeLineItem,
} from '../../../../lib/domain/bpuDqeEngine';
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
import type {
  CmsActTemplateOverride,
  EntityVisualIdentity,
} from '../../../../lib/domain/entityStudioEngine';
import { resolveGedFolderForAct } from '../../../../lib/domain/gedArchiveEngine';
import type { FiscalRegime } from '../../../../types/domain';

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
    }
  | {
      mode: 'BPU_DQE_STANDALONE';
      format: 'pdf' | 'docx';
      entityId: string;
      projectId?: string | null;
      archiveInGed?: boolean;
      primaryColorHex?: string;
      accentColorHex?: string;
      entityName: string;
      entityCode: string;
      city: string;
      consultationNumber: string;
      projectTitle: string;
      fiscalRegime: FiscalRegime;
      blankForBidder?: boolean;
      items: BpuDqeLineItem[];
    };

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json()) as GenerateRequestBody;
    const admin = getServiceSupabase();

    // Hydratation du gabarit Studio (en-tête bilingue/centré, logo, pied de page) & clauses CMS de l'entité
    let studioIdentity: Partial<EntityVisualIdentity> | undefined;
    let actTemplates: CmsActTemplateOverride[] = [];
    if (admin && body.entityId) {
      const { data: entityRow } = await admin
        .from('entities')
        .select(
          'id, code, name, type, municipality, region, department, tutelle_authority, niu, address, phone, email, logo_url, primary_color, accent_color, header_timbre_text, footer_legal_text, studio_config, local_referentials'
        )
        .eq('id', body.entityId)
        .maybeSingle();

      if (entityRow) {
        const sc = (entityRow.studio_config as { identityExtra?: Partial<EntityVisualIdentity> } | null) ?? {};
        const extra = sc.identityExtra ?? {};
        const lr = (entityRow.local_referentials as { actTemplates?: CmsActTemplateOverride[] } | null) ?? {};
        if (Array.isArray(lr.actTemplates)) {
          actTemplates = lr.actTemplates;
        }
        studioIdentity = {
          entityId: entityRow.id,
          entityCode: entityRow.code,
          entityName: entityRow.name,
          entityType: entityRow.type,
          municipality: entityRow.municipality ?? '',
          primaryColor: entityRow.primary_color ?? '#0A1F3D',
          accentColor: entityRow.accent_color ?? '#D4AF37',
          logoUrl: entityRow.logo_url ?? undefined,
          headerTimbreText: entityRow.header_timbre_text ?? undefined,
          footerLegalText: entityRow.footer_legal_text ?? undefined,
          tutelleFr: entityRow.tutelle_authority ?? undefined,
          regionDeptLineFr: [entityRow.region, entityRow.department].filter(Boolean).join(' / ') || undefined,
          taxRegistrationNumber: entityRow.niu ?? undefined,
          footerPhysicalAddress: entityRow.address ?? undefined,
          footerPhone: entityRow.phone ?? undefined,
          footerEmail: entityRow.email ?? undefined,
          ...extra,
        };
      }
    }

    if (body.mode === 'PARAMETRIC_ACT') {
      const rendered = renderParametricAct(body.actCode, body.context);
      const cmsOverride = actTemplates.find(
        (t) => t.actCode === body.actCode && t.enabled
      );
      const effectiveSections = [
        {
          heading: 'IDENTIFICATION & TUTELLE COMPETENTE',
          body: `Commission compétente : ${rendered.commissionCompetente}\n${rendered.tutelleVisaNote}\nRéférence réglementaire : ${rendered.act.legalBasis}\nRégime fiscal applicable : ${rendered.fiscalNote}`,
        },
        ...(cmsOverride?.customVisas?.trim()
          ? [
              {
                heading: 'VISAS SPECIFIQUES ENTITE (CMS)',
                body: cmsOverride.customVisas.trim(),
              },
            ]
          : []),
        {
          heading: 'DISPOSITIONS REGLEMENTAIRES VERROUILLEES (ORDRE PUBLIC)',
          body: rendered.lockedSection,
        },
        {
          heading: 'DISPOSITIF CONTEXTUEL ADAPTE',
          body: rendered.adaptableSection,
        },
        ...(cmsOverride?.customClauses?.trim()
          ? [
              {
                heading: 'CLAUSES PARTICULIERES ENTITE (CMS)',
                body: cmsOverride.customClauses.trim(),
              },
            ]
          : []),
      ];

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
        primaryColorHex: body.primaryColorHex ?? studioIdentity?.primaryColor,
        accentColorHex: body.accentColorHex ?? studioIdentity?.accentColor,
        studioIdentity,
        sections: effectiveSections,
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

      let tables: Array<{ title?: string; rows: string[][] }> | undefined;
      if (body.dtaoInput.bpuItems && body.dtaoInput.bpuItems.length > 0) {
        const summary = computeBpuDqeSummary(body.dtaoInput.bpuItems, {
          fiscalRegime: body.dtaoInput.fiscalRegime,
        });
        const blank = Boolean(body.dtaoInput.blankBidderTables);
        sections.unshift({
          heading: 'ANNEXE CHIFFREE — BPU / DQE CONTEXTUEL & FISCALITE CGI',
          body: formatBpuDqeTextBlock(summary),
        });
        tables = [
          {
            title: blank
              ? 'PIECE IV — CADRE DU BORDEREAU DES PRIX UNITAIRES (A COMPLETER PAR LE SOUMISSIONNAIRE)'
              : 'PIECE IV — BORDEREAU DES PRIX UNITAIRES (BPU CHIFFRE)',
            rows: buildBpuTableRows(summary, blank),
          },
          {
            title: blank
              ? 'PIECE V — CADRE DU DEVIS QUANTITATIF ET ESTIMATIF (DQE SOUMISSIONNAIRE)'
              : 'PIECE V — DEVIS QUANTITATIF ET ESTIMATIF (DQE CONFIDENTIEL / ESTIMATION)',
            rows: buildDqeTableRows(summary, blank),
          },
        ];
      }

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
        primaryColorHex: body.primaryColorHex ?? studioIdentity?.primaryColor,
        accentColorHex: body.accentColorHex ?? studioIdentity?.accentColor,
        studioIdentity,
        sections,
        tables,
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

    if (body.mode === 'BPU_DQE_STANDALONE') {
      const summary = computeBpuDqeSummary(body.items, {
        fiscalRegime: body.fiscalRegime,
      });
      const blank = Boolean(body.blankForBidder);

      const docInput = {
        documentCategory: blank ? 'CADRE_BPU_DQE_VIERGE' : 'BPU_DQE_ESTIMATIF',
        documentNumber: body.consultationNumber,
        title: `Pièces IV & V (BPU / DQE) — ${body.projectTitle}`,
        entityId: body.entityId,
        entityName: body.entityName,
        entityCode: body.entityCode,
        city: body.city,
        signatoryTitle: "Le Maître d'Ouvrage / Service des Marchés (SIGAMP)",
        signatoryName: body.entityName,
        actorUserId: guard.userId,
        actorRole: 'SIGAMP' as const,
        primaryColorHex: body.primaryColorHex ?? studioIdentity?.primaryColor,
        accentColorHex: body.accentColorHex ?? studioIdentity?.accentColor,
        studioIdentity,
        sections: [
          {
            heading: 'SYNTHESE FINANCIERE & FISCALITE CGI EN VIGUEUR',
            body: blank
              ? `Cadre du BPU et du DQE préparé pour remise aux candidats (${summary.lines.length} postes). En cas de discordance entre le prix unitaire en chiffres et celui en toutes lettres, le prix en toutes lettres fait foi (RGAO/RPDC ARMP).`
              : formatBpuDqeTextBlock(summary),
          },
        ],
        tables: [
          {
            title: 'PIECE IV — BORDEREAU DES PRIX UNITAIRES (BPU)',
            rows: buildBpuTableRows(summary, blank),
          },
          {
            title: 'PIECE V — DEVIS QUANTITATIF ET ESTIMATIF (DQE)',
            rows: buildDqeTableRows(summary, blank),
          },
        ],
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
          folder_code: blank ? '02_LANCEMENT_DAO_DC' : '01_MATURATION_BUDGET',
          document_category: docInput.documentCategory,
          act_code: 'BPU_DQE_STRUCTURE',
          title: docInput.title,
          chrono_number: body.consultationNumber,
          file_name: exported.fileName,
          mime_type:
            body.format === 'docx'
              ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : 'application/pdf',
          file_size_bytes: bytes.byteLength,
          sha256_hash: sha256,
          version_number: 1,
          lifecycle_status: 'SIGNE_SCELLE',
          content_text: formatBpuDqeTextBlock(summary),
          qr_verification_id: qrId,
          actor_user_id: guard.userId,
          actor_role: 'SIGAMP',
          metadata: {
            mode: 'BPU_DQE_STANDALONE',
            blank,
            totalHt: summary.totalHt,
            totalTtc: summary.totalTtc,
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
        pageCount: 'pageCount' in exported ? exported.pageCount : undefined,
        summary,
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
