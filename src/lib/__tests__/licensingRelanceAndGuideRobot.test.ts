import { describe, expect, it } from 'vitest';
import { evaluateLicenseAlertAndRelance } from '../domain/licensingEngine';
import { getGuideStepsForContext } from '../guide/roleGuideCatalog';
import { ROLE_PROFILES } from '../ui/demoProfiles';

describe('Licensing Alert & Relance Tiers + Guide Robot Role Catalog', () => {
  it('computes J-30, J-15, J-7, J-1, EXPIREE and NONE reminder tiers accurately', () => {
    const ref = new Date('2026-11-01T00:00:00Z');

    const j30 = evaluateLicenseAlertAndRelance(
      {
        status: 'ACTIVE',
        planCode: 'ANNUELLE',
        licenseKey: 'KEY-30',
        expiresAtIso: '2026-11-26T00:00:00Z',
        entityName: 'Commune de Bafoussam I',
        entityCode: 'CM-OU-BAF',
        contactEmail: 'sigamp@bafoussam.cm',
      },
      ref
    );
    expect(j30.tier).toBe('J_30');
    expect(j30.autoAction).toBe('BANNIERE_PREVENTIVE');
    expect(j30.mailtoHref).toContain('mailto:sigamp%40bafoussam.cm');

    const j7 = evaluateLicenseAlertAndRelance(
      {
        status: 'ACTIVE',
        planCode: 'ANNUELLE',
        licenseKey: 'KEY-7',
        expiresAtIso: '2026-11-06T00:00:00Z',
      },
      ref
    );
    expect(j7.tier).toBe('J_7');
    expect(j7.autoAction).toBe('RELANCE_EMAIL_URGENTE');

    const expired = evaluateLicenseAlertAndRelance(
      {
        status: 'ACTIVE',
        planCode: 'MENSUELLE',
        licenseKey: 'KEY-EXP',
        expiresAtIso: '2026-10-20T00:00:00Z',
      },
      ref
    );
    expect(expired.tier).toBe('EXPIREE');
    expect(expired.autoAction).toBe('MODE_LECTURE_SEULE');

    const safe = evaluateLicenseAlertAndRelance(
      {
        status: 'ACTIVE',
        planCode: 'PLURIANNUELLE',
        licenseKey: 'KEY-SAFE',
        expiresAtIso: '2027-06-01T00:00:00Z',
      },
      ref
    );
    expect(safe.tier).toBe('NONE');
  });

  it('builds tailored role guide steps & overlays for HumanoidGuideRobot', () => {
    const sigampProfile = ROLE_PROFILES.find((p) => p.spaceId === 'SIGAMP_MO')!;
    const cpmProfile = ROLE_PROFILES.find((p) => p.spaceId === 'CPM_SCA_ARMP')!;

    const sigampSteps = getGuideStepsForContext(sigampProfile, 'NONE');
    expect(sigampSteps.some((s) => s.tag === 'sigamp-tab-VALUE_CHAIN')).toBe(true);
    expect(sigampSteps.some((s) => s.tag === 'topbar-offline-sync')).toBe(true);

    const cpmSteps = getGuideStepsForContext(cpmProfile, 'NONE');
    expect(cpmSteps.some((s) => s.tag === 'workspace-primary-panel')).toBe(true);

    const studioSteps = getGuideStepsForContext(sigampProfile, 'STUDIO');
    expect(studioSteps[0]?.tag).toBe('overlay-studio-root');
  });
});
