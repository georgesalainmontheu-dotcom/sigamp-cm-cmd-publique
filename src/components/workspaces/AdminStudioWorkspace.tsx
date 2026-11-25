'use client';

import {
  AlertOctagon,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Layers,
  Monitor,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createStudioVersionSnapshot,
  DEFAULT_STUDIO_BLOCKS,
  DYNAMIC_STUDIO_VARIABLES,
  moveStudioBlock,
  renderStudioTemplate,
  type EntityVisualIdentity,
  type StudioDocumentBlock,
  type StudioVersionSnapshot,
} from '../../lib/domain/entityStudioEngine';
import {
  PRESERVED_CONFIGURATION_ITEMS,
  validateResetConfirmation,
  type EntityResetSummary,
} from '../../lib/domain/entityResetEngine';
import {
  evaluateEntityLicenseStatus,
  issueEntityLicense,
  LICENSE_PLANS,
  type EntityLicenseRecord,
  type LicensePlanCode,
} from '../../lib/domain/licensingEngine';
import { purgeEntityTestCacheFromDexie } from '../../lib/offline/offlineStore';
import { buildAuthenticatedJsonHeaders } from '../../lib/supabase/client';
import type { ActiveRoleProfile } from '../../lib/ui/demoProfiles';
import type { EntityType, RbacRole } from '../../types/domain';
import { TitCsLogo } from '../branding/TitCsBrandFooter';

type StudioSectionId =
  | 'OVERVIEW'
  | 'STUDIO_FIGMA'
  | 'LOGINS_RBAC'
  | 'LICENSES_SALES'
  | 'REFERENTIALS'
  | 'RESET_PROD';

interface AdminEntityRow {
  id: string;
  code: string;
  name: string;
  type: EntityType;
  municipality: string | null;
  primary_color?: string;
  accent_color?: string;
  header_timbre_text?: string;
  footer_legal_text?: string;
  studio_config?: {
    blocks?: StudioDocumentBlock[];
    typography?: 'serif' | 'sans';
    compactHeader?: boolean;
  };
  studio_versions?: StudioVersionSnapshot[];
}

interface AdminMembershipRow {
  id: string;
  user_id: string;
  entity_id: string;
  role: RbacRole;
  active: boolean;
  is_active?: boolean;
  appointment_act_ref?: string | null;
  user_profiles?: {
    full_name?: string;
    email?: string;
    grade_title?: string;
    active?: boolean;
    is_test_account?: boolean;
  } | null;
}

export interface StudioPublishedPayload {
  identity: EntityVisualIdentity;
  blocks: StudioDocumentBlock[];
}

export function AdminStudioWorkspace({
  profile,
  onStudioPublished,
}: {
  profile: ActiveRoleProfile;
  onStudioPublished?: (payload: StudioPublishedPayload) => void;
}) {
  const isSuperAdmin = Boolean(profile.isPlatformSuperAdmin) || profile.roleCode === 'SUPER_ADMIN';
  const [section, setSection] = useState<StudioSectionId>('STUDIO_FIGMA');
  const [viewport, setViewport] = useState<'DESKTOP' | 'TABLET' | 'MOBILE'>('DESKTOP');
  const [editMode, setEditMode] = useState<'EDIT' | 'PREVIEW'>('EDIT');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Entités gérées (Super Admin voit toutes, Admin Entité voit la sienne)
  const [entities, setEntities] = useState<AdminEntityRow[]>([
    {
      id: profile.entityId,
      code: profile.entityCode,
      name: profile.entityName,
      type: profile.entityType,
      municipality: profile.city,
      primary_color: profile.primaryColor ?? '#0A1F3D',
      accent_color: profile.accentColor ?? '#D4AF37',
    },
  ]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>(profile.entityId);
  const [memberships, setMemberships] = useState<AdminMembershipRow[]>([]);
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null);

  // Provisioning nouvelle entité (Super Admin)
  const [showNewEntityForm, setShowNewEntityForm] = useState(false);
  const [newEntCode, setNewEntCode] = useState('CM-OU-BFO');
  const [newEntName, setNewEntName] = useState('Commune de Bafoussam 1er');
  const [newEntType, setNewEntType] = useState<EntityType>('COMMUNE');
  const [newEntCity, setNewEntCity] = useState('Bafoussam');

  // Création & Edition CMS Utilisateur Auth
  const [cmsUserEmail, setCmsUserEmail] = useState('');
  const [cmsUserName, setCmsUserName] = useState('');
  const [cmsUserPass, setCmsUserPass] = useState('Sigamp@2026!');
  const [cmsUserRole, setCmsUserRole] = useState<RbacRole>('SIGAMP');
  const [cmsUserGrade, setCmsUserGrade] = useState('');
  const [cmsUserMatricule, setCmsUserMatricule] = useState('');
  const [cmsResetPass, setCmsResetPass] = useState('');

  // Studio Figma/CMS State
  const [identity, setIdentity] = useState<EntityVisualIdentity>({
    entityId: profile.entityId,
    entityCode: profile.entityCode,
    entityName: profile.entityName,
    entityType: profile.entityType,
    municipality: profile.city,
    primaryColor: profile.primaryColor ?? '#0A1F3D',
    accentColor: profile.accentColor ?? '#D4AF37',
    headerTimbreText: 'RÉPUBLIQUE DU CAMEROUN\nPaix - Travail - Patrie',
    footerLegalText:
      '© 2026 Joël Tchassom & TIT-Consulting Solutions (TIT-CS) — Plateforme SIGAMP-CM',
    typography: 'serif',
    compactHeader: false,
  });
  const [blocks, setBlocks] = useState<StudioDocumentBlock[]>(DEFAULT_STUDIO_BLOCKS);
  const [selectedBlockId, setSelectedBlockId] = useState<string>(DEFAULT_STUDIO_BLOCKS[1]!.id);
  const [versions, setVersions] = useState<StudioVersionSnapshot[]>([]);

  // Licences & Vente
  const [activeLicense, setActiveLicense] = useState<EntityLicenseRecord>({
    id: 'lic-pilot',
    entityId: profile.entityId,
    entityCode: profile.entityCode,
    entityName: profile.entityName,
    planCode: (profile.licensePlanCode as LicensePlanCode) || 'ANNUELLE',
    status: profile.licenseStatus ?? 'ACTIVE',
    licenseKey: 'TITCS-SIGAMP-BAF2026-8841A',
    offlineProofToken: 'SIGAMP-OFFLINE-BAF2026-VERIFIED-TITCS',
    startsAtIso: '2026-01-01T00:00:00Z',
    expiresAtIso: profile.licenseExpiresAt ?? '2027-12-31T23:59:59Z',
    maxActiveLogins: 60,
    amountFcfa: 1_500_000,
    paymentRef: 'VIR-TRESOR-BAF-2026-001',
  });
  const [selectedPlanCode, setSelectedPlanCode] = useState<LicensePlanCode>('ANNUELLE');
  const [paymentChannel, setPaymentChannel] = useState<
    'VIREMENT_TRESOR' | 'BON_COMMANDE_PUBLIC' | 'MTN_MOMO' | 'ORANGE_MONEY'
  >('VIREMENT_TRESOR');
  const [paymentRef, setPaymentRef] = useState('VIR-TRESOR-2026-NEW');
  const [generatedReceiptText, setGeneratedReceiptText] = useState<string | null>(null);

  // Référentiels internes
  const [internalServicesText, setInternalServicesText] = useState(
    'SIGAMP — Service Interne de Gestion des Marchés\nSTM — Services Techniques Municipaux\nRecette Municipale & Contrôle Financier'
  );
  const [budgetLinesText, setBudgetLinesText] = useState(
    'Chap. 22 / Art. 2210 — Équipements & Travaux (350 000 000 FCFA)\nChap. 62 / Art. 6210 — Indemnités de Session CPM/SCA (8 000 000 FCFA)'
  );

  // Supervision multi-entités (Super Admin)
  const [supervisionRows, setSupervisionRows] = useState<
    Array<{
      id: string;
      code: string;
      name: string;
      type: EntityType;
      parent_entity_id?: string | null;
      activeLoginsCount: number;
      projectsCount: number;
      license?: { plan_code?: string; status?: string; expires_at?: string } | null;
    }>
  >([]);

  // Remise à zéro Production (Axe 5)
  const [confirmEntityCode, setConfirmEntityCode] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [deleteTestUsers, setDeleteTestUsers] = useState(false);
  const [resetSummary, setResetSummary] = useState<EntityResetSummary | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const selectedEntity = useMemo(
    () => entities.find((e) => e.id === selectedEntityId) ?? entities[0]!,
    [entities, selectedEntityId]
  );

  const licenseEval = useMemo(
    () => evaluateEntityLicenseStatus(activeLicense),
    [activeLicense]
  );

  const selectedBlock = useMemo(
    () => blocks.find((b) => b.id === selectedBlockId) ?? blocks[0]!,
    [blocks, selectedBlockId]
  );

  const selectedMembership = useMemo(
    () => memberships.find((m) => m.id === selectedMembershipId) ?? memberships[0] ?? null,
    [memberships, selectedMembershipId]
  );

  const loadEntityData = useCallback(async (targetEntityId: string) => {
    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const [studioRes, licRes, supRes] = await Promise.all([
        fetch(`/api/admin/entity-studio?entityId=${encodeURIComponent(targetEntityId)}`, {
          headers,
        }),
        fetch(`/api/admin/licenses?entityId=${encodeURIComponent(targetEntityId)}`, {
          headers,
        }),
        isSuperAdmin
          ? fetch('/api/admin/entities', { headers })
          : Promise.resolve(null),
      ]);

      if (supRes && supRes.ok) {
        const supJson = (await supRes.json()) as {
          supervision?: typeof supervisionRows;
        };
        if (supJson.supervision) {
          setSupervisionRows(supJson.supervision);
        }
      }

      if (studioRes.ok) {
        const sJson = (await studioRes.json()) as {
          entities?: AdminEntityRow[];
          memberships?: AdminMembershipRow[];
        };
        if (sJson.entities && sJson.entities.length > 0) {
          setEntities(sJson.entities);
          const cur =
            sJson.entities.find((e) => e.id === targetEntityId) ?? sJson.entities[0]!;
          setIdentity((prev) => ({
            ...prev,
            entityId: cur.id,
            entityCode: cur.code,
            entityName: cur.name,
            entityType: cur.type,
            municipality: cur.municipality ?? 'Yaoundé',
            primaryColor: cur.primary_color ?? '#0A1F3D',
            accentColor: cur.accent_color ?? '#D4AF37',
            headerTimbreText:
              cur.header_timbre_text ?? 'RÉPUBLIQUE DU CAMEROUN\nPaix - Travail - Patrie',
            footerLegalText:
              cur.footer_legal_text ??
              '© 2026 Joël Tchassom & TIT-Consulting Solutions (TIT-CS) — Plateforme SIGAMP-CM',
            typography: cur.studio_config?.typography ?? 'serif',
            compactHeader: Boolean(cur.studio_config?.compactHeader),
          }));
          if (cur.studio_config?.blocks && cur.studio_config.blocks.length > 0) {
            setBlocks(cur.studio_config.blocks);
          }
          if (Array.isArray(cur.studio_versions)) {
            setVersions(cur.studio_versions);
          }
        }
        if (Array.isArray(sJson.memberships)) {
          setMemberships(sJson.memberships);
        }
      }

      if (licRes.ok) {
        const lJson = (await licRes.json()) as {
          licenses?: Array<{
            id: string;
            entity_id: string;
            plan_code: LicensePlanCode;
            status: EntityLicenseRecord['status'];
            license_key: string;
            offline_proof_token: string;
            starts_at: string;
            expires_at: string;
            max_active_logins: number;
            amount_fcfa: number;
            payment_ref?: string;
            receipt_sha256?: string;
          }>;
        };
        const latest = lJson.licenses?.[0];
        if (latest) {
          setActiveLicense({
            id: latest.id,
            entityId: latest.entity_id,
            entityCode: selectedEntity.code,
            entityName: selectedEntity.name,
            planCode: latest.plan_code,
            status: latest.status,
            licenseKey: latest.license_key,
            offlineProofToken: latest.offline_proof_token,
            startsAtIso: latest.starts_at,
            expiresAtIso: latest.expires_at,
            maxActiveLogins: latest.max_active_logins,
            amountFcfa: Number(latest.amount_fcfa),
            paymentRef: latest.payment_ref,
            receiptSha256: latest.receipt_sha256,
          });
        }
      }
    } catch {
      // Fallback silencieux sur l'état courant en mode démo / hors-ligne
    }
  }, [selectedEntity.code, selectedEntity.name]);

  useEffect(() => {
    void loadEntityData(selectedEntityId);
  }, [selectedEntityId, loadEntityData]);

  const handlePublishStudio = async () => {
    setIsBusy(true);
    setErrorBanner(null);
    setStatusBanner(null);
    const nextVersions = createStudioVersionSnapshot({
      existingVersions: versions,
      identity,
      blocks,
      savedBy: profile.fullName,
    });
    setVersions(nextVersions);

    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch('/api/admin/entity-studio', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'PUBLISH_STUDIO',
          entityId: selectedEntityId,
          name: identity.entityName,
          municipality: identity.municipality,
          primaryColor: identity.primaryColor,
          accentColor: identity.accentColor,
          logoSvg: identity.logoSvg,
          logoUrl: identity.logoUrl,
          headerTimbreText: identity.headerTimbreText,
          footerLegalText: identity.footerLegalText,
          studioConfig: {
            blocks,
            typography: identity.typography,
            compactHeader: identity.compactHeader,
          },
          studioVersions: nextVersions,
          localReferentials: {
            services: internalServicesText.split('\n').filter(Boolean),
            budgetLines: budgetLinesText.split('\n').filter(Boolean),
          },
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        setErrorBanner(err.error ?? 'Publication locale appliquée (API indisponible en mode démo).');
      } else {
        setStatusBanner(
          `Configuration Studio v${nextVersions[0]?.versionNumber ?? 1} publiée et appliquée immédiatement à ${identity.entityName}.`
        );
      }
    } catch {
      setStatusBanner(
        `Configuration Studio v${nextVersions[0]?.versionNumber ?? 1} appliquée immédiatement en session locale.`
      );
    } finally {
      onStudioPublished?.({ identity, blocks });
      setIsBusy(false);
    }
  };

  const handleRestoreVersion = (snap: StudioVersionSnapshot) => {
    setIdentity(snap.identity);
    setBlocks(snap.blocks);
    onStudioPublished?.({ identity: snap.identity, blocks: snap.blocks });
    setStatusBanner(`Version v${snap.versionNumber} (${snap.label}) restaurée sur le canvas.`);
  };

  const handleToggleLogin = async (mem: AdminMembershipRow) => {
    const current = mem.is_active ?? mem.active;
    const nextActive = !current;
    setMemberships((prev) =>
      prev.map((m) =>
        m.id === mem.id ? { ...m, active: nextActive, is_active: nextActive } : m
      )
    );
    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch('/api/admin/entity-studio', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'TOGGLE_LOGIN',
          entityId: selectedEntityId,
          membershipId: mem.id,
          nextActive,
        }),
      });
      if (res.ok) {
        setStatusBanner(
          `Login ${mem.user_profiles?.email ?? mem.id} ${nextActive ? 'ACTIVÉ' : 'DÉSACTIVÉ'} immédiatement.`
        );
      }
    } catch {
      // keep optimistic update in demo mode
    }
  };

  const handleProvisionEntity = async () => {
    setIsBusy(true);
    setErrorBanner(null);
    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch('/api/admin/entity-studio', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'PROVISION_ENTITY',
          code: newEntCode,
          name: newEntName,
          type: newEntType,
          municipality: newEntCity,
        }),
      });
      const json = (await res.json()) as { entity?: AdminEntityRow; error?: string };
      if (!res.ok || !json.entity) {
        setErrorBanner(json.error ?? 'Échec du provisionnement de l’entité.');
      } else {
        setEntities((prev) => [...prev, json.entity!]);
        setSelectedEntityId(json.entity.id);
        setShowNewEntityForm(false);
        setStatusBanner(`Nouvelle entité « ${json.entity.name} » provisionnée avec succès.`);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleCmsCreateUser = async () => {
    setErrorBanner(null);
    setStatusBanner(null);
    setIsBusy(true);
    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'CREATE_USER',
          entityId: selectedEntityId,
          email: cmsUserEmail,
          password: cmsUserPass,
          fullName: cmsUserName,
          role: cmsUserRole,
          gradeTitle: cmsUserGrade,
          matricule: cmsUserMatricule,
        }),
      });
      const json = (await res.json()) as { error?: string; userId?: string };
      if (!res.ok) {
        setErrorBanner(json.error ?? 'Échec création compte Auth.');
      } else {
        setStatusBanner(`Compte utilisateur ${cmsUserEmail} (${cmsUserRole}) créé avec succès.`);
        setCmsUserEmail('');
        setCmsUserName('');
        await loadEntityData(selectedEntityId);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleCmsResetPassword = async (userId: string) => {
    if (!cmsResetPass || cmsResetPass.length < 8) {
      setErrorBanner('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    setIsBusy(true);
    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'RESET_PASSWORD',
          entityId: selectedEntityId,
          userId,
          newPassword: cmsResetPass,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) setErrorBanner(json.error ?? 'Erreur réinitialisation mot de passe.');
      else {
        setStatusBanner('Mot de passe utilisateur réinitialisé via Supabase Auth Admin.');
        setCmsResetPass('');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleCmsRevokeUser = async (mem: AdminMembershipRow) => {
    setIsBusy(true);
    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'DELETE_USER_OR_MEMBERSHIP',
          entityId: selectedEntityId,
          membershipId: mem.id,
          userId: mem.user_id,
          deleteAuthAccount: false,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) setErrorBanner(json.error ?? 'Erreur révocation.');
      else {
        setMemberships((prev) => prev.filter((m) => m.id !== mem.id));
        setStatusBanner('Habilitation utilisateur révoquée de cette entité.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleIssueOrOrderLicense = async (autoActivate: boolean) => {
    setIsBusy(true);
    setErrorBanner(null);
    setStatusBanner(null);
    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: autoActivate ? 'ACTIVATE_OR_RENEW' : 'CREATE_ORDER',
          entityId: selectedEntityId,
          planCode: selectedPlanCode,
          paymentChannel,
          paymentRef,
          autoActivate,
        }),
      });

      if (res.ok) {
        const json = (await res.json()) as {
          license?: EntityLicenseRecord & {
            license_key?: string;
            offline_proof_token?: string;
            starts_at?: string;
            expires_at?: string;
            plan_code?: LicensePlanCode;
            max_active_logins?: number;
            amount_fcfa?: number;
          };
          receiptText?: string;
        };
        if (json.receiptText) setGeneratedReceiptText(json.receiptText);
        if (json.license) {
          setActiveLicense({
            id: json.license.id,
            entityId: selectedEntityId,
            entityCode: identity.entityCode,
            entityName: identity.entityName,
            planCode: json.license.plan_code ?? json.license.planCode ?? selectedPlanCode,
            status: json.license.status ?? (autoActivate ? 'ACTIVE' : 'EN_ATTENTE_VALIDATION'),
            licenseKey: json.license.license_key ?? json.license.licenseKey,
            offlineProofToken:
              json.license.offline_proof_token ?? json.license.offlineProofToken,
            startsAtIso: json.license.starts_at ?? json.license.startsAtIso,
            expiresAtIso: json.license.expires_at ?? json.license.expiresAtIso,
            maxActiveLogins:
              json.license.max_active_logins ?? json.license.maxActiveLogins ?? 60,
            amountFcfa: Number(json.license.amount_fcfa ?? json.license.amountFcfa ?? 0),
          });
        }
        setStatusBanner(
          autoActivate
            ? `Licence ${selectedPlanCode} activée pour ${identity.entityName}.`
            : `Bon de commande licence généré (en attente de validation Super Admin).`
        );
      } else {
        const localIssued = await issueEntityLicense({
          entityId: selectedEntityId,
          entityCode: identity.entityCode,
          entityName: identity.entityName,
          planCode: selectedPlanCode,
          paymentChannel,
          paymentRef,
          autoActivate,
        });
        setActiveLicense(localIssued.license);
        setGeneratedReceiptText(localIssued.receiptText);
        setStatusBanner('Reçu & clé de licence générés en mode local.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleLicenseSuspend = async () => {
    const nextAction = activeLicense.status === 'SUSPENDUE' ? 'REACTIVATE' : 'SUSPEND';
    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: nextAction,
          entityId: selectedEntityId,
          licenseId: activeLicense.id,
        }),
      });
      if (res.ok) {
        setActiveLicense((prev) => ({
          ...prev,
          status: nextAction === 'SUSPEND' ? 'SUSPENDUE' : 'ACTIVE',
        }));
        setStatusBanner(
          nextAction === 'SUSPEND'
            ? 'Licence suspendue par le Super Admin TIT-CS.'
            : 'Licence réactivée par le Super Admin TIT-CS.'
        );
      }
    } catch {
      // ignore
    }
  };

  const handleResetToProduction = async () => {
    setErrorBanner(null);
    setStatusBanner(null);
    const check = validateResetConfirmation({
      targetEntityId: selectedEntityId,
      expectedEntityCode: identity.entityCode,
      confirmEntityCode,
      reason: resetReason,
      deleteTestUsers,
    });
    if (!check.valid) {
      setErrorBanner(check.errors.join(' '));
      return;
    }

    setIsBusy(true);
    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch('/api/admin/reset-entity', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          entityId: selectedEntityId,
          confirmEntityCode,
          reason: resetReason,
          deleteTestUsers,
        }),
      });
      const json = (await res.json()) as EntityResetSummary & { error?: string };
      if (!res.ok) {
        setErrorBanner(json.error ?? 'Échec de la remise à zéro.');
        return;
      }
      await purgeEntityTestCacheFromDexie(selectedEntityId);
      setResetSummary(json);
      setConfirmEntityCode('');
      setStatusBanner(
        `Remise à zéro production réussie pour ${identity.entityName} (${json.totalDeletedRows} enregistrements de test purgés, Audit ${json.auditLogId}).`
      );
    } finally {
      setIsBusy(false);
    }
  };

  const canvasWidthClass =
    viewport === 'MOBILE'
      ? 'max-w-[380px]'
      : viewport === 'TABLET'
        ? 'max-w-[680px]'
        : 'max-w-full';

  return (
    <div className="space-y-4">
      {/* 1. BARRE SUPÉRIEURE STYLE FIGMA / WORDPRESS ADMIN BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#0A1F3D] px-4 py-3 text-white shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          <TitCsLogo size={34} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wide text-[#D4AF37]">
                {isSuperAdmin ? 'SUPER ADMIN PLATEFORME (TIT-CS)' : 'ADMIN D’ENTITÉ'}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  licenseEval.effectiveStatus === 'ACTIVE'
                    ? 'bg-emerald-400/20 text-emerald-200'
                    : 'bg-rose-500/30 text-rose-200'
                }`}
              >
                Licence : {licenseEval.effectiveStatus} ({activeLicense.planCode})
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-300">Entité active :</span>
              <select
                value={selectedEntityId}
                onChange={(e) => setSelectedEntityId(e.target.value)}
                className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold text-white"
              >
                {entities.map((ent) => (
                  <option key={ent.id} value={ent.id} className="text-slate-900">
                    {ent.code} — {ent.name}
                  </option>
                ))}
              </select>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setShowNewEntityForm((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#D4AF37]/50 bg-[#D4AF37]/15 px-2 py-1 text-[11px] font-semibold text-[#D4AF37]"
                >
                  <Plus className="h-3 w-3" />
                  Nouvelle entité
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditMode((m) => (m === 'EDIT' ? 'PREVIEW' : 'EDIT'))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold"
          >
            <Eye className="h-3.5 w-3.5 text-[#D4AF37]" />
            {editMode === 'EDIT' ? 'Mode Édition' : 'Aperçu Seul'}
          </button>

          {versions.length > 0 && (
            <div className="relative flex items-center gap-1 rounded-xl border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs">
              <History className="h-3.5 w-3.5 text-[#D4AF37]" />
              <select
                onChange={(e) => {
                  const snap = versions.find((v) => v.versionId === e.target.value);
                  if (snap) handleRestoreVersion(snap);
                }}
                defaultValue=""
                className="bg-transparent text-xs text-white outline-none"
              >
                <option value="" disabled className="text-slate-900">
                  Versions ({versions.length})
                </option>
                {versions.map((v) => (
                  <option key={v.versionId} value={v.versionId} className="text-slate-900">
                    v{v.versionNumber} · {v.savedAtIso.slice(11, 19)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            disabled={isBusy}
            onClick={() => void handlePublishStudio()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#D4AF37] px-3.5 py-1.5 text-xs font-bold text-[#0A1F3D] shadow hover:opacity-95 disabled:opacity-60"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Publier / Appliquer immédiatement
          </button>
        </div>
      </div>

      {/* Provisioning nouvelle entité (Super Admin) */}
      {showNewEntityForm && isSuperAdmin && (
        <div className="rounded-2xl border border-[#D4AF37]/40 bg-white p-4 shadow-sm">
          <div className="text-xs font-bold text-[#0A1F3D]">
            Provisionner une Nouvelle Institution / Collectivité (Super Admin TIT-CS)
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-5">
            <input
              value={newEntCode}
              onChange={(e) => setNewEntCode(e.target.value)}
              placeholder="Code (ex: CM-OU-BFO)"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono"
            />
            <input
              value={newEntName}
              onChange={(e) => setNewEntName(e.target.value)}
              placeholder="Dénomination officielle"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 sm:col-span-2"
            />
            <select
              value={newEntType}
              onChange={(e) => setNewEntType(e.target.value as EntityType)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            >
              <option value="COMMUNE">COMMUNE</option>
              <option value="PREFECTURE">PREFECTURE (CDPM / MOD)</option>
              <option value="GOUVERNORAT">GOUVERNORAT (CRPM / MOD)</option>
              <option value="SOUS_PREFECTURE">SOUS_PREFECTURE</option>
              <option value="COMMUNAUTE_URBAINE">COMMUNAUTE_URBAINE</option>
              <option value="REGION">REGION</option>
              <option value="MINISTERE">MINISTERE</option>
              <option value="EPA">EPA</option>
              <option value="ENTREPRISE_PUBLIQUE">ENTREPRISE_PUBLIQUE</option>
              <option value="MISSION_DIPLOMATIQUE">MISSION_DIPLOMATIQUE</option>
              <option value="PROJET_PROGRAMME">PROJET_PROGRAMME</option>
            </select>
            <div className="flex gap-2">
              <input
                value={newEntCity}
                onChange={(e) => setNewEntCity(e.target.value)}
                placeholder="Ville"
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
              />
              <button
                type="button"
                onClick={() => void handleProvisionEntity()}
                className="rounded-lg bg-[#0A1F3D] px-3 py-1.5 font-semibold text-white"
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {statusBanner && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">
          {statusBanner}
        </div>
      )}
      {errorBanner && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-900">
          {errorBanner}
        </div>
      )}

      {/* LAYOUT 3 ZONES INSPIRÉ DE FIGMA & WORDPRESS/STRAPI */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* 2. PANNEAU GAUCHE : EXPLORATEUR DE CALQUES & MODULES */}
        <aside className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm lg:col-span-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Explorateur &amp; Modules CMS
          </div>
          <nav className="space-y-1">
            {[
              { id: 'OVERVIEW', label: 'Vue d’ensemble & Gouvernance', icon: Shield },
              { id: 'STUDIO_FIGMA', label: 'Studio Identité & Blocs (Figma)', icon: Palette },
              { id: 'LOGINS_RBAC', label: 'Logins & Rôles (Activer/Couper)', icon: UserCheck },
              { id: 'LICENSES_SALES', label: 'Vente & Gestion des Licences', icon: CreditCard },
              { id: 'REFERENTIALS', label: 'Données Internes & Barèmes', icon: Database },
              { id: 'RESET_PROD', label: 'Remise à Zéro Production', icon: RotateCcw },
            ].map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id as StudioSectionId)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                    active
                      ? 'bg-[#0A1F3D] text-white shadow-sm'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? 'text-[#D4AF37]' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Arbre des calques Figma (quand Studio actif) */}
          {section === 'STUDIO_FIGMA' && (
            <div className="border-t border-slate-200 pt-3">
              <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <span className="flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5" />
                  Calques du Document
                </span>
                <span>{blocks.filter((b) => b.visible).length}/{blocks.length}</span>
              </div>
              <div className="space-y-1">
                {[...blocks]
                  .sort((a, b) => a.order - b.order)
                  .map((blk) => {
                    const selected = blk.id === selectedBlock.id;
                    return (
                      <div
                        key={blk.id}
                        className={`flex items-center justify-between gap-1 rounded-lg border px-2 py-1.5 text-[11px] ${
                          selected
                            ? 'border-[#0A1F3D] bg-[#0A1F3D]/5 font-bold text-[#0A1F3D]'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedBlockId(blk.id)}
                          className="flex-1 truncate text-left"
                        >
                          {blk.order}. {blk.label}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setBlocks((prev) =>
                              prev.map((p) =>
                                p.id === blk.id ? { ...p, visible: !p.visible } : p
                              )
                            )
                          }
                          title="Afficher / Masquer ce bloc"
                          className="rounded p-0.5 text-slate-500 hover:bg-slate-200"
                        >
                          {blk.visible ? (
                            <Eye className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                          )}
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </aside>

        {/* 3. ZONE CENTRALE : CANVAS EN DIRECT (LIVE PREVIEW RESPONSIVE) */}
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-100/80 p-4 shadow-sm lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#0A1F3D]">
              Canvas Temps Réel — {identity.entityName}
            </span>
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
              {[
                { id: 'DESKTOP', icon: Monitor, label: 'Bureau' },
                { id: 'TABLET', icon: Tablet, label: 'Tablette' },
                { id: 'MOBILE', icon: Smartphone, label: 'Mobile' },
              ].map((vp) => {
                const Icon = vp.icon;
                return (
                  <button
                    key={vp.id}
                    type="button"
                    onClick={() => setViewport(vp.id as typeof viewport)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${
                      viewport === vp.id
                        ? 'bg-[#0A1F3D] text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {vp.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`mx-auto w-full transition-all ${canvasWidthClass}`}>
            {/* OVERVIEW */}
            {section === 'OVERVIEW' && (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-xs">
                <h2 className="text-sm font-bold text-[#0A1F3D]">
                  Tableau de Gouvernance Multi-Entités (V2.1 Élargie)
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] text-slate-500">Portée Habilitation</div>
                    <div className="mt-1 font-bold text-[#0A1F3D]">
                      {isSuperAdmin
                        ? 'Super Admin Plateforme TIT-CS (Toutes Entités)'
                        : `Admin d’Entité (${identity.entityCode})`}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] text-slate-500">Licence d’Exploitation</div>
                    <div className="mt-1 font-bold text-emerald-700">
                      {licenseEval.effectiveStatus} · {activeLicense.planCode} ({licenseEval.daysRemaining}j)
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600">{licenseEval.statusMessage}</p>

                {supervisionRows.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <div className="mb-2 font-bold text-[#0A1F3D]">
                      Supervision Multi-Entités &amp; Hiérarchie de Tutelle ({supervisionRows.length})
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                            <th className="p-1.5">Code</th>
                            <th className="p-1.5">Entité &amp; Type</th>
                            <th className="p-1.5">Logins</th>
                            <th className="p-1.5">Marchés</th>
                            <th className="p-1.5">Licence</th>
                            <th className="p-1.5"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {supervisionRows.map((row) => (
                            <tr key={row.id}>
                              <td className="p-1.5 font-mono font-semibold">{row.code}</td>
                              <td className="p-1.5">
                                <div className="font-semibold text-slate-900">{row.name}</div>
                                <div className="text-[10px] text-slate-500">
                                  {row.type}
                                  {row.parent_entity_id ? ' · Sous tutelle' : ''}
                                </div>
                              </td>
                              <td className="p-1.5">{row.activeLoginsCount}</td>
                              <td className="p-1.5">{row.projectsCount}</td>
                              <td className="p-1.5">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    row.license?.status === 'ACTIVE'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {row.license?.status ?? 'N/A'}
                                </span>
                              </td>
                              <td className="p-1.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => setSelectedEntityId(row.id)}
                                  className="rounded bg-[#0A1F3D] px-2 py-1 text-[10px] font-semibold text-white"
                                >
                                  Piloter
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STUDIO FIGMA / CMS LIVE CANVAS */}
            {section === 'STUDIO_FIGMA' && (
              <div
                className={`rounded-2xl border bg-white p-6 shadow-md ${
                  identity.typography === 'serif' ? 'font-serif' : 'font-sans'
                }`}
                style={{ borderColor: identity.accentColor }}
              >
                <div
                  className="mb-4 h-2 w-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${identity.primaryColor}, ${identity.accentColor})`,
                  }}
                />
                <div className="space-y-3">
                  {[...blocks]
                    .sort((a, b) => a.order - b.order)
                    .filter((b) => b.visible)
                    .map((blk) => {
                      const rendered = renderStudioTemplate(blk.customText ?? '', {
                        entityName: identity.entityName,
                        entityCode: identity.entityCode,
                        city: identity.municipality,
                        fiscalYear: profile.fiscalYear,
                        signerTitle: profile.title,
                        signerName: profile.fullName,
                        headerTimbreText: identity.headerTimbreText,
                        footerLegalText: identity.footerLegalText,
                      });
                      const isSel = blk.id === selectedBlock.id && editMode === 'EDIT';
                      return (
                        <div
                          key={blk.id}
                          onClick={() => setSelectedBlockId(blk.id)}
                          className={`cursor-pointer rounded-xl p-3 transition ${
                            isSel
                              ? 'ring-2 ring-[#0A1F3D] bg-slate-50'
                              : 'hover:bg-slate-50/70'
                          }`}
                        >
                          {blk.id === 'blk_entity' && (
                            <div className="mb-1 flex items-center gap-2">
                              <div
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                                style={{ backgroundColor: identity.primaryColor }}
                              >
                                {identity.entityCode.slice(0, 4)}
                              </div>
                              <span
                                className="text-xs font-bold uppercase"
                                style={{ color: identity.primaryColor }}
                              >
                                {identity.entityType}
                              </span>
                            </div>
                          )}
                          <pre className="whitespace-pre-wrap font-inherit text-xs leading-relaxed text-slate-800">
                            {rendered}
                          </pre>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* LOGINS & ACTIVATION/DÉSACTIVATION + CMS UTILISATEURS COMPLET */}
            {section === 'LOGINS_RBAC' && (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-[#0A1F3D]">
                    CMS Comptes, Auth &amp; Habilitations RBAC — {identity.entityName}
                  </h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                    {memberships.filter((m) => m.is_active ?? m.active).length} actif(s) / max{' '}
                    {activeLicense.maxActiveLogins}
                  </span>
                </div>

                {/* Formulaire création directe compte Supabase Auth + Affectation RBAC */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
                  <div className="font-bold text-[#0A1F3D]">
                    + Créer un compte utilisateur Auth &amp; attribuer un rôle
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <input
                      value={cmsUserName}
                      onChange={(e) => setCmsUserName(e.target.value)}
                      placeholder="Nom & Prénom complet"
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                    />
                    <input
                      value={cmsUserEmail}
                      onChange={(e) => setCmsUserEmail(e.target.value)}
                      placeholder="Email institutionnel"
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                    />
                    <input
                      value={cmsUserPass}
                      onChange={(e) => setCmsUserPass(e.target.value)}
                      placeholder="Mot de passe initial"
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                    />
                    <select
                      value={cmsUserRole}
                      onChange={(e) => setCmsUserRole(e.target.value as RbacRole)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                    >
                      <option value="SIGAMP">SIGAMP</option>
                      <option value="MO_MOD">MO_MOD (Maire / Préfet / MOD)</option>
                      <option value="ADMIN_ENTITE">ADMIN_ENTITE</option>
                      <option value="CPM_PRESIDENT">CPM_PRESIDENT</option>
                      <option value="SCA_RAPPORTEUR">SCA_RAPPORTEUR</option>
                      <option value="CONTROLEUR_FINANCIER">CONTROLEUR_FINANCIER</option>
                      <option value="RECEVEUR_COMPTABLE">RECEVEUR_COMPTABLE</option>
                      <option value="INGENIEUR_MARCHE">INGENIEUR_MARCHE</option>
                      <option value="CHEF_SERVICE_MARCHE">CHEF_SERVICE_MARCHE</option>
                      <option value="TUTELLE_ETAT">TUTELLE_ETAT (Préfecture / Gouvernorat)</option>
                      <option value="ARMP_OBSERVATEUR">ARMP_OBSERVATEUR</option>
                      <option value="ARMP_REGULATEUR">ARMP_REGULATEUR</option>
                      <option value="CCCM">CCCM</option>
                      <option value="SOUMISSIONNAIRE">SOUMISSIONNAIRE</option>
                    </select>
                    <input
                      value={cmsUserGrade}
                      onChange={(e) => setCmsUserGrade(e.target.value)}
                      placeholder="Fonction / Grade"
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                    />
                    <div className="flex gap-2">
                      <input
                        value={cmsUserMatricule}
                        onChange={(e) => setCmsUserMatricule(e.target.value)}
                        placeholder="Matricule"
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                      />
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleCmsCreateUser()}
                        className="shrink-0 rounded-lg bg-[#0A1F3D] px-3 py-1.5 font-semibold text-white"
                      >
                        Créer
                      </button>
                    </div>
                  </div>
                </div>

                {memberships.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Connectez-vous avec un compte réel Supabase Auth pour administrer en direct les logins en base de données.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {memberships.map((mem) => {
                      const isActive = mem.is_active ?? mem.active;
                      return (
                        <div
                          key={mem.id}
                          onClick={() => setSelectedMembershipId(mem.id)}
                          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-xs cursor-pointer ${
                            selectedMembership?.id === mem.id
                              ? 'border-[#0A1F3D] bg-[#0A1F3D]/5'
                              : 'border-slate-200'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-slate-900">
                              {mem.user_profiles?.full_name ?? mem.user_id}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {mem.user_profiles?.email} · Rôle : <strong>{mem.role}</strong>
                              {mem.user_profiles?.grade_title ? ` · ${mem.user_profiles.grade_title}` : ''}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleToggleLogin(mem);
                              }}
                              className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] font-bold ${
                                isActive
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                              }`}
                            >
                              {isActive ? (
                                <>
                                  <UserCheck className="h-3.5 w-3.5" />
                                  ACTIF
                                </>
                              ) : (
                                <>
                                  <UserX className="h-3.5 w-3.5" />
                                  DÉSACTIVÉ
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleCmsRevokeUser(mem);
                              }}
                              className="rounded-xl border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                              title="Révoquer cette habilitation"
                            >
                              Révoquer
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {selectedMembership && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                        <span className="font-semibold text-slate-700">
                          Réinitialiser mot de passe ({selectedMembership.user_profiles?.email}) :
                        </span>
                        <input
                          value={cmsResetPass}
                          onChange={(e) => setCmsResetPass(e.target.value)}
                          placeholder="Nouveau mot de passe (>= 8 car.)"
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1"
                        />
                        <button
                          type="button"
                          onClick={() => void handleCmsResetPassword(selectedMembership.user_id)}
                          className="rounded-lg bg-[#0A1F3D] px-3 py-1 font-semibold text-white"
                        >
                          Appliquer
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* VENTE & GESTION DES LICENCES */}
            {section === 'LICENSES_SALES' && (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-[#0A1F3D]">
                      Licence Actuelle : {activeLicense.licenseKey}
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Formule {activeLicense.planCode} · Expire le{' '}
                      {activeLicense.expiresAtIso.slice(0, 10)} · Jeton Offline :{' '}
                      <code className="rounded bg-slate-100 px-1">{activeLicense.offlineProofToken}</code>
                    </p>
                  </div>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => void handleToggleLicenseSuspend()}
                      className={`rounded-xl px-3 py-1.5 font-bold ${
                        activeLicense.status === 'SUSPENDUE'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-rose-600 text-white'
                      }`}
                    >
                      {activeLicense.status === 'SUSPENDUE'
                        ? 'Réactiver Licence'
                        : 'Suspendre Licence'}
                    </button>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {LICENSE_PLANS.map((plan) => {
                    const selected = plan.planCode === selectedPlanCode;
                    return (
                      <button
                        key={plan.planCode}
                        type="button"
                        onClick={() => setSelectedPlanCode(plan.planCode)}
                        className={`rounded-xl border p-3 text-left transition ${
                          selected
                            ? 'border-[#0A1F3D] bg-[#0A1F3D]/5 ring-2 ring-[#0A1F3D]/20'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-[#0A1F3D]">
                          <span>{plan.label}</span>
                          <span className="font-mono text-amber-700">
                            {plan.priceFcfa.toLocaleString('fr-FR')} F
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-600">{plan.description}</p>
                        <div className="mt-1 text-[10px] font-semibold text-slate-500">
                          {plan.durationDays} jours · max {plan.maxActiveLogins} logins actifs
                        </div>
                      </button>
                    );
                  })}
                </div>

                {generatedReceiptText && (
                  <pre className="whitespace-pre-wrap rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-mono text-[11px] text-emerald-950">
                    {generatedReceiptText}
                  </pre>
                )}
              </div>
            )}

            {/* REFERENTIALS */}
            {section === 'REFERENTIALS' && (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-xs">
                <h2 className="text-sm font-bold text-[#0A1F3D]">
                  Données Internes &amp; Référentiels de l’Entité
                </h2>
                <div>
                  <label className="font-semibold text-slate-700">
                    Directions &amp; Services Techniques Internes
                  </label>
                  <textarea
                    rows={4}
                    value={internalServicesText}
                    onChange={(e) => setInternalServicesText(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">
                    Lignes Budgétaires &amp; Barèmes Locaux
                  </label>
                  <textarea
                    rows={4}
                    value={budgetLinesText}
                    onChange={(e) => setBudgetLinesText(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"
                  />
                </div>
              </div>
            )}

            {/* REMISE À ZÉRO PRODUCTION (AXE 5) */}
            {section === 'RESET_PROD' && (
              <div className="space-y-4 rounded-2xl border border-rose-200 bg-white p-5 shadow-sm text-xs">
                <div className="flex items-center gap-2 text-sm font-bold text-rose-800">
                  <AlertOctagon className="h-5 w-5 text-rose-600" />
                  Remise à Zéro Sécurisée — Bascule Production Effective
                </div>
                <p className="text-slate-600">
                  Efface toutes les données opérationnelles de test de <strong>{identity.entityName}</strong> (projets, maturation, désignations, CCTP, devis confidentiels, DAO, offres, contrats, décomptes, contentieux, réceptions, indemnités et cache local IndexedDB).
                </p>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="font-bold text-emerald-900">Éléments strictement conservés :</div>
                  <ul className="mt-1 list-disc pl-5 text-[11px] text-emerald-800">
                    {PRESERVED_CONFIGURATION_ITEMS.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="font-semibold text-slate-700">
                      1. Saisir le code exact de l’entité ({identity.entityCode})
                    </label>
                    <input
                      value={confirmEntityCode}
                      onChange={(e) => setConfirmEntityCode(e.target.value)}
                      placeholder={identity.entityCode}
                      className="mt-1 w-full rounded-lg border border-rose-300 px-3 py-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">
                      2. Motif officiel (min. 10 caractères)
                    </label>
                    <input
                      value={resetReason}
                      onChange={(e) => setResetReason(e.target.value)}
                      placeholder="Clôture recette pilote et lancement production 2026"
                      className="mt-1 w-full rounded-lg border border-rose-300 px-3 py-2"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={deleteTestUsers}
                    onChange={(e) => setDeleteTestUsers(e.target.checked)}
                  />
                  Supprimer également les comptes explicitement marqués comme comptes de test
                </label>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleResetToProduction()}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 font-bold text-white shadow hover:bg-rose-800 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  Exécuter la Remise à Zéro Production
                </button>

                {resetSummary && (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-[11px] text-emerald-950">
                    <strong>Audit {resetSummary.auditLogId} :</strong> {resetSummary.totalDeletedRows} ligne(s) purgée(s) le{' '}
                    {resetSummary.executedAtIso}.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* 4. PANNEAU DROIT : INSPECTEUR DE PROPRIÉTÉS STYLE FIGMA */}
        <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Inspecteur de Propriétés
          </div>

          {section === 'STUDIO_FIGMA' && (
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-600">Nom de l’Entité</label>
                <input
                  value={identity.entityName}
                  onChange={(e) => setIdentity({ ...identity, entityName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-600">Couleur Primaire</label>
                  <input
                    type="color"
                    value={identity.primaryColor}
                    onChange={(e) => setIdentity({ ...identity, primaryColor: e.target.value })}
                    className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-slate-300 p-1"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-600">Couleur Accent</label>
                  <input
                    type="color"
                    value={identity.accentColor}
                    onChange={(e) => setIdentity({ ...identity, accentColor: e.target.value })}
                    className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-slate-300 p-1"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-600">Typographie Officielle</label>
                <select
                  value={identity.typography}
                  onChange={(e) =>
                    setIdentity({
                      ...identity,
                      typography: e.target.value as 'serif' | 'sans',
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                >
                  <option value="serif">Classique Administrative (Serif)</option>
                  <option value="sans">Moderne Numérique (Sans-Serif)</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-600">Timbre Officiel</label>
                <textarea
                  rows={2}
                  value={identity.headerTimbreText}
                  onChange={(e) =>
                    setIdentity({ ...identity, headerTimbreText: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-[11px]"
                />
              </div>

              <div className="border-t border-slate-200 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#0A1F3D]">
                    Bloc sélectionné : {selectedBlock.label}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setBlocks((prev) => moveStudioBlock(prev, selectedBlock.id, 'UP'))}
                      className="rounded border border-slate-200 p-1 hover:bg-slate-100"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setBlocks((prev) => moveStudioBlock(prev, selectedBlock.id, 'DOWN'))}
                      className="rounded border border-slate-200 p-1 hover:bg-slate-100"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <textarea
                  rows={4}
                  value={selectedBlock.customText ?? ''}
                  onChange={(e) =>
                    setBlocks((prev) =>
                      prev.map((b) =>
                        b.id === selectedBlock.id ? { ...b, customText: e.target.value } : b
                      )
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 p-2 font-mono text-[11px]"
                />
                <div className="mt-2">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Variables Dynamiques (1 clic)
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {DYNAMIC_STUDIO_VARIABLES.map((v) => (
                      <button
                        key={v.token}
                        type="button"
                        title={v.label}
                        onClick={() =>
                          setBlocks((prev) =>
                            prev.map((b) =>
                              b.id === selectedBlock.id
                                ? { ...b, customText: `${b.customText ?? ''} ${v.token}`.trim() }
                                : b
                            )
                          )
                        }
                        className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-[#0A1F3D] hover:bg-[#0A1F3D] hover:text-white"
                      >
                        {v.token}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {section === 'LICENSES_SALES' && (
            <div className="space-y-3 text-xs">
              <div className="font-bold text-[#0A1F3D]">Souscription / Renouvellement</div>
              <div>
                <label className="font-semibold text-slate-600">Canal de paiement</label>
                <select
                  value={paymentChannel}
                  onChange={(e) => setPaymentChannel(e.target.value as typeof paymentChannel)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                >
                  <option value="VIREMENT_TRESOR">Virement Trésor / Bancaire</option>
                  <option value="BON_COMMANDE_PUBLIC">Bon de Commande Administratif</option>
                  <option value="MTN_MOMO">MTN Mobile Money</option>
                  <option value="ORANGE_MONEY">Orange Money</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-600">Référence paiement / BC</label>
                <input
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono"
                />
              </div>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleIssueOrOrderLicense(false)}
                className="w-full rounded-xl border border-[#0A1F3D] px-3 py-2 font-semibold text-[#0A1F3D] hover:bg-slate-50"
              >
                Générer Bon de Commande Licence
              </button>
              {isSuperAdmin && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleIssueOrOrderLicense(true)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#0A1F3D] px-3 py-2 font-bold text-[#D4AF37]"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Émettre &amp; Activer Immédiatement
                </button>
              )}
            </div>
          )}

          {section !== 'STUDIO_FIGMA' && section !== 'LICENSES_SALES' && (
            <div className="space-y-2 text-xs text-slate-600">
              <div className="flex items-center gap-1.5 font-bold text-[#0A1F3D]">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                État Entité &amp; Sécurité
              </div>
              <p>Code : <strong className="font-mono">{identity.entityCode}</strong></p>
              <p>Couleurs : <span className="font-mono">{identity.primaryColor}</span> / <span className="font-mono">{identity.accentColor}</span></p>
              <p>Clé Licence : <span className="font-mono text-[11px]">{activeLicense.licenseKey}</span></p>
              <button
                type="button"
                onClick={() => void loadEntityData(selectedEntityId)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold hover:bg-slate-50"
              >
                <RefreshCw className="h-3 w-3" />
                Actualiser depuis Supabase
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
