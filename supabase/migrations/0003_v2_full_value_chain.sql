-- ============================================================================
-- SIGAMP-CM V2.0 : Chaîne de Valeur Intégrale (Maturation -> Réception Définitive)
-- - Dossier complet de maturation (Circulaire 001/CAB/PM & MINEPAT)
-- - Recommandation & Désignation Ingénieur / Chef de Service + Saisine
-- - CCTP & Coffre-Fort Devis Confidentiel (RLS cloisonné)
-- - DAO-Types Évolutifs (6 pièces + Points d'adaptation + Variables légales)
-- - Enrichissement Réceptions Provisoire/Définitive & Clôture
-- ============================================================================

-- 1. Enrichissement de public.projects & public.user_profiles
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS sector TEXT DEFAULT 'VRD_VOIRIE',
    ADD COLUMN IF NOT EXISTS region TEXT DEFAULT 'Ouest',
    ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'Haut-Nkam',
    ADD COLUMN IF NOT EXISTS arrondissement TEXT DEFAULT 'Bafang',
    ADD COLUMN IF NOT EXISTS gps_coordinates TEXT,
    ADD COLUMN IF NOT EXISTS funding_source TEXT DEFAULT 'BIP',
    ADD COLUMN IF NOT EXISTS maturation_status TEXT NOT NULL DEFAULT 'EN_COURS'
        CHECK (maturation_status IN ('EN_COURS', 'MATURE_VALIDE', 'INCOMPLET')),
    ADD COLUMN IF NOT EXISTS current_stage INTEGER NOT NULL DEFAULT 1
        CHECK (current_stage BETWEEN 1 AND 7);

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS specialty_sector TEXT,
    ADD COLUMN IF NOT EXISTS service_origin TEXT,
    ADD COLUMN IF NOT EXISTS base_city TEXT DEFAULT 'Bafang',
    ADD COLUMN IF NOT EXISTS max_parallel_contracts INTEGER NOT NULL DEFAULT 5;

ALTER TABLE public.receptions
    ADD COLUMN IF NOT EXISTS reserves_lifted_by TEXT,
    ADD COLUMN IF NOT EXISTS warranty_end_date DATE,
    ADD COLUMN IF NOT EXISTS dgd_final_amount_ttc NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS closed_archive_sha256 TEXT;

-- 2. Matrice des pièces de maturation (Étape 1)
CREATE TABLE IF NOT EXISTS public.project_maturation_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id           UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    item_type           TEXT NOT NULL CHECK (
        item_type IN ('APS_APD', 'TDR', 'DISPONIBILITE_SITE', 'MERCURIALE_ESTIMATION', 'EIES_NOTICE')
    ),
    label               TEXT NOT NULL,
    required_for_nature BOOLEAN NOT NULL DEFAULT TRUE,
    status              TEXT NOT NULL DEFAULT 'MANQUANT' CHECK (
        status IN ('MANQUANT', 'EN_COURS', 'VALIDE', 'DISPENSE_JUSTIFIEE')
    ),
    document_ref        TEXT,
    document_date       DATE,
    signatory           TEXT,
    justification_note  TEXT,
    storage_path        TEXT,
    validated_by        UUID REFERENCES public.user_profiles(id),
    validated_at        TIMESTAMPTZ,
    sync_version        BIGINT NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, item_type)
);

-- 3. Désignation technique Ingénieur du Marché / Chef de Service (Étape 2)
CREATE TABLE IF NOT EXISTS public.technical_assignments (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id                UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    project_id               UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id                  UUID REFERENCES public.user_profiles(id),
    agent_name               TEXT NOT NULL,
    agent_title              TEXT NOT NULL,
    service_origin           TEXT,
    assignment_role          TEXT NOT NULL CHECK (
        assignment_role IN ('INGENIEUR_MARCHE', 'CHEF_SERVICE_MARCHE')
    ),
    sector                   TEXT NOT NULL,
    recommendation_score     NUMERIC(5, 2) NOT NULL DEFAULT 0,
    recommendation_rationale TEXT,
    saisine_chrono_number    TEXT,
    saisine_letter_text      TEXT,
    designated_by            UUID REFERENCES public.user_profiles(id),
    designated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status                   TEXT NOT NULL DEFAULT 'DESIGNE' CHECK (
        status IN ('PROPOSE', 'DESIGNE', 'ACCEPTE', 'REMPLACE')
    ),
    sync_version             BIGINT NOT NULL DEFAULT 1,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Livrables Techniques : CCTP & Cadre BPU/DQE non chiffré (Étape 2)
CREATE TABLE IF NOT EXISTS public.cctp_documents (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id            UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    project_id           UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    title                TEXT NOT NULL,
    technical_specs_text TEXT NOT NULL,
    norms_references     TEXT[] NOT NULL DEFAULT '{}',
    bpu_dqe_framework    JSONB NOT NULL DEFAULT '[]'::jsonb,
    authored_by          UUID REFERENCES public.user_profiles(id),
    validated_by_mo      BOOLEAN NOT NULL DEFAULT FALSE,
    validated_at         TIMESTAMPTZ,
    version              INTEGER NOT NULL DEFAULT 1,
    sync_version         BIGINT NOT NULL DEFAULT 1,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, version)
);

-- 5. Coffre-Fort du Devis Confidentiel (Étape 2 - Cloisonnement Strict RLS)
CREATE TABLE IF NOT EXISTS public.confidential_estimates (
    id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id                    UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    project_id                   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    tender_file_id               UUID REFERENCES public.tender_files(id) ON DELETE SET NULL,
    estimate_ref                 TEXT NOT NULL,
    total_ht_fcfa                NUMERIC(18, 2) NOT NULL CHECK (total_ht_fcfa >= 0),
    tva_fcfa                     NUMERIC(18, 2) NOT NULL CHECK (tva_fcfa >= 0),
    total_ttc_fcfa               NUMERIC(18, 2) NOT NULL CHECK (total_ttc_fcfa >= 0),
    line_items                   JSONB NOT NULL DEFAULT '[]'::jsonb,
    prepared_by                  UUID REFERENCES public.user_profiles(id),
    sealed_sha256                TEXT,
    sealed_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    financial_opening_unlocked_at TIMESTAMPTZ,
    sync_version                 BIGINT NOT NULL DEFAULT 1,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id)
);

-- 6. Modèles DAO-Types Évolutifs à 6 pièces & Points d'Adaptation (Étape 3)
CREATE TABLE IF NOT EXISTS public.dao_templates (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nature            procurement_nature NOT NULL UNIQUE,
    template_code     TEXT NOT NULL,
    version_tag       TEXT NOT NULL,
    legal_basis       TEXT NOT NULL,
    regulatory_params JSONB NOT NULL,
    pieces_schema     JSONB NOT NULL,
    adaptation_points JSONB NOT NULL,
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Activation RLS & Politiques Strictes
ALTER TABLE public.project_maturation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cctp_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confidential_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dao_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_maturation_select ON public.project_maturation_items;
DROP POLICY IF EXISTS p_maturation_write ON public.project_maturation_items;
CREATE POLICY p_maturation_select ON public.project_maturation_items FOR SELECT TO authenticated
USING (public.has_entity_role(entity_id) OR public.is_armp_or_tutelle());
CREATE POLICY p_maturation_write ON public.project_maturation_items FOR ALL TO authenticated
USING (public.has_entity_role(entity_id, ARRAY['MO_MOD', 'SIGAMP', 'CHEF_SERVICE_MARCHE', 'INGENIEUR_MARCHE']::rbac_role[]))
WITH CHECK (public.has_entity_role(entity_id, ARRAY['MO_MOD', 'SIGAMP', 'CHEF_SERVICE_MARCHE', 'INGENIEUR_MARCHE']::rbac_role[]));

DROP POLICY IF EXISTS p_tech_assign_select ON public.technical_assignments;
DROP POLICY IF EXISTS p_tech_assign_write ON public.technical_assignments;
CREATE POLICY p_tech_assign_select ON public.technical_assignments FOR SELECT TO authenticated
USING (public.has_entity_role(entity_id) OR public.is_armp_or_tutelle());
CREATE POLICY p_tech_assign_write ON public.technical_assignments FOR ALL TO authenticated
USING (public.has_entity_role(entity_id, ARRAY['MO_MOD', 'SIGAMP']::rbac_role[]))
WITH CHECK (public.has_entity_role(entity_id, ARRAY['MO_MOD', 'SIGAMP']::rbac_role[]));

DROP POLICY IF EXISTS p_cctp_select ON public.cctp_documents;
DROP POLICY IF EXISTS p_cctp_write ON public.cctp_documents;
CREATE POLICY p_cctp_select ON public.cctp_documents FOR SELECT TO authenticated
USING (public.has_entity_role(entity_id) OR public.is_armp_or_tutelle());
CREATE POLICY p_cctp_write ON public.cctp_documents FOR ALL TO authenticated
USING (public.has_entity_role(entity_id, ARRAY['MO_MOD', 'SIGAMP', 'INGENIEUR_MARCHE', 'CHEF_SERVICE_MARCHE']::rbac_role[]))
WITH CHECK (public.has_entity_role(entity_id, ARRAY['MO_MOD', 'SIGAMP', 'INGENIEUR_MARCHE', 'CHEF_SERVICE_MARCHE']::rbac_role[]));

-- CLOISONNEMENT STRICT DU DEVIS CONFIDENTIEL :
-- Invisible pour CPM, SCA et Soumissionnaires avant l'ouverture financière (financial_opening_unlocked_at IS NOT NULL)
DROP POLICY IF EXISTS p_conf_est_select ON public.confidential_estimates;
DROP POLICY IF EXISTS p_conf_est_write ON public.confidential_estimates;
CREATE POLICY p_conf_est_select ON public.confidential_estimates FOR SELECT TO authenticated
USING (
    public.is_armp_or_tutelle()
    OR public.has_entity_role(
        entity_id,
        ARRAY['MO_MOD', 'SIGAMP', 'INGENIEUR_MARCHE', 'CHEF_SERVICE_MARCHE', 'CONTROLEUR_FINANCIER']::rbac_role[]
    )
    OR (
        financial_opening_unlocked_at IS NOT NULL
        AND public.has_entity_role(
            entity_id,
            ARRAY['CPM_PRESIDENT', 'CPM_SECRETAIRE', 'SCA_RAPPORTEUR']::rbac_role[]
        )
    )
);

CREATE POLICY p_conf_est_write ON public.confidential_estimates FOR ALL TO authenticated
USING (
    public.has_entity_role(
        entity_id,
        ARRAY['MO_MOD', 'SIGAMP', 'INGENIEUR_MARCHE', 'CHEF_SERVICE_MARCHE']::rbac_role[]
    )
)
WITH CHECK (
    public.has_entity_role(
        entity_id,
        ARRAY['MO_MOD', 'SIGAMP', 'INGENIEUR_MARCHE', 'CHEF_SERVICE_MARCHE']::rbac_role[]
    )
);

DROP POLICY IF EXISTS p_dao_templates_select ON public.dao_templates;
CREATE POLICY p_dao_templates_select ON public.dao_templates FOR SELECT TO authenticated
USING (active = TRUE);

-- Fonction RPC sécurisée exposant le total TTC du Devis Confidentiel pour le calcul OAB
CREATE OR REPLACE FUNCTION public.get_confidential_estimate_for_oab(p_project_id UUID)
RETURNS TABLE (
    estimate_ref TEXT,
    total_ttc_fcfa NUMERIC(18, 2),
    unlocked BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row public.confidential_estimates%ROWTYPE;
BEGIN
    SELECT * INTO v_row
    FROM public.confidential_estimates
    WHERE project_id = p_project_id;

    IF v_row.id IS NULL THEN
        RETURN;
    END IF;

    IF public.is_armp_or_tutelle()
       OR public.has_entity_role(
           v_row.entity_id,
           ARRAY['MO_MOD', 'SIGAMP', 'INGENIEUR_MARCHE', 'CHEF_SERVICE_MARCHE']::rbac_role[]
       )
       OR (
           v_row.financial_opening_unlocked_at IS NOT NULL
           AND public.has_entity_role(
               v_row.entity_id,
               ARRAY['CPM_PRESIDENT', 'CPM_SECRETAIRE', 'SCA_RAPPORTEUR']::rbac_role[]
           )
       ) THEN
        RETURN QUERY SELECT v_row.estimate_ref, v_row.total_ttc_fcfa, (v_row.financial_opening_unlocked_at IS NOT NULL);
    ELSE
        RAISE EXCEPTION 'SECRET DU DEVIS CONFIDENTIEL : Consultation interdite avant ouverture des offres financières.';
    END IF;
END;
$$;

-- 8. Peuplement des 4 DAO-Types Évolutifs (Travaux, Fournitures, Services, Prestations Intellectuelles)
INSERT INTO public.dao_templates (nature, template_code, version_tag, legal_basis, regulatory_params, pieces_schema, adaptation_points)
VALUES
(
    'TRAVAUX',
    'DAO-TYPE-ARMP-TR-2026',
    '2026.1',
    'Décret n° 2018/366 (CMP) & Dossiers-Types ARMP Travaux',
    '{"offer_validity_days":90,"standstill_business_days":5,"tva_rate":0.1925,"guarantee_retention_rate":0.10,"bid_bond_rate":0.02,"performance_bond_rate":0.05,"addendum_min_days":7}'::jsonb,
    '["PIECE_1_AAO_BILINGUE","PIECE_2_RPAO","PIECE_3_CCAP","PIECE_4_CCTP","PIECE_5_BPU_DQE","PIECE_6_MODELES_OHADA"]'::jsonb,
    '[{"id":"key_personnel","label":"Qualification du personnel clé de chantier (Conducteur, Chef chantier)"},{"id":"min_equipment","label":"Liste du matériel minimal exigé (bétonnière, compacteur, camion benne)"},{"id":"specific_turnover","label":"Chiffre d’affaires annuel minimum et références similaires"}]'::jsonb
),
(
    'FOURNITURES',
    'DAO-TYPE-ARMP-AG-2026',
    '2026.1',
    'Décret n° 2018/366 (CMP) & Dossiers-Types ARMP Fournitures',
    '{"offer_validity_days":90,"standstill_business_days":5,"tva_rate":0.1925,"guarantee_retention_rate":0.10,"bid_bond_rate":0.015,"performance_bond_rate":0.03,"addendum_min_days":7}'::jsonb,
    '["PIECE_1_AAO_BILINGUE","PIECE_2_RPAO","PIECE_3_CCAP","PIECE_4_CCTP","PIECE_5_BPU_DQE","PIECE_6_MODELES_OHADA"]'::jsonb,
    '[{"id":"delivery_schedule","label":"Délai et lieu exact de livraison / réception technique"},{"id":"manufacturer_auth","label":"Autorisation du fabricant & garantie constructeur"},{"id":"after_sales","label":"Service après-vente et disponibilité des pièces de rechange"}]'::jsonb
),
(
    'SERVICES_QUANTIFIABLES',
    'DAO-TYPE-ARMP-SPI-2026',
    '2026.1',
    'Décret n° 2018/366 (CMP) & Dossiers-Types ARMP Services Quantifiables',
    '{"offer_validity_days":90,"standstill_business_days":5,"tva_rate":0.1925,"guarantee_retention_rate":0.10,"bid_bond_rate":0.015,"performance_bond_rate":0.03,"addendum_min_days":7}'::jsonb,
    '["PIECE_1_AAO_BILINGUE","PIECE_2_RPAO","PIECE_3_CCAP","PIECE_4_CCTP","PIECE_5_BPU_DQE","PIECE_6_MODELES_OHADA"]'::jsonb,
    '[{"id":"sla_metrics","label":"Indicateurs de performance (SLA) et fréquence des prestations"},{"id":"staff_vetting","label":"Effectif minimum déployé et habilitations de sécurité"}]'::jsonb
),
(
    'PRESTATIONS_INTELLECTUELLES',
    'DAO-TYPE-ARMP-PI-2026',
    '2026.1',
    'Décret n° 2018/366 (CMP) & Dossiers-Types ARMP Consultants (ASMI)',
    '{"offer_validity_days":90,"standstill_business_days":5,"tva_rate":0.1925,"guarantee_retention_rate":0.0,"bid_bond_rate":0.0,"performance_bond_rate":0.02,"addendum_min_days":7}'::jsonb,
    '["PIECE_1_AAO_BILINGUE","PIECE_2_RPAO","PIECE_3_CCAP","PIECE_4_CCTP","PIECE_5_BPU_DQE","PIECE_6_MODELES_OHADA"]'::jsonb,
    '[{"id":"methodology_weight","label":"Pondération méthodologie / plan de travail vs expérience des experts"},{"id":"experts_cv","label":"Profils des experts clés (Chef de mission, Experts sectoriels)"}]'::jsonb
)
ON CONFLICT (nature) DO UPDATE SET
    template_code = EXCLUDED.template_code,
    regulatory_params = EXCLUDED.regulatory_params,
    pieces_schema = EXCLUDED.pieces_schema,
    adaptation_points = EXCLUDED.adaptation_points,
    updated_at = NOW();
