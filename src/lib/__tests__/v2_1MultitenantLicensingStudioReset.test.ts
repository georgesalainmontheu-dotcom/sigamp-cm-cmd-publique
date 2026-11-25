import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TIT_CS_METADATA } from '../../components/branding/TitCsBrandFooter';
import {
  PRESERVED_CONFIGURATION_ITEMS,
  PURGE_OPERATIONAL_TABLES_ORDERED,
  validateResetConfirmation,
} from '../domain/entityResetEngine';
import {
  createStudioVersionSnapshot,
  DEFAULT_STUDIO_BLOCKS,
  moveStudioBlock,
  renderStudioTemplate,
  type EntityVisualIdentity,
} from '../domain/entityStudioEngine';
import {
  evaluateEntityLicenseStatus,
  issueEntityLicense,
  LICENSE_PLANS,
  verifyOfflineLicenseProofToken,
} from '../domain/licensingEngine';
import { mapRbacRoleToSpaceId } from '../supabase/client';

describe('SIGAMP-CM V2.1 Élargie — Identité TIT-CS, Licences, Studio CMS, Reset & Multi-Entités', () => {
  it('Axe 1 : Vérifie les métadonnées officielles TIT-CS et la présence locale du logo SVG hors-ligne', () => {
    expect(TIT_CS_METADATA.founderName).toContain('Joël');
    expect(TIT_CS_METADATA.companyName).toBe('TIT-CONSULTING SOLUTIONS (TIT-CS)');
    expect(TIT_CS_METADATA.email).toBe('contact@tit-cs.com');
    expect(TIT_CS_METADATA.copyrightYear).toBe('2026');
    expect(TIT_CS_METADATA.website).toBe('https://tit-cs.netlify.app');

    const svgPath = path.join(process.cwd(), 'public', 'tit-cs-logo.svg');
    expect(fs.existsSync(svgPath)).toBe(true);
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    expect(svgContent).toContain('<svg');
    expect(svgContent).toContain('#0A1F3D');
    expect(svgContent).toContain('#D4AF37');
  });

  it('Axe 2 : Vérifie le mapping RBAC Double Gouvernance (ADMIN_ENTITE) et le Studio Figma/CMS', () => {
    expect(mapRbacRoleToSpaceId('ADMIN_ENTITE')).toBe('SIGAMP_MO');
    expect(mapRbacRoleToSpaceId('SUPER_ADMIN')).toBe('SIGAMP_MO');

    const rendered = renderStudioTemplate(
      '{{entity.name}} ({{entity.code}}) — Exercice {{fiscal_year}} — Signé par {{signer.title}}',
      {
        entityName: 'Commune de Bafang',
        entityCode: 'CM-OU-BAF',
        city: 'Bafang',
        fiscalYear: 2026,
        signerTitle: 'Le Maire de la Commune de Bafang',
        signerName: 'M. le Maire',
        headerTimbreText: 'RÉPUBLIQUE DU CAMEROUN',
        footerLegalText: '© TIT-CS',
      }
    );
    expect(rendered).toContain('Commune de Bafang (CM-OU-BAF)');
    expect(rendered).toContain('2026');
    expect(rendered).toContain('Le Maire de la Commune de Bafang');

    const reordered = moveStudioBlock(DEFAULT_STUDIO_BLOCKS, 'blk_entity', 'UP');
    expect(reordered[0]?.id).toBe('blk_entity');

    const identity: EntityVisualIdentity = {
      entityId: '11111111-1111-4111-8111-111111111111',
      entityCode: 'CM-OU-BAF',
      entityName: 'Commune de Bafang',
      entityType: 'COMMUNE',
      municipality: 'Bafang',
      primaryColor: '#0A1F3D',
      accentColor: '#D4AF37',
      headerTimbreText: 'RÉPUBLIQUE DU CAMEROUN',
      footerLegalText: '© TIT-CS',
      typography: 'serif',
      compactHeader: false,
    };
    const versions = createStudioVersionSnapshot({
      existingVersions: [],
      identity,
      blocks: reordered,
      savedBy: 'Admin Bafang',
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]?.versionNumber).toBe(1);
  });

  it('Axe 4 : Vérifie le catalogue, la délivrance SHA-256, le jeton offline et le contrôle d’expiration des licences', async () => {
    expect(LICENSE_PLANS.map((p) => p.planCode)).toEqual([
      'ESSAI_DEMO',
      'MENSUELLE',
      'ANNUELLE',
      'PLURIANNUELLE',
      'SOUVERAINE',
    ]);

    const issued = await issueEntityLicense({
      entityId: '11111111-1111-4111-8111-111111111111',
      entityCode: 'CM-OU-BAF',
      entityName: 'Commune de Bafang',
      planCode: 'ANNUELLE',
      paymentChannel: 'VIREMENT_TRESOR',
      paymentRef: 'VIR-BAF-2026-099',
      autoActivate: true,
    });

    expect(issued.license.status).toBe('ACTIVE');
    expect(issued.license.licenseKey).toContain('TITCS-SIGAMP-CMOUBAF');
    expect(issued.license.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(issued.receiptText).toContain('TIT-CONSULTING SOLUTIONS (TIT-CS)');

    const verifiedOffline = await verifyOfflineLicenseProofToken(
      issued.license.offlineProofToken,
      issued.license
    );
    expect(verifiedOffline).toBe(true);

    // Licence expirée : bloque les nouveaux actes mais conserve la lecture des archives
    const expiredEval = evaluateEntityLicenseStatus(
      { ...issued.license, expiresAtIso: '2025-01-01T00:00:00Z' },
      new Date('2026-11-23T00:00:00Z')
    );
    expect(expiredEval.effectiveStatus).toBe('EXPIREE');
    expect(expiredEval.canCreateNewActs).toBe(false);
    expect(expiredEval.canReadArchives).toBe(true);

    // Licence suspendue : bloque création et connexion
    const suspendedEval = evaluateEntityLicenseStatus({
      ...issued.license,
      status: 'SUSPENDUE',
    });
    expect(suspendedEval.effectiveStatus).toBe('SUSPENDUE');
    expect(suspendedEval.canCreateNewActs).toBe(false);
    expect(suspendedEval.canLogin).toBe(false);
  });

  it('Axe 5 : Vérifie la double confirmation et les tables purgées/conservées lors de la Remise à Zéro Production', () => {
    const invalid = validateResetConfirmation({
      targetEntityId: '11111111-1111-4111-8111-111111111111',
      expectedEntityCode: 'CM-OU-BAF',
      confirmEntityCode: 'MAUVAIS-CODE',
      reason: 'court',
      deleteTestUsers: false,
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThanOrEqual(2);

    const valid = validateResetConfirmation({
      targetEntityId: '11111111-1111-4111-8111-111111111111',
      expectedEntityCode: 'CM-OU-BAF',
      confirmEntityCode: 'cm-ou-baf',
      reason: 'Fin des tests pilotes et passage en production 2026',
      deleteTestUsers: false,
    });
    expect(valid.valid).toBe(true);
    expect(PURGE_OPERATIONAL_TABLES_ORDERED).toContain('projects');
    expect(PURGE_OPERATIONAL_TABLES_ORDERED).toContain('confidential_estimates');
    expect(
      PRESERVED_CONFIGURATION_ITEMS.some((i) => i.toLowerCase().includes('licence'))
    ).toBe(true);
  });
});
