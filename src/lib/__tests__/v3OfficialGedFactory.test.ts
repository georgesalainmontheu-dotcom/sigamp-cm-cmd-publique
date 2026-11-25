import { describe, expect, it } from 'vitest';
import {
  buildBpuTableRows,
  buildDqeTableRows,
  computeBpuDqeSummary,
  exportBpuToCsv,
  getPresetBpuLines,
  numberToFrenchWordsFcfa,
  parseBpuFromCsv,
} from '../domain/bpuDqeEngine';
import {
  buildAuditDossierCoverPdf,
  GED_FOLDER_DEFINITIONS,
  resolveGedFolderForAct,
  searchGedDocumentsLocal,
} from '../domain/gedArchiveEngine';
import { PURGE_OPERATIONAL_TABLES_ORDERED } from '../domain/entityResetEngine';
import {
  OFFICIAL_DTAO_LIST,
  OFFICIAL_LEGAL_LIBRARY_LIST,
} from '../domain/officialDtaoEngine';
import {
  buildAdaptedOfficialDtaoDocument,
  searchOfficialLibraryPages,
} from '../domain/officialDtaoServerLoader';
import {
  PARAMETRIC_ACTS_CATALOG_44,
  renderParametricAct,
} from '../domain/parametricActsEngine';
import {
  buildMultiPageOfficialPdf,
  buildOfficialDocxBuffer,
} from '../pdf/officeAndPdfExporter';

describe('SIGAMP-CM V3.0 — Préfectures, GED Régalienne, 44 Actes, DTAO/DC Intégral & Export PDF/DOCX', () => {
  it('expose les 44 actes réglementaires paramétriques et adapte CDPM/CIPM/CRPM + fiscalité CGI', () => {
    expect(PARAMETRIC_ACTS_CATALOG_44).toHaveLength(44);

    const renderedPref = renderParametricAct('ACT_14_SAISINE_CPM_EXAMEN_DCE_OU_RAPPORT', {
      entityName: 'Préfecture du Haut-Nkam',
      entityCode: 'CM-OU-PREF-HN',
      entityType: 'PREFECTURE',
      hasOwnCipm: true,
      city: 'Bafang',
      fiscalYear: 2026,
      chronoNumber: '001/PREF-HN/CDPM/2026',
      dateFormatted: '23/11/2026',
      signerTitle: 'Le Préfet du Haut-Nkam / MOD',
      signerName: 'M. le Préfet',
      recipientLabel: 'Président CDPM Haut-Nkam',
      projectCode: 'HN-2026-004',
      projectTitle: 'Construction bloc administratif Sous-Préfecture de Bakou',
      nature: 'TRAVAUX',
      procurementMode: 'AONO',
      contractType: 'MARCHE',
      fundingSource: 'BIP_ETAT',
      fiscalRegime: 'SIMPLIFIE',
      isUrgency: true,
      isMultiLot: false,
      amountTtcFcfa: 68_000_000,
      executionDays: 120,
    });

    expect(renderedPref.commissionCompetente).toContain('CDPM');
    expect(renderedPref.fiscalNote).toContain('5,5 %');
    expect(renderedPref.fullDocumentText).toContain('HN-2026-004');
    expect(renderedPref.fullDocumentText).toContain('Ordonnateur de la CDPM (Art. 13 CMP)');

    const renderedNote = renderParametricAct('ACT_01_NOTE_PRESENTATION_DCE', {
      entityName: 'Préfecture du Haut-Nkam',
      entityCode: 'CM-OU-PREF-HN',
      entityType: 'PREFECTURE',
      hasOwnCipm: true,
      city: 'Bafang',
      fiscalYear: 2026,
      chronoNumber: '002/PREF-HN/2026',
      dateFormatted: '23/11/2026',
      signerTitle: 'Le Préfet du Haut-Nkam / MOD',
      signerName: 'M. le Préfet',
      recipientLabel: 'Président CDPM Haut-Nkam',
      projectCode: 'HN-2026-004',
      projectTitle: 'Construction bloc administratif Sous-Préfecture de Bakou',
      nature: 'TRAVAUX',
      procurementMode: 'AONO',
      contractType: 'MARCHE',
      fundingSource: 'BIP_ETAT',
      fiscalRegime: 'SIMPLIFIE',
      isUrgency: true,
      isMultiLot: false,
      amountTtcFcfa: 68_000_000,
      executionDays: 120,
    });
    expect(renderedNote.fullDocumentText).toContain('BIP');
    expect(renderedNote.fullDocumentText).toContain('URGENCE');
  });

  it('indexe les 10 PDF officiels ARMP (1 141 pages) et adapte intégralement la Demande de Cotation (171 pages)', () => {
    const totalPagesCatalog =
      OFFICIAL_DTAO_LIST.reduce((acc, d) => acc + d.totalPages, 0) +
      OFFICIAL_LEGAL_LIBRARY_LIST.reduce((acc, d) => acc + d.totalPages, 0);
    expect(totalPagesCatalog).toBe(1141);

    const adaptedDc = buildAdaptedOfficialDtaoDocument({
      slug: 'dt_demande_cotation',
      entityName: 'Commune de Bafang',
      entityType: 'COMMUNE',
      parentTutelleName: 'Préfecture du Haut-Nkam',
      hasOwnCipm: false,
      city: 'Bafang',
      fiscalYear: 2026,
      consultationNumber: '011/DC/C-BAF/CDPM-HN/2026',
      signatureDateFormatted: '23/11/2026',
      projectTitle: 'Fourniture de tables-bancs pour les écoles publiques de Bafang',
      nature: 'FOURNITURES',
      fundingSource: 'BIP MINDDEVEL 2026',
      budgetImputation: '60-2220-11-04',
      estimatedAmountTtc: 18_500_000,
      executionDays: 45,
      submissionDeadlineFormatted: '15/12/2026 à 12h00',
      openingDatetimeFormatted: '15/12/2026 à 13h00',
      daoPurchasePriceFcfa: 25_000,
      fiscalRegime: 'REEL',
      isUrgency: false,
    });

    expect(adaptedDc).not.toBeNull();
    expect(adaptedDc!.totalPages).toBe(171);
    expect(adaptedDc!.pages).toHaveLength(171);
    expect(adaptedDc!.pages[0]!.text).toContain('Commune de Bafang');
    expect(adaptedDc!.pages[0]!.text).toContain('TVA 19.25 %');

    const decreeSearch = searchOfficialLibraryPages({
      slug: 'decret_2018_366',
      query: 'Préfet',
      limit: 5,
    });
    expect(decreeSearch).not.toBeNull();
    expect(decreeSearch!.matchesCount).toBeGreaterThan(0);
  });

  it('génère un PDF officiel multi-pages scellé (QR + SHA-256 + paraphe) et un fichier Word .docx valide', async () => {
    const input = {
      documentCategory: 'ACT_06_DECISION_ATTRIBUTION',
      documentNumber: '009/DEC/C-BAF/2026',
      title: 'Décision d’attribution — Travaux de voirie urbaine à Bafang',
      entityId: '11111111-1111-4111-8111-111111111111',
      entityName: 'Commune de Bafang',
      entityCode: 'CM-OU-BAF',
      city: 'Bafang',
      signatoryTitle: 'Le Maire de la Commune de Bafang',
      signatoryName: 'Autorité Contractante',
      actorUserId: 'user-mo-01',
      actorRole: 'MO_MOD' as const,
      sections: [
        {
          heading: 'ARTICLE 1 : ATTRIBUTION',
          body: 'La société ETS BATI-KAM SUARL est déclarée attributaire pour 48 500 000 FCFA TTC.',
        },
        {
          heading: 'ARTICLE 2 : DELAI',
          body: 'Le délai d’exécution est fixé à 90 jours calendaires à compter de la notification de l’OS.',
        },
      ],
      tableRows: [
        ['Lot', 'Désignation', 'Montant TTC (FCFA)'],
        ['Lot 1', 'Pavage rue du Marché Central', '48 500 000'],
      ],
      ampliations: ['MINMAP', 'ARMP', 'Préfecture du Haut-Nkam', 'Archives'],
    };

    const pdfOut = await buildMultiPageOfficialPdf(input);
    expect(pdfOut.pageCount).toBeGreaterThanOrEqual(1);
    expect(pdfOut.sha256Seal).toMatch(/^[a-f0-9]{64}$/);
    expect(pdfOut.qrVerificationId.startsWith('SIGAMP-')).toBe(true);
    expect(Buffer.from(pdfOut.pdfBytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');

    const docxOut = await buildOfficialDocxBuffer(input);
    expect(docxOut.fileName.endsWith('.docx')).toBe(true);
    expect(docxOut.sha256).toMatch(/^[a-f0-9]{64}$/);
    // Signature ZIP/OOXML : 'PK'
    expect(docxOut.docxBytes[0]).toBe(0x50);
    expect(docxOut.docxBytes[1]).toBe(0x4b);
  });

  it('classe et exporte la GED Régalienne (6 Chemises) et inclut les tables GED dans la purge Reset', async () => {
    expect(GED_FOLDER_DEFINITIONS).toHaveLength(7);
    expect(resolveGedFolderForAct('DT_DEMANDE_COTATION')).toBe('02_LANCEMENT_DAO_DC');
    expect(resolveGedFolderForAct('PV_RECEPTION_DEFINITIVE')).toBe(
      '06_RECEPTIONS_CLOTURE_CONTENTIEUX'
    );
    expect(PURGE_OPERATIONAL_TABLES_ORDERED).toContain('ged_document_versions');
    expect(PURGE_OPERATIONAL_TABLES_ORDERED).toContain('ged_documents');

    const sampleDocs = [
      {
        id: 'd1',
        entity_id: 'e1',
        project_id: 'BAF-2026-011',
        folder_code: '02_LANCEMENT_DAO_DC' as const,
        document_category: 'DOSSIER_COTATION',
        title: 'DC 011 Bafang',
        chrono_number: '011/DC/2026',
        file_name: 'dc_011.pdf',
        mime_type: 'application/pdf',
        file_size_bytes: 12000,
        sha256_hash: 'abcd'.repeat(16),
        version_number: 1,
        lifecycle_status: 'SIGNE_SCELLE' as const,
        created_at: '2026-11-23T00:00:00Z',
      },
    ];
    expect(searchGedDocumentsLocal(sampleDocs, { query: '011/DC' })).toHaveLength(1);
    const cover = await buildAuditDossierCoverPdf({
      entityName: 'Commune de Bafang',
      projectCode: 'BAF-2026-011',
      projectTitle: 'Voirie urbaine',
      documents: sampleDocs,
    });
    expect(cover.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('calcule un BPU/DQE structuré (lettres + TVA 19,25% + AIR CGI + CSV) et l’exporte en PDF vectoriel & DOCX', async () => {
    expect(numberToFrenchWordsFcfa(15_500)).toBe('quinze mille cinq cents francs CFA');
    expect(numberToFrenchWordsFcfa(1_000_080)).toBe('un million quatre-vingts francs CFA');

    const preset = getPresetBpuLines('FOURNITURES');
    const summary = computeBpuDqeSummary(preset, { fiscalRegime: 'REEL' });
    expect(summary.totalHt).toBe(17_030_000);
    expect(summary.tvaAmount).toBe(Math.round(17_030_000 * 0.1925));
    expect(summary.airAmount).toBe(Math.round(17_030_000 * 0.022));
    expect(summary.netToOrder).toBe(summary.totalHt - summary.airAmount);

    const csv = exportBpuToCsv(preset);
    const reparsed = parseBpuFromCsv(csv);
    expect(reparsed).toHaveLength(preset.length);
    expect(reparsed[0]!.unitPriceHt).toBe(45_000);

    const bpuTable = buildBpuTableRows(summary, false);
    const dqeTable = buildDqeTableRows(summary, false);
    expect(bpuTable[1]![4]).toBe('quarante-cinq mille francs CFA');
    expect(dqeTable.some((r) => r[1]?.includes('NET À MANDATER'))).toBe(true);

    const pdfOut = await buildMultiPageOfficialPdf({
      documentCategory: 'BPU_DQE_ESTIMATIF',
      documentNumber: '011/DC/C-BAF/2026',
      title: 'BPU / DQE Fourniture tables-bancs Bafang',
      entityId: '11111111-1111-4111-8111-111111111111',
      entityName: 'Commune de Bafang',
      entityCode: 'CM-OU-BAF',
      city: 'Bafang',
      signatoryTitle: 'Le Maire / Autorité Contractante',
      signatoryName: 'Commune de Bafang',
      actorUserId: 'u-1',
      actorRole: 'SIGAMP',
      sections: [{ heading: 'NOTE', body: 'Tableau officiel ARMP.' }],
      tables: [
        { title: 'BPU', rows: bpuTable },
        { title: 'DQE', rows: dqeTable },
      ],
    });
    expect(pdfOut.pageCount).toBeGreaterThanOrEqual(1);
    expect(Buffer.from(pdfOut.pdfBytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');
  });
});
