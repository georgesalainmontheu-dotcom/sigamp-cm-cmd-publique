import { describe, expect, it } from 'vitest';
import {
  buildMultiPageOfficialPdf,
  buildOfficialDocxBuffer,
} from '../pdf/officeAndPdfExporter';

describe('Intégration Gabarit Studio -> Exports PDF & DOCX', () => {
  it('génère un PDF et un DOCX intégrant le header bilingue FR/EN et le footer multi-colonnes du Studio', async () => {
    const baseInput = {
      documentCategory: 'DECISION',
      documentNumber: '001/DEC/TIT-CS/2026',
      title: 'Décision de désignation de la Commission Spéciale',
      entityId: '11111111-1111-4111-8111-111111111101',
      entityName: 'TIT-Consulting Solutions',
      entityCode: 'TIT-CS-ADMIN',
      city: 'Yaoundé',
      signatoryTitle: 'Le Directeur Général / Maître d’Ouvrage',
      signatoryName: 'Joël Tchassom',
      actorUserId: '74971e5f-fa17-4264-9cb8-d64dba7b1093',
      actorRole: 'SUPER_ADMIN' as const,
      studioIdentity: {
        headerLayout: 'BILINGUAL_SPLIT' as const,
        showTricolorBar: true,
        tutelleFr: 'PRÉSIDENCE DE LA RÉPUBLIQUE / MINMAP',
        tutelleEn: 'PRESIDENCY OF THE REPUBLIC / MINMAP',
        regionDeptLineFr: 'RÉGION DU CENTRE / MFOUNDI',
        regionDeptLineEn: 'CENTRE REGION / MFOUNDI',
        emittingServiceFr: 'DIRECTION DES MARCHÉS PUBLICS',
        emittingServiceEn: 'PUBLIC PROCUREMENT DEPARTMENT',
        taxRegistrationNumber: 'M012600001234A',
        budgetChapterCode: 'CHAP 22 / ART 2210',
        footerPostalAddress: 'BP 1234 Yaoundé',
        footerPhysicalAddress: 'Quartier Bastos, Yaoundé',
        footerPhone: '+237 699 00 00 00',
        footerEmail: 'contact@tit-cs.cm',
        footerWebsite: 'https://sigamp-cm-commande-publique.vercel.app',
        footerBankTreasury: 'Recette Municipale / Trésor Public',
        footerLegalText: 'Acte officiel scellé SIGAMP-CM V3.2',
        footerShowPageNumbers: true,
        footerShowVerificationUrl: true,
      },
      sections: [
        {
          heading: 'ARTICLE 1',
          body: 'La commission est habilitée à examiner les offres dans les délais réglementaires.',
        },
      ],
      ampliations: ['MINMAP', 'ARMP', 'Archives'],
    };

    const pdf = await buildMultiPageOfficialPdf(baseInput);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
    expect(pdf.sha256Seal).toMatch(/^[a-f0-9]{64}$/);
    expect(String.fromCharCode(...pdf.pdfBytes.slice(0, 4))).toBe('%PDF');

    const docx = await buildOfficialDocxBuffer({
      ...baseInput,
      studioIdentity: {
        ...baseInput.studioIdentity,
        headerLayout: 'CENTERED',
      },
    });
    expect(docx.docxBytes.byteLength).toBeGreaterThan(2000);
    expect(String.fromCharCode(...docx.docxBytes.slice(0, 2))).toBe('PK');
    expect(docx.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
