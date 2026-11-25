-- ============================================================================
-- SIGAMP-CM V2.1 ÉLARGIE :
-- - Double Gouvernance (Super Admin Plateforme TIT-CS vs Admin d'Entité)
-- - Multi-entités à grande échelle (index composites + RLS active=TRUE)
-- - Vente & Gestion des Licences d'Exploitation (Plans, Licences, Commandes)
-- - Identité Visuelle & Studio Figma/CMS par entité (blocs, versions, variables)
-- - RPC Login lié à l'entité + Remise à zéro sécurisée en production
-- ============================================================================

-- 1. Enrichissement de public.entities (Identité Visuelle & Studio Figma/CMS)
ALTER TABLE public.entities
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS logo_svg TEXT,
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS primary_color TEXT NOT NULL DEFAULT '#0A1F3D',
    ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '#D4AF37',
    ADD COLUMN IF NOT EXISTS header_timbre_text TEXT NOT NULL DEFAULT E'RÉPUBLIQUE DU CAMEROUN\nPaix - Travail - Patrie',
    ADD COLUMN IF NOT EXISTS footer_legal_text TEXT DEFAULT '© 2026 Joël Tchassom & TIT-Consulting Solutions (TIT-CS) — Plateforme SIGAMP-CM',
    ADD COLUMN IF NOT EXISTS studio_config JSONB NOT NULL DEFAULT '{"blocks":[{"id":"blk_timbre","label":"Timbre & Armoiries","visible":true,"order":1},{"id":"blk_entity","label":"Entête Institutionnelle","visible":true,"order":2},{"id":"blk_chrono","label":"Numéro Chrono & QR","visible":true,"order":3},{"id":"blk_body","label":"Corps de l’Acte","visible":true,"order":4},{"id":"blk_signatory","label":"Bloc Signataire & Cachet","visible":true,"order":5},{"id":"blk_ampliations","label":"Ampliations & Archives","visible":true,"order":6}],"typography":"serif","compactHeader":false}'::jsonb,
    ADD COLUMN IF NOT EXISTS studio_versions JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS local_referentials JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Enrichissement de public.user_profiles & public.entity_memberships
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS platform_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.entity_memberships
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Synchronisation active <-> is_active sur entity_memberships
CREATE OR REPLACE FUNCTION public.sync_membership_active_flags()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.active := COALESCE(NEW.is_active, NEW.active, TRUE);
        NEW.is_active := NEW.active;
    ELSE
        IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
            NEW.active := NEW.is_active;
        ELSIF NEW.active IS DISTINCT FROM OLD.active THEN
            NEW.is_active := NEW.active;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_membership_active_flags ON public.entity_memberships;
CREATE TRIGGER trg_sync_membership_active_flags
BEFORE INSERT OR UPDATE ON public.entity_memberships
FOR EACH ROW EXECUTE FUNCTION public.sync_membership_active_flags();

-- 3. Helper Super Admin Plateforme & durcissement has_entity_role (vérifie active + is_active)
CREATE OR REPLACE FUNCTION public.is_platform_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.id = auth.uid()
          AND up.active = TRUE
          AND up.platform_super_admin = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION public.has_entity_role(p_entity_id uuid, p_roles rbac_role[] DEFAULT NULL::rbac_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT public.is_platform_super_admin()
    OR EXISTS (
        SELECT 1
        FROM public.entity_memberships em
        JOIN public.user_profiles up ON up.id = em.user_id
        JOIN public.entities e ON e.id = em.entity_id
        WHERE em.user_id = auth.uid()
          AND em.entity_id = p_entity_id
          AND em.active = TRUE
          AND em.is_active = TRUE
          AND up.active = TRUE
          AND e.active = TRUE
          AND e.is_active = TRUE
          AND (em.valid_until IS NULL OR em.valid_until >= CURRENT_DATE)
          AND (
              p_roles IS NULL
              OR em.role = ANY(p_roles)
              OR em.role IN ('SUPER_ADMIN'::rbac_role, 'ADMIN_ENTITE'::rbac_role)
          )
    );
$$;

-- 4. Indexation systématique multi-entités à grande échelle
CREATE INDEX IF NOT EXISTS idx_projects_entity_created ON public.projects (entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_entity_status ON public.projects (entity_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_entity_fy ON public.projects (entity_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_tender_files_entity_created ON public.tender_files (entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_entity_created ON public.contracts (entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_entity_status ON public.contracts (entity_id, status);
CREATE INDEX IF NOT EXISTS idx_decomptes_entity_created ON public.decomptes (entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decomptes_entity_status ON public.decomptes (entity_id, status);
CREATE INDEX IF NOT EXISTS idx_disputes_entity_created ON public.disputes (entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_entity_status ON public.disputes (entity_id, status);
CREATE INDEX IF NOT EXISTS idx_receptions_entity_created ON public.receptions (entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_indemnities_entity_fy_status ON public.indemnity_liquidations (entity_id, fiscal_year, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created ON public.audit_logs (entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memberships_entity_active ON public.entity_memberships (entity_id, user_id, is_active);

-- 5. Catalogue des Offres & Licences d'Exploitation (TIT-CS)
CREATE TABLE IF NOT EXISTS public.license_plans (
    plan_code           TEXT PRIMARY KEY CHECK (
        plan_code IN ('ESSAI_DEMO', 'MENSUELLE', 'ANNUELLE', 'PLURIANNUELLE', 'SOUVERAINE')
    ),
    label               TEXT NOT NULL,
    description         TEXT NOT NULL,
    duration_days       INTEGER NOT NULL CHECK (duration_days > 0),
    price_fcfa          NUMERIC(18, 2) NOT NULL CHECK (price_fcfa >= 0),
    max_active_logins   INTEGER NOT NULL CHECK (max_active_logins > 0),
    includes_ai_copilot BOOLEAN NOT NULL DEFAULT TRUE,
    includes_studio_cms BOOLEAN NOT NULL DEFAULT TRUE,
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.entity_licenses (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id           UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    plan_code           TEXT NOT NULL REFERENCES public.license_plans(plan_code),
    status              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (
        status IN ('ACTIVE', 'SUSPENDUE', 'EXPIREE', 'EN_ATTENTE_VALIDATION')
    ),
    license_key         TEXT NOT NULL UNIQUE,
    offline_proof_token TEXT NOT NULL,
    starts_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL,
    max_active_logins   INTEGER NOT NULL DEFAULT 25,
    amount_fcfa         NUMERIC(18, 2) NOT NULL DEFAULT 0,
    payment_ref         TEXT,
    receipt_sha256      TEXT,
    issued_by           UUID REFERENCES public.user_profiles(id),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_licenses_entity_status ON public.entity_licenses (entity_id, status, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.license_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id       UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    plan_code       TEXT NOT NULL REFERENCES public.license_plans(plan_code),
    order_ref       TEXT NOT NULL UNIQUE,
    amount_fcfa     NUMERIC(18, 2) NOT NULL,
    duration_days   INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'EN_ATTENTE_PAIEMENT' CHECK (
        status IN ('EN_ATTENTE_PAIEMENT', 'VALIDEE_ACTIVEE', 'ANNULEE')
    ),
    payment_channel TEXT NOT NULL DEFAULT 'VIREMENT_TRESOR',
    payment_ref     TEXT,
    receipt_sha256  TEXT,
    requested_by    UUID REFERENCES public.user_profiles(id),
    validated_by    UUID REFERENCES public.user_profiles(id),
    validated_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_license_orders_entity_created ON public.license_orders (entity_id, created_at DESC);

ALTER TABLE public.license_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_license_plans_read ON public.license_plans;
CREATE POLICY p_license_plans_read ON public.license_plans FOR SELECT TO anon, authenticated
USING (active = TRUE);

DROP POLICY IF EXISTS p_license_plans_superadmin ON public.license_plans;
CREATE POLICY p_license_plans_superadmin ON public.license_plans FOR ALL TO authenticated
USING (public.is_platform_super_admin())
WITH CHECK (public.is_platform_super_admin());

DROP POLICY IF EXISTS p_entity_licenses_select ON public.entity_licenses;
CREATE POLICY p_entity_licenses_select ON public.entity_licenses FOR SELECT TO authenticated
USING (public.is_platform_super_admin() OR public.has_entity_role(entity_id));

DROP POLICY IF EXISTS p_entity_licenses_write ON public.entity_licenses;
CREATE POLICY p_entity_licenses_write ON public.entity_licenses FOR ALL TO authenticated
USING (public.is_platform_super_admin())
WITH CHECK (public.is_platform_super_admin());

DROP POLICY IF EXISTS p_license_orders_select ON public.license_orders;
CREATE POLICY p_license_orders_select ON public.license_orders FOR SELECT TO authenticated
USING (public.is_platform_super_admin() OR public.has_entity_role(entity_id));

DROP POLICY IF EXISTS p_license_orders_insert ON public.license_orders;
CREATE POLICY p_license_orders_insert ON public.license_orders FOR INSERT TO authenticated
WITH CHECK (
    public.is_platform_super_admin()
    OR public.has_entity_role(entity_id, ARRAY['MO_MOD', 'SIGAMP', 'ADMIN_ENTITE', 'SUPER_ADMIN']::rbac_role[])
);

DROP POLICY IF EXISTS p_license_orders_update ON public.license_orders;
CREATE POLICY p_license_orders_update ON public.license_orders FOR UPDATE TO authenticated
USING (public.is_platform_super_admin())
WITH CHECK (public.is_platform_super_admin());

-- Politique écriture sur entities pour Admin d'Entité (son entité) et Super Admin (toutes)
DROP POLICY IF EXISTS p_entities_admin_update ON public.entities;
CREATE POLICY p_entities_admin_update ON public.entities FOR UPDATE TO authenticated
USING (
    public.is_platform_super_admin()
    OR public.has_entity_role(id, ARRAY['ADMIN_ENTITE', 'SUPER_ADMIN', 'MO_MOD', 'SIGAMP']::rbac_role[])
)
WITH CHECK (
    public.is_platform_super_admin()
    OR public.has_entity_role(id, ARRAY['ADMIN_ENTITE', 'SUPER_ADMIN', 'MO_MOD', 'SIGAMP']::rbac_role[])
);

DROP POLICY IF EXISTS p_entities_superadmin_insert ON public.entities;
CREATE POLICY p_entities_superadmin_insert ON public.entities FOR INSERT TO authenticated
WITH CHECK (public.is_platform_super_admin());

-- 6. RPC Publique pour /login : Annuaire des entités & statut de licence
CREATE OR REPLACE FUNCTION public.list_login_entities()
RETURNS TABLE (
    id UUID,
    code TEXT,
    name TEXT,
    type entity_type,
    municipality TEXT,
    primary_color TEXT,
    accent_color TEXT,
    license_status TEXT,
    license_plan_code TEXT,
    license_expires_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        e.id,
        e.code,
        e.name,
        e.type,
        e.municipality,
        e.primary_color,
        e.accent_color,
        COALESCE(
            CASE
                WHEN l.status = 'ACTIVE' AND l.expires_at < NOW() THEN 'EXPIREE'
                ELSE l.status
            END,
            'EXPIREE'
        ) AS license_status,
        COALESCE(l.plan_code, 'AUCUNE') AS license_plan_code,
        l.expires_at AS license_expires_at
    FROM public.entities e
    LEFT JOIN LATERAL (
        SELECT el.status, el.plan_code, el.expires_at
        FROM public.entity_licenses el
        WHERE el.entity_id = e.id
        ORDER BY el.expires_at DESC, el.created_at DESC
        LIMIT 1
    ) l ON TRUE
    WHERE e.active = TRUE AND e.is_active = TRUE
    ORDER BY e.name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_login_entities() TO anon, authenticated;

-- 7. RPC Authentifiée : Vérification stricte de connexion liée à une entité
CREATE OR REPLACE FUNCTION public.verify_entity_login_access(p_entity_id UUID)
RETURNS TABLE (
    allowed BOOLEAN,
    reason TEXT,
    user_active BOOLEAN,
    membership_active BOOLEAN,
    entity_active BOOLEAN,
    license_status TEXT,
    license_expires_at TIMESTAMPTZ,
    is_super_admin BOOLEAN,
    role_codes TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_user_active BOOLEAN := FALSE;
    v_is_super BOOLEAN := FALSE;
    v_entity_active BOOLEAN := FALSE;
    v_mem_active BOOLEAN := FALSE;
    v_roles TEXT[] := '{}';
    v_lic_status TEXT := 'EXPIREE';
    v_lic_exp TIMESTAMPTZ := NULL;
BEGIN
    IF v_uid IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Session non authentifiée.', FALSE, FALSE, FALSE, 'EXPIREE', NULL::TIMESTAMPTZ, FALSE, '{}'::TEXT[];
        RETURN;
    END IF;

    SELECT up.active, up.platform_super_admin
    INTO v_user_active, v_is_super
    FROM public.user_profiles up
    WHERE up.id = v_uid;

    v_user_active := COALESCE(v_user_active, FALSE);
    v_is_super := COALESCE(v_is_super, FALSE);

    SELECT (e.active AND e.is_active)
    INTO v_entity_active
    FROM public.entities e
    WHERE e.id = p_entity_id;

    v_entity_active := COALESCE(v_entity_active, FALSE);

    SELECT
        COALESCE(bool_or(em.active AND em.is_active AND (em.valid_until IS NULL OR em.valid_until >= CURRENT_DATE)), FALSE),
        COALESCE(array_agg(em.role::TEXT) FILTER (WHERE em.active AND em.is_active AND (em.valid_until IS NULL OR em.valid_until >= CURRENT_DATE)), '{}')
    INTO v_mem_active, v_roles
    FROM public.entity_memberships em
    WHERE em.user_id = v_uid
      AND em.entity_id = p_entity_id;

    SELECT
        CASE WHEN el.status = 'ACTIVE' AND el.expires_at < NOW() THEN 'EXPIREE' ELSE el.status END,
        el.expires_at
    INTO v_lic_status, v_lic_exp
    FROM public.entity_licenses el
    WHERE el.entity_id = p_entity_id
    ORDER BY el.expires_at DESC, el.created_at DESC
    LIMIT 1;

    v_lic_status := COALESCE(v_lic_status, 'EXPIREE');

    IF NOT v_user_active THEN
        RETURN QUERY SELECT FALSE, 'Compte utilisateur désactivé par l’administration.', v_user_active, v_mem_active, v_entity_active, v_lic_status, v_lic_exp, v_is_super, v_roles;
        RETURN;
    END IF;

    IF NOT v_entity_active THEN
        RETURN QUERY SELECT FALSE, 'Entité inactive ou introuvable.', v_user_active, v_mem_active, v_entity_active, v_lic_status, v_lic_exp, v_is_super, v_roles;
        RETURN;
    END IF;

    IF NOT v_is_super AND NOT v_mem_active THEN
        RETURN QUERY SELECT FALSE, 'Accès refusé : votre login n’est pas actif ou n’est pas rattaché à cette entité.', v_user_active, v_mem_active, v_entity_active, v_lic_status, v_lic_exp, v_is_super, v_roles;
        RETURN;
    END IF;

    IF NOT v_is_super AND v_lic_status IN ('SUSPENDUE', 'EN_ATTENTE_VALIDATION') THEN
        RETURN QUERY SELECT FALSE, format('Licence de l’entité %s : accès bloqué.', v_lic_status), v_user_active, v_mem_active, v_entity_active, v_lic_status, v_lic_exp, v_is_super, v_roles;
        RETURN;
    END IF;

    -- Note : Si licence EXPIREE, l'accès lecture archives reste possible (signalé côté UI/API)
    RETURN QUERY SELECT TRUE,
        CASE WHEN v_lic_status = 'EXPIREE' THEN 'Licence expirée : mode consultation des archives uniquement.' ELSE 'Accès autorisé.' END,
        v_user_active, v_mem_active, v_entity_active, v_lic_status, v_lic_exp, v_is_super, v_roles;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_entity_login_access(UUID) TO authenticated;

-- 8. Seed Plans de Licence & Licence Active Pilote (Commune de Bafang) + Super Admin TIT-CS
INSERT INTO public.license_plans (plan_code, label, description, duration_days, price_fcfa, max_active_logins, includes_ai_copilot, includes_studio_cms)
VALUES
  ('ESSAI_DEMO', 'Essai & Découverte (30 jours)', 'Licence d’évaluation complète pour phase pilote et maturation initiale.', 30, 0, 10, TRUE, TRUE),
  ('MENSUELLE', 'Licence Mensuelle Institutionnelle', 'Accès complet mensuel avec Copilote IA et Studio Visuel.', 30, 150000, 25, TRUE, TRUE),
  ('ANNUELLE', 'Licence Annuelle Standard (CTD / EPA)', 'Couverture annuelle complète pour Commune, EPA ou Projet.', 365, 1500000, 60, TRUE, TRUE),
  ('PLURIANNUELLE', 'Licence Pluriannuelle (3 Ans)', 'Engagement triennal optimisé avec support prioritaire TIT-CS.', 1095, 3900000, 150, TRUE, TRUE),
  ('SOUVERAINE', 'Licence Souveraine Illimitée (Ministère / Région)', 'Déploiement souverain multi-services, API & comptes illimités.', 365, 6500000, 9999, TRUE, TRUE)
ON CONFLICT (plan_code) DO UPDATE SET
  label = EXCLUDED.label,
  price_fcfa = EXCLUDED.price_fcfa,
  max_active_logins = EXCLUDED.max_active_logins;

INSERT INTO public.entity_licenses (
    id, entity_id, plan_code, status, license_key, offline_proof_token, starts_at, expires_at,
    max_active_logins, amount_fcfa, payment_ref, receipt_sha256, notes
)
VALUES (
    '99999999-9999-4999-8999-999999999901',
    '11111111-1111-4111-8111-111111111111',
    'ANNUELLE',
    'ACTIVE',
    'TITCS-SIGAMP-BAF2026-8841A',
    'SIGAMP-OFFLINE-BAF2026-VERIFIED-TITCS',
    '2026-01-01T00:00:00Z',
    '2027-12-31T23:59:59Z',
    60,
    1500000,
    'VIR-TRESOR-BAF-2026-001',
    'c4b8e2f901a37d5c8e12b34f567890abcdef1234567890abcdef1234567890ab',
    'Licence pilote officielle Commune de Bafang — TIT-Consulting Solutions'
)
ON CONFLICT (license_key) DO NOTHING;

-- Habiliter sigamp@commune-bafang.cm en Super Admin Plateforme TIT-CS + Admin d'Entité Bafang
UPDATE public.user_profiles
SET platform_super_admin = TRUE
WHERE id = '8ebb7914-025a-4f61-98cc-e44df4a29bda';

INSERT INTO public.entity_memberships (user_id, entity_id, role, active, is_active, appointment_act_ref)
VALUES (
    '8ebb7914-025a-4f61-98cc-e44df4a29bda',
    '11111111-1111-4111-8111-111111111111',
    'ADMIN_ENTITE',
    TRUE,
    TRUE,
    'DEC-MUN-BAF-2026-ADMIN'
)
ON CONFLICT (user_id, entity_id, role) DO NOTHING;
