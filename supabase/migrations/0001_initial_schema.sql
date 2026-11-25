-- ============================================================================
-- PROGICIEL DE GESTION DE LA COMMANDE PUBLIQUE AU CAMEROUN (ERP LOCAL-FIRST)
-- JALON 1 : SCHEMA POSTGRESQL / SUPABASE COMPLET ET PRET A EXECUTER
-- Socle juridique : Décret 2018/366 (CMP), Loi 2019/024 (CGCTD),
--                   Décrets 2012/074-075-076 & 2013/271 (CPM/MINMAP/ARMP),
--                   Loi 2018/012 (Régime Financier), CGI, Acte Uniforme OHADA.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS REQUISES
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- ----------------------------------------------------------------------------
-- 1. TYPES ENUMERES METIER (DOMAINE CAMEROUNAIS)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE entity_type AS ENUM (
        'MINISTERE',
        'COMMUNE',
        'COMMUNAUTE_URBAINE',
        'REGION',
        'EPA',
        'ENTREPRISE_PUBLIQUE',
        'PROJET_PROGRAMME'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE rbac_role AS ENUM (
        'SUPER_ADMIN',
        'MO_MOD',
        'SIGAMP',
        'CPM_PRESIDENT',
        'CPM_MEMBRE',
        'CPM_SECRETAIRE',
        'SCA_RAPPORTEUR',
        'SCA_MEMBRE',
        'CCCM',
        'ARMP_OBSERVATEUR',
        'ARMP_REGULATEUR',
        'CONTROLEUR_FINANCIER',
        'RECEVEUR_COMPTABLE',
        'INGENIEUR_MARCHE',
        'CHEF_SERVICE_MARCHE',
        'TUTELLE_ETAT',
        'SOUMISSIONNAIRE'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE procurement_nature AS ENUM (
        'TRAVAUX',
        'FOURNITURES',
        'SERVICES_QUANTIFIABLES',
        'PRESTATIONS_INTELLECTUELLES'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE procurement_mode AS ENUM (
        'AONO',         -- Appel d'Offres National Ouvert
        'AOIO',         -- Appel d'Offres International Ouvert
        'AONR',         -- Appel d'Offres National Restreint
        'AOIR',         -- Appel d'Offres International Restreint
        'ASMI',         -- Avis de Sollicitation à Manifestation d'Intérêt
        'DC_COTATION',  -- Demande de Cotation (Lettre-Commande)
        'GRE_A_GRE',    -- Entente Directe (Autorisation spéciale MINMAP requise)
        'REGIE'         -- Exécution en régie
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE commission_type AS ENUM (
        'CIPM',     -- Commission Interne de Passation des Marchés
        'CRPM',     -- Commission Régionale de Passation des Marchés
        'CDPM',     -- Commission Départementale de Passation des Marchés
        'CCCM_TR',  -- Commission Centrale de Contrôle - Travaux
        'CCCM_AG',  -- Commission Centrale de Contrôle - Approvisionnements Généraux
        'CCCM_SPI', -- Commission Centrale de Contrôle - Services & Prestations Intellectuelles
        'CCCM_FC'   -- Commission Centrale de Contrôle - Fournitures & Routes/Autres
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE project_status AS ENUM (
        'MATURATION',
        'PROGRAMME',
        'DAO_EN_COURS',
        'PUBLIE',
        'OUVERTURE_PLIS',
        'ANALYSE_SCA',
        'ATTRIBUE_STANDSTILL',
        'SUSPENDU_CONTENTIEUX',
        'CONTRACTUALISE',
        'EN_EXECUTION',
        'RECEPTION_PROVISOIRE',
        'RECEPTION_DEFINITIVE',
        'RESILIE',
        'INFRUCTUEUX',
        'ANNULE'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE fiscal_regime AS ENUM (
        'REEL',                 -- Acompte IR 2,2%
        'SIMPLIFIE',            -- Acompte IR 5,5%
        'LIBERATOIRE',          -- Acompte IR 5,5% (ou défaut attestation)
        'ETRANGER_NON_RESIDENT' -- TSR 15%
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE indemnity_trigger_event AS ENUM (
        'VALIDATION_DAO',
        'OUVERTURE_PLIS',
        'ADOPTION_RAPPORT_SCA',
        'EXAMEN_AVENANT',
        'SUIVI_EXECUTION_DECOMPTE',
        'INSTRUCTION_CONTENTIEUX',
        'RECEPTION_PROVISOIRE',
        'RECEPTION_DEFINITIVE',
        'MISSION_TERRAIN'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE dispute_stage AS ENUM (
        'PRE_OUVERTURE',
        'OUVERTURE_PLIS',
        'ATTRIBUTION',
        'EXECUTION',
        'RESILIATION'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE dispute_status AS ENUM (
        'DEPOSE',
        'EN_VERIFICATION_RECEVABILITE',
        'FORCLOS_REJETE',
        'SUSPENDU_INSTRUCTION',
        'TRANSMIS_ARMP',
        'DECISION_RENDUE',
        'CONCILIATION',
        'CONTENTIEUX_JURIDICTIONNEL',
        'CLOTURE'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 2. FONCTIONS UTILITAIRES DE MISE A JOUR & HORODATAGE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    IF NEW.sync_version IS NOT NULL THEN
        NEW.sync_version = OLD.sync_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. ORGANISATION MULTI-ENTITES, UTILISATEURS & RBAC
-- ----------------------------------------------------------------------------
CREATE TABLE public.entities (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                    TEXT NOT NULL UNIQUE,
    name                    TEXT NOT NULL,
    short_name              TEXT,
    type                    entity_type NOT NULL,
    region                  TEXT NOT NULL,
    department              TEXT,
    municipality            TEXT,
    tutelle_authority       TEXT, -- Préfet / Gouverneur pour les CTD, Ministre de tutelle pour EPA
    tax_withholding_enabled BOOLEAN NOT NULL DEFAULT TRUE, -- Habilitation retenue à la source TVA/IR
    niu                     TEXT,
    address                 TEXT,
    phone                   TEXT,
    email                   TEXT,
    logo_url                TEXT,
    active                  BOOLEAN NOT NULL DEFAULT TRUE,
    sync_version            BIGINT NOT NULL DEFAULT 1,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.user_profiles (
    id                      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name               TEXT NOT NULL,
    matricule               TEXT,
    grade_title             TEXT,
    is_public_agent         BOOLEAN NOT NULL DEFAULT TRUE,
    niu                     TEXT,
    phone                   TEXT,
    email                   TEXT,
    bank_rib                TEXT,
    mobile_money_number     TEXT,
    preferred_payout_channel TEXT DEFAULT 'VIREMENT' CHECK (preferred_payout_channel IN ('VIREMENT', 'MOBILE_MONEY', 'TRESOR')),
    active                  BOOLEAN NOT NULL DEFAULT TRUE,
    sync_version            BIGINT NOT NULL DEFAULT 1,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.commissions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id               UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    code                    TEXT NOT NULL,
    name                    TEXT NOT NULL,
    type                    commission_type NOT NULL,
    nomination_decree_ref   TEXT,
    competence_min_fcfa     NUMERIC(18, 2) NOT NULL DEFAULT 0,
    competence_max_fcfa     NUMERIC(18, 2), -- NULL = illimité (ex: CCCM)
    active                  BOOLEAN NOT NULL DEFAULT TRUE,
    sync_version            BIGINT NOT NULL DEFAULT 1,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entity_id, code)
);

CREATE TABLE public.entity_memberships (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    entity_id               UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    role                    rbac_role NOT NULL,
    commission_id           UUID REFERENCES public.commissions(id) ON DELETE SET NULL,
    appointment_act_ref     TEXT,
    valid_from              DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until             DATE,
    active                  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, entity_id, role)
);

CREATE TABLE public.suppliers (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id               UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    company_name                TEXT NOT NULL,
    rccm_number                 TEXT NOT NULL UNIQUE,
    niu_number                  TEXT NOT NULL UNIQUE,
    fiscal_regime               fiscal_regime NOT NULL DEFAULT 'REEL',
    has_valid_non_redevance     BOOLEAN NOT NULL DEFAULT FALSE,
    non_redevance_expires_at    DATE,
    cnps_number                 TEXT,
    cnps_expires_at             DATE,
    non_bankruptcy_expires_at   DATE,
    is_armp_excluded            BOOLEAN NOT NULL DEFAULT FALSE,
    armp_exclusion_decision_ref TEXT,
    armp_exclusion_until        DATE,
    address                     TEXT,
    city                        TEXT,
    phone                       TEXT,
    email                       TEXT,
    sync_version                BIGINT NOT NULL DEFAULT 1,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.budget_lines (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id               UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    fiscal_year             INTEGER NOT NULL CHECK (fiscal_year BETWEEN 2020 AND 2100),
    budget_source           TEXT NOT NULL DEFAULT 'BIP', -- BIP, BUDGET_COMMUNAL, DGD, FINEX, FONDS_PROPRES
    chapitre                TEXT NOT NULL,
    article                 TEXT NOT NULL,
    paragraphe              TEXT,
    label                   TEXT NOT NULL,
    is_indemnity_line       BOOLEAN NOT NULL DEFAULT FALSE,
    initial_allocation_fcfa NUMERIC(18, 2) NOT NULL CHECK (initial_allocation_fcfa >= 0),
    committed_fcfa          NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (committed_fcfa >= 0),
    paid_fcfa               NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (paid_fcfa >= 0),
    sync_version            BIGINT NOT NULL DEFAULT 1,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entity_id, fiscal_year, chapitre, article, paragraphe)
);

-- ----------------------------------------------------------------------------
-- 4. CYCLE DE VIE DE LA COMMANDE PUBLIQUE
-- ----------------------------------------------------------------------------

-- 4.1 Journal des Projets & Maturation (Circulaire 001/CAB/PM)
CREATE TABLE public.projects (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id                   UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    budget_line_id              UUID NOT NULL REFERENCES public.budget_lines(id) ON DELETE RESTRICT,
    commission_id               UUID REFERENCES public.commissions(id) ON DELETE RESTRICT,
    fiscal_year                 INTEGER NOT NULL,
    reference_code              TEXT NOT NULL,
    title                       TEXT NOT NULL,
    description                 TEXT,
    location_locality           TEXT,
    nature                      procurement_nature NOT NULL,
    mode                        procurement_mode NOT NULL,
    estimated_amount_ht         NUMERIC(18, 2) NOT NULL CHECK (estimated_amount_ht > 0),
    estimated_amount_ttc        NUMERIC(18, 2) NOT NULL CHECK (estimated_amount_ttc >= estimated_amount_ht),
    -- Critères bloquants de maturation
    has_apd_studies             BOOLEAN NOT NULL DEFAULT FALSE,
    has_tdr                     BOOLEAN NOT NULL DEFAULT FALSE,
    has_dqe_mercuriale          BOOLEAN NOT NULL DEFAULT FALSE,
    has_land_availability       BOOLEAN NOT NULL DEFAULT FALSE,
    maturation_docs             JSONB NOT NULL DEFAULT '[]'::JSONB,
    maturation_validated_by     UUID REFERENCES public.user_profiles(id),
    maturation_validated_at     TIMESTAMPTZ,
    planned_launch_date         DATE,
    planned_award_date          DATE,
    status                      project_status NOT NULL DEFAULT 'MATURATION',
    created_by                  UUID REFERENCES public.user_profiles(id),
    sync_version                BIGINT NOT NULL DEFAULT 1,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entity_id, reference_code)
);

-- Verrou bloquant de maturation avant publication DAO (Circulaire 001/CAB/PM)
CREATE OR REPLACE FUNCTION public.enforce_project_maturation_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status IN ('PUBLIE', 'OUVERTURE_PLIS', 'ANALYSE_SCA', 'ATTRIBUE_STANDSTILL', 'CONTRACTUALISE', 'EN_EXECUTION') THEN
        IF NOT (NEW.has_apd_studies AND NEW.has_tdr AND NEW.has_dqe_mercuriale AND NEW.has_land_availability AND NEW.maturation_validated_at IS NOT NULL) THEN
            RAISE EXCEPTION 'VERROU MATURATION (Circulaire 001/CAB/PM) : Impossible de publier ou lancer la procédure sans validation complète des études préalables, TDR, DQE mercuriale et disponibilité foncière.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_projects_maturation_gate
BEFORE INSERT OR UPDATE OF status ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.enforce_project_maturation_gate();

-- 4.2 Dossiers d'Appel d'Offres (DAO / DC) & Gré à Gré
CREATE TABLE public.tender_files (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id                   UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    project_id                  UUID NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
    dao_number                  TEXT NOT NULL,
    lot_count                   INTEGER NOT NULL DEFAULT 1 CHECK (lot_count >= 1),
    lots_metadata               JSONB NOT NULL DEFAULT '[]'::JSONB,
    aao_fr                      TEXT NOT NULL,
    aao_en                      TEXT NOT NULL, -- Bilinguisme obligatoire Cameroun
    rpao_data                   JSONB NOT NULL DEFAULT '{}'::JSONB,
    ccap_data                   JSONB NOT NULL DEFAULT '{}'::JSONB,
    cctp_data                   JSONB NOT NULL DEFAULT '{}'::JSONB,
    bpu_dqe_data                JSONB NOT NULL DEFAULT '{}'::JSONB,
    dao_price_fcfa              NUMERIC(14, 2) NOT NULL DEFAULT 0,
    published_at                TIMESTAMPTZ,
    submission_deadline         TIMESTAMPTZ NOT NULL,
    opening_datetime            TIMESTAMPTZ NOT NULL,
    standstill_days             INTEGER NOT NULL DEFAULT 5 CHECK (standstill_days >= 5),
    cpm_validated_at            TIMESTAMPTZ,
    cccm_opinion_ref            TEXT,
    cccm_opinion_date           DATE,
    -- Verrou spécifique Gré à Gré (CMP)
    gre_a_gre_minmap_auth_no    TEXT,
    gre_a_gre_minmap_auth_date  DATE,
    gre_a_gre_legal_basis       TEXT,
    gre_a_gre_auth_doc_url      TEXT,
    coleps_reference            TEXT,
    pdf_storage_path            TEXT,
    sha256_seal                 TEXT,
    sync_version                BIGINT NOT NULL DEFAULT 1,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entity_id, dao_number),
    CHECK (opening_datetime >= submission_deadline)
);

CREATE OR REPLACE FUNCTION public.enforce_gre_a_gre_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_mode procurement_mode;
BEGIN
    SELECT mode INTO v_mode FROM public.projects WHERE id = NEW.project_id;
    IF v_mode = 'GRE_A_GRE' THEN
        IF NEW.gre_a_gre_minmap_auth_no IS NULL OR length(trim(NEW.gre_a_gre_minmap_auth_no)) = 0 OR NEW.gre_a_gre_legal_basis IS NULL THEN
            RAISE EXCEPTION 'VERROU GRE A GRE (CMP) : L''autorisation préalable spéciale du MINMAP (numéro et motif légal) est obligatoire pour toute procédure d''entente directe.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tender_files_gre_a_gre
BEFORE INSERT OR UPDATE ON public.tender_files
FOR EACH ROW EXECUTE FUNCTION public.enforce_gre_a_gre_auth();

-- 4.3 Additifs au DAO & Prorogation automatique des délais
CREATE TABLE public.tender_addenda (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id               UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    tender_file_id          UUID NOT NULL REFERENCES public.tender_files(id) ON DELETE CASCADE,
    addendum_number         INTEGER NOT NULL CHECK (addendum_number >= 1),
    subject                 TEXT NOT NULL,
    modifies_substantially  BOOLEAN NOT NULL DEFAULT FALSE,
    issued_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    previous_deadline       TIMESTAMPTZ NOT NULL,
    new_submission_deadline TIMESTAMPTZ NOT NULL,
    extension_notice_url    TEXT,
    created_by              UUID REFERENCES public.user_profiles(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tender_file_id, addendum_number)
);

CREATE OR REPLACE FUNCTION public.enforce_addendum_deadline_extension()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_deadline TIMESTAMPTZ;
BEGIN
    SELECT submission_deadline INTO v_current_deadline
    FROM public.tender_files WHERE id = NEW.tender_file_id;

    NEW.previous_deadline := v_current_deadline;

    IF NEW.modifies_substantially OR (v_current_deadline - NEW.issued_at) < INTERVAL '7 days' THEN
        IF NEW.new_submission_deadline < (NEW.issued_at + INTERVAL '7 days') THEN
            RAISE EXCEPTION 'REGLE ADDITIF DAO : Un additif substantiel ou émis à moins de 7 jours de la date limite impose une prorogation d''au moins 7 jours.';
        END IF;
        UPDATE public.tender_files
        SET submission_deadline = NEW.new_submission_deadline,
            opening_datetime = GREATEST(opening_datetime, NEW.new_submission_deadline)
        WHERE id = NEW.tender_file_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tender_addenda_extension
BEFORE INSERT ON public.tender_addenda
FOR EACH ROW EXECUTE FUNCTION public.enforce_addendum_deadline_extension();

-- 4.4 Offres / Soumissions & Détection OAB
CREATE TABLE public.bids (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id                       UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    tender_file_id                  UUID NOT NULL REFERENCES public.tender_files(id) ON DELETE CASCADE,
    supplier_id                     UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    lot_number                      INTEGER NOT NULL DEFAULT 1,
    submitted_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_late                         BOOLEAN NOT NULL DEFAULT FALSE,
    -- Dossier administratif
    admin_docs                      JSONB NOT NULL DEFAULT '{}'::JSONB,
    bid_bond_amount_fcfa            NUMERIC(18, 2),
    bid_bond_bank                   TEXT,
    admin_eliminated                BOOLEAN NOT NULL DEFAULT FALSE,
    elimination_reasons             TEXT[] NOT NULL DEFAULT '{}',
    -- Evaluation technique
    tech_score                      NUMERIC(5, 2) CHECK (tech_score BETWEEN 0 AND 100),
    tech_passed                     BOOLEAN,
    tech_validated_at               TIMESTAMPTZ,
    -- Offre financière (isolée par RLS avant validation technique)
    financial_amount_ht             NUMERIC(18, 2) CHECK (financial_amount_ht >= 0),
    financial_amount_ttc            NUMERIC(18, 2) CHECK (financial_amount_ttc >= 0),
    corrected_financial_ttc         NUMERIC(18, 2),
    is_oab_suspected                BOOLEAN NOT NULL DEFAULT FALSE,
    oab_threshold_ratio             NUMERIC(6, 4),
    oab_justification_requested_at  TIMESTAMPTZ,
    oab_justification_accepted      BOOLEAN,
    is_awarded                      BOOLEAN NOT NULL DEFAULT FALSE,
    storage_path                    TEXT,
    sync_version                    BIGINT NOT NULL DEFAULT 1,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tender_file_id, supplier_id, lot_number)
);

CREATE OR REPLACE FUNCTION public.check_supplier_eligibility_on_bid()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_excluded BOOLEAN;
    v_until DATE;
    v_deadline TIMESTAMPTZ;
BEGIN
    SELECT is_armp_excluded, armp_exclusion_until INTO v_excluded, v_until
    FROM public.suppliers WHERE id = NEW.supplier_id;

    IF v_excluded AND (v_until IS NULL OR v_until >= CURRENT_DATE) THEN
        RAISE EXCEPTION 'BLOCAGE ARMP : Ce soumissionnaire figure sur la liste des entreprises exclues de la commande publique (jusqu''au %).', COALESCE(v_until::TEXT, 'nouvel ordre');
    END IF;

    SELECT submission_deadline INTO v_deadline FROM public.tender_files WHERE id = NEW.tender_file_id;
    IF NEW.submitted_at > v_deadline THEN
        NEW.is_late := TRUE;
        NEW.admin_eliminated := TRUE;
        NEW.elimination_reasons := array_append(NEW.elimination_reasons, 'Pli déposé hors délai réglementaire');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bids_eligibility
BEFORE INSERT ON public.bids
FOR EACH ROW EXECUTE FUNCTION public.check_supplier_eligibility_on_bid();

-- 4.5 Grilles et Rapports d'Analyse SCA
CREATE TABLE public.sca_evaluations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id               UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    tender_file_id          UUID NOT NULL REFERENCES public.tender_files(id) ON DELETE CASCADE,
    bid_id                  UUID NOT NULL REFERENCES public.bids(id) ON DELETE CASCADE,
    evaluator_id            UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    phase                   TEXT NOT NULL CHECK (phase IN ('ADMIN', 'TECH', 'FIN')),
    criteria_scores         JSONB NOT NULL DEFAULT '{}'::JSONB,
    computed_score          NUMERIC(5, 2),
    passed                  BOOLEAN,
    remarks                 TEXT,
    signed_at               TIMESTAMPTZ,
    sync_version            BIGINT NOT NULL DEFAULT 1,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bid_id, evaluator_id, phase)
);

-- 4.6 Décisions d'Attribution & Standstill
CREATE TABLE public.awards (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id               UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    project_id              UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    tender_file_id          UUID NOT NULL REFERENCES public.tender_files(id) ON DELETE CASCADE,
    lot_number              INTEGER NOT NULL DEFAULT 1,
    winning_bid_id          UUID REFERENCES public.bids(id) ON DELETE RESTRICT,
    award_decision_number   TEXT NOT NULL,
    award_amount_ht         NUMERIC(18, 2),
    award_amount_ttc        NUMERIC(18, 2),
    is_infructueux          BOOLEAN NOT NULL DEFAULT FALSE,
    infructueux_reason      TEXT,
    cpm_proposal_date       DATE NOT NULL,
    cccm_conforme_ref       TEXT,
    publication_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    standstill_end_date     TIMESTAMPTZ NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'PROVISOIRE'
                            CHECK (status IN ('PROVISOIRE', 'SUSPENDU_RECOURS', 'DEFINITIF', 'ANNULE', 'INFRUCTUEUX')),
    sync_version            BIGINT NOT NULL DEFAULT 1,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tender_file_id, lot_number)
);

-- 4.7 Contrats (Marchés & Lettres-Commandes)
CREATE TABLE public.contracts (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id                   UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    project_id                  UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
    award_id                    UUID UNIQUE REFERENCES public.awards(id) ON DELETE RESTRICT,
    supplier_id                 UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    contract_number             TEXT NOT NULL,
    contract_type               TEXT NOT NULL CHECK (contract_type IN ('MARCHE', 'LETTRE_COMMANDE', 'BON_COMMANDE')),
    initial_amount_ht           NUMERIC(18, 2) NOT NULL CHECK (initial_amount_ht > 0),
    tva_rate                    NUMERIC(6, 4) NOT NULL DEFAULT 0.1925,
    ir_rate                     NUMERIC(6, 4) NOT NULL DEFAULT 0.0220, -- 2,2% ou 5,5%
    tsr_rate                    NUMERIC(6, 4) NOT NULL DEFAULT 0.0000, -- 15% si prestataire non-résident
    registration_duty_rate      NUMERIC(6, 4) NOT NULL DEFAULT 0.0200, -- 2% droits d'enregistrement
    initial_amount_ttc          NUMERIC(18, 2) NOT NULL,
    guarantee_retention_rate    NUMERIC(6, 4) NOT NULL DEFAULT 0.1000, -- 10% retenue de garantie
    start_advance_max_rate      NUMERIC(6, 4) NOT NULL DEFAULT 0.2000, -- Avance de démarrage (20% max)
    execution_duration_days     INTEGER NOT NULL CHECK (execution_duration_days > 0),
    warranty_duration_months    INTEGER NOT NULL DEFAULT 12 CHECK (warranty_duration_months >= 0),
    cf_visa_number              TEXT,
    cf_visa_date                DATE,
    tutelle_visa_ref            TEXT,
    tutelle_visa_date           DATE,
    signed_by_mo_at             TIMESTAMPTZ,
    notified_at                 TIMESTAMPTZ,
    registered_tax_at           DATE,
    status                      TEXT NOT NULL DEFAULT 'EN_SIGNATURE'
                                CHECK (status IN ('EN_SIGNATURE', 'SIGNE_NOTIFIE', 'EN_COURS', 'AJOURNE', 'RECEPTION_PROVISOIRE', 'CLOTURE', 'RESILIE')),
    sha256_seal                 TEXT,
    sync_version                BIGINT NOT NULL DEFAULT 1,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entity_id, contract_number)
);

-- 4.8 Sûretés OHADA & Assurances
CREATE TABLE public.securities (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id               UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    contract_id             UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
    bid_id                  UUID REFERENCES public.bids(id) ON DELETE CASCADE,
    security_type           TEXT NOT NULL CHECK (security_type IN (
        'CAUTION_SOUMISSION', 'CAUTION_BONNE_EXECUTION', 'CAUTION_AVANCE_DEMARRAGE',
        'CAUTION_RETENUE_GARANTIE', 'ASSURANCE_TRC_RC'
    )),
    issuer_institution      TEXT NOT NULL,
    reference_number        TEXT NOT NULL,
    amount_fcfa             NUMERIC(18, 2) NOT NULL CHECK (amount_fcfa > 0),
    ohada_first_demand      BOOLEAN NOT NULL DEFAULT TRUE,
    issue_date              DATE NOT NULL,
    expiry_date             DATE NOT NULL,
    released_at             DATE,
    confiscated             BOOLEAN NOT NULL DEFAULT FALSE,
    document_url            TEXT,
    sync_version            BIGINT NOT NULL DEFAULT 1,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (contract_id IS NOT NULL OR bid_id IS NOT NULL)
);

-- 4.9 Ordres de Service (OS)
CREATE TABLE public.service_orders (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id               UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    contract_id             UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    os_number               TEXT NOT NULL,
    os_type                 TEXT NOT NULL CHECK (os_type IN (
        'DEMARRAGE', 'ARRET', 'REPRISE', 'TECHNIQUE', 'MISE_EN_DEMEURE', 'NOTIFICATION_AVENANT'
    )),
    subject                 TEXT NOT NULL,
    content_summary         TEXT NOT NULL,
    issued_date             DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_date          DATE,
    weather_excused_days    INTEGER NOT NULL DEFAULT 0 CHECK (weather_excused_days >= 0),
    grace_period_days       INTEGER,
    signed_by_mo_at         TIMESTAMPTZ,
    acknowledged_by_titulaire_at TIMESTAMPTZ,
    sha256_seal             TEXT,
    sync_version            BIGINT NOT NULL DEFAULT 1,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (contract_id, os_number)
);

-- 4.10 Décomptes & Fiscalité Camerounaise (TVA 19,25%, AIR 2,2%/5,5%, TSR 15%, Retenue 10%)
CREATE TABLE public.decomptes (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id                   UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    contract_id                 UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    decompte_number             INTEGER NOT NULL CHECK (decompte_number >= 1),
    is_final                    BOOLEAN NOT NULL DEFAULT FALSE,
    attachement_ref             TEXT NOT NULL,
    period_start                DATE,
    period_end                  DATE,
    gross_amount_ht             NUMERIC(18, 2) NOT NULL CHECK (gross_amount_ht >= 0),
    advance_repayment_fcfa      NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (advance_repayment_fcfa >= 0),
    guarantee_retention_fcfa    NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (guarantee_retention_fcfa >= 0),
    penalty_days                INTEGER NOT NULL DEFAULT 0 CHECK (penalty_days >= 0),
    penalty_amount_fcfa         NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (penalty_amount_fcfa >= 0),
    net_ht_base                 NUMERIC(18, 2) NOT NULL,
    tva_amount_fcfa             NUMERIC(18, 2) NOT NULL,
    tva_withheld_at_source      BOOLEAN NOT NULL DEFAULT TRUE,
    ir_air_amount_fcfa          NUMERIC(18, 2) NOT NULL DEFAULT 0,
    tsr_amount_fcfa             NUMERIC(18, 2) NOT NULL DEFAULT 0,
    net_payable_supplier_fcfa   NUMERIC(18, 2) NOT NULL,
    treasury_reversement_fcfa   NUMERIC(18, 2) NOT NULL,
    validated_by_engineer_at    TIMESTAMPTZ,
    cf_visa_number              TEXT,
    cf_visa_at                  TIMESTAMPTZ,
    paid_by_treasury_at         TIMESTAMPTZ,
    status                      TEXT NOT NULL DEFAULT 'BROUILLON'
                                CHECK (status IN ('BROUILLON', 'VALIDE_INGENIEUR', 'VISA_CF', 'MANDATE', 'PAYE', 'REJETE')),
    sha256_seal                 TEXT,
    sync_version                BIGINT NOT NULL DEFAULT 1,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (contract_id, decompte_number)
);

-- 4.11 Avenants avec Verrou Plafond Légal des 30% (CMP)
CREATE TABLE public.amendments (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id                   UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    contract_id                 UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    amendment_number            INTEGER NOT NULL CHECK (amendment_number >= 1),
    subject                     TEXT NOT NULL,
    technical_justification     TEXT NOT NULL,
    amount_delta_ht             NUMERIC(18, 2) NOT NULL,
    amount_delta_ttc            NUMERIC(18, 2) NOT NULL,
    duration_delta_days         INTEGER NOT NULL DEFAULT 0,
    cumulative_delta_ht         NUMERIC(18, 2) NOT NULL DEFAULT 0,
    cumulative_pct              NUMERIC(7, 4) NOT NULL DEFAULT 0,
    requires_minmap_derogation  BOOLEAN NOT NULL DEFAULT FALSE,
    minmap_derogation_ref       TEXT,
    minmap_derogation_date      DATE,
    cpm_cccm_opinion_ref        TEXT,
    cf_visa_ref                 TEXT,
    signed_at                   TIMESTAMPTZ,
    status                      TEXT NOT NULL DEFAULT 'PROJET'
                                CHECK (status IN ('PROJET', 'AVIS_CPM_CCCM', 'DEROGATION_MINMAP', 'VISA_CF', 'SIGNE', 'REJETE')),
    sync_version                BIGINT NOT NULL DEFAULT 1,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (contract_id, amendment_number)
);

-- Trigger bloquant le dépassement du plafond des 30% sans dérogation MINMAP
CREATE OR REPLACE FUNCTION public.enforce_amendment_30pct_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_initial_ht NUMERIC(18, 2);
    v_prev_delta_ht NUMERIC(18, 2);
    v_cumul_ht NUMERIC(18, 2);
    v_cumul_pct NUMERIC(7, 4);
BEGIN
    SELECT initial_amount_ht INTO v_initial_ht FROM public.contracts WHERE id = NEW.contract_id;
    SELECT COALESCE(SUM(amount_delta_ht), 0) INTO v_prev_delta_ht
    FROM public.amendments
    WHERE contract_id = NEW.contract_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
      AND status <> 'REJETE';

    v_cumul_ht := v_prev_delta_ht + NEW.amount_delta_ht;
    v_cumul_pct := ROUND((v_cumul_ht / v_initial_ht) * 100.0, 4);

    NEW.cumulative_delta_ht := v_cumul_ht;
    NEW.cumulative_pct := v_cumul_pct;
    NEW.requires_minmap_derogation := (v_cumul_pct > 30.0000);

    IF NEW.status IN ('VISA_CF', 'SIGNE') THEN
        IF NEW.cpm_cccm_opinion_ref IS NULL THEN
            RAISE EXCEPTION 'VERROU AVENANT (CMP) : L''avis préalable de la CPM/CCCM compétente est obligatoire avant visa ou signature.';
        END IF;
        IF NEW.requires_minmap_derogation AND (NEW.minmap_derogation_ref IS NULL OR length(trim(NEW.minmap_derogation_ref)) = 0) THEN
            RAISE EXCEPTION 'VERROU PLAFOND 30%% (CMP) : Le cumul des avenants atteint % %%, dépassant le plafond légal de 30%%. Une dérogation expresse de l''ACMP (MINMAP) est obligatoire.', v_cumul_pct;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_amendments_30pct_cap
BEFORE INSERT OR UPDATE ON public.amendments
FOR EACH ROW EXECUTE FUNCTION public.enforce_amendment_30pct_cap();

-- 4.12 Résiliations & Sanctions
CREATE TABLE public.terminations (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id                   UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    contract_id                 UUID NOT NULL UNIQUE REFERENCES public.contracts(id) ON DELETE CASCADE,
    termination_type            TEXT NOT NULL CHECK (termination_type IN ('FAUTE_TITULAIRE', 'FORCE_MAJEURE', 'INTERET_GENERAL', 'ARRET_PROLONGE_30J')),
    mise_en_demeure_os_id       UUID REFERENCES public.service_orders(id),
    mise_en_demeure_sent_at     DATE,
    grace_period_days           INTEGER DEFAULT 15,
    decision_number             TEXT NOT NULL,
    decision_date               DATE NOT NULL,
    penalty_capped_10pct_fcfa   NUMERIC(18, 2) DEFAULT 0,
    securities_confiscated      BOOLEAN NOT NULL DEFAULT FALSE,
    transmitted_to_armp_at      TIMESTAMPTZ,
    armp_sanction_ref           TEXT,
    sync_version                BIGINT NOT NULL DEFAULT 1,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.13 Réceptions Provisoires et Définitives
CREATE TABLE public.receptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id               UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    contract_id             UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    reception_type          TEXT NOT NULL CHECK (reception_type IN ('PROVISOIRE', 'DEFINITIVE')),
    scheduled_date          DATE NOT NULL,
    actual_date             DATE,
    pv_number               TEXT,
    has_reserves            BOOLEAN NOT NULL DEFAULT FALSE,
    reserves_details        JSONB NOT NULL DEFAULT '[]'::JSONB,
    reserves_deadline_date  DATE,
    reserves_lifted_at      DATE,
    guarantee_released      BOOLEAN NOT NULL DEFAULT FALSE,
    pv_signed_at            TIMESTAMPTZ,
    sha256_seal             TEXT,
    sync_version            BIGINT NOT NULL DEFAULT 1,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (contract_id, reception_type)
);

-- ----------------------------------------------------------------------------
-- 5. MOTEUR DE CALCUL AUTOMATIQUE DES INDEMNITES & PRIMES
--    (SIGAMP, CIPM/CRPM/CDPM, SCA, Réception, Observateurs ARMP, Missions)
-- ----------------------------------------------------------------------------
CREATE TABLE public.indemnity_scales (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id                       UUID REFERENCES public.entities(id) ON DELETE CASCADE, -- NULL = barème national de référence
    fiscal_year                     INTEGER NOT NULL,
    scale_name                      TEXT NOT NULL,
    legal_reference                 TEXT NOT NULL, -- Ex: Décret 2013/271, Arrêté MINMAP/MINFI, Délibération CTD
    commission_type                 commission_type, -- NULL si applicable à tous ou SIGAMP/Réception
    role_code                       rbac_role NOT NULL,
    trigger_event                   indemnity_trigger_event NOT NULL,
    procurement_mode                procurement_mode, -- NULL = tous modes
    contract_amount_min_fcfa        NUMERIC(18, 2) NOT NULL DEFAULT 0,
    contract_amount_max_fcfa        NUMERIC(18, 2),
    -- Paramètres financiers du barème
    base_amount_fcfa                NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (base_amount_fcfa >= 0),
    per_lot_bonus_fcfa              NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (per_lot_bonus_fcfa >= 0),
    per_bid_bonus_fcfa              NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (per_bid_bonus_fcfa >= 0),
    daily_mission_allowance_fcfa    NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (daily_mission_allowance_fcfa >= 0),
    transport_rate_per_km_fcfa      NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (transport_rate_per_km_fcfa >= 0),
    tax_withholding_rate            NUMERIC(6, 4) NOT NULL DEFAULT 0.0000 CHECK (tax_withholding_rate BETWEEN 0 AND 0.5),
    session_cap_fcfa                NUMERIC(14, 2),
    monthly_cap_fcfa                NUMERIC(14, 2),
    annual_cap_fcfa                 NUMERIC(14, 2),
    active                          BOOLEAN NOT NULL DEFAULT TRUE,
    sync_version                    BIGINT NOT NULL DEFAULT 1,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.session_attendances (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id               UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    project_id              UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    tender_file_id          UUID REFERENCES public.tender_files(id) ON DELETE CASCADE,
    reception_id            UUID REFERENCES public.receptions(id) ON DELETE CASCADE,
    trigger_event           indemnity_trigger_event NOT NULL,
    session_ref             TEXT NOT NULL,
    session_date            DATE NOT NULL,
    location                TEXT,
    distance_km             NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (distance_km >= 0),
    mission_days            INTEGER NOT NULL DEFAULT 0 CHECK (mission_days >= 0),
    user_id                 UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    role_code               rbac_role NOT NULL,
    is_present              BOOLEAN NOT NULL DEFAULT TRUE,
    emargement_mode         TEXT NOT NULL DEFAULT 'NUMERIQUE' CHECK (emargement_mode IN ('NUMERIQUE', 'SCAN_FEUILLE_PRESENCE')),
    signed_at               TIMESTAMPTZ,
    signature_hash          TEXT,
    sync_version            BIGINT NOT NULL DEFAULT 1,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entity_id, session_ref, user_id, role_code)
);

CREATE TABLE public.indemnity_liquidations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id               UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    fiscal_year             INTEGER NOT NULL,
    budget_line_id          UUID NOT NULL REFERENCES public.budget_lines(id) ON DELETE RESTRICT,
    project_id              UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    liquidation_number      TEXT NOT NULL,
    period_label            TEXT NOT NULL,
    trigger_event           indemnity_trigger_event NOT NULL,
    total_gross_fcfa        NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_withholding_fcfa  NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_net_fcfa          NUMERIC(18, 2) NOT NULL DEFAULT 0,
    status                  TEXT NOT NULL DEFAULT 'BROUILLON'
                            CHECK (status IN ('BROUILLON', 'SOUMIS_MO', 'VALIDE_MO', 'VISA_CF', 'MANDATE', 'PAYE', 'REJETE')),
    mo_validated_by         UUID REFERENCES public.user_profiles(id),
    mo_validated_at         TIMESTAMPTZ,
    cf_visa_number          TEXT,
    cf_visa_at              TIMESTAMPTZ,
    paid_at                 TIMESTAMPTZ,
    sha256_seal             TEXT,
    pdf_storage_path        TEXT,
    sync_version            BIGINT NOT NULL DEFAULT 1,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entity_id, liquidation_number)
);

CREATE TABLE public.indemnity_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id               UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    liquidation_id          UUID NOT NULL REFERENCES public.indemnity_liquidations(id) ON DELETE CASCADE,
    attendance_id           UUID REFERENCES public.session_attendances(id) ON DELETE RESTRICT,
    beneficiary_id          UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    role_code               rbac_role NOT NULL,
    scale_id                UUID NOT NULL REFERENCES public.indemnity_scales(id) ON DELETE RESTRICT,
    lots_count              INTEGER NOT NULL DEFAULT 1,
    bids_count              INTEGER NOT NULL DEFAULT 0,
    mission_days            INTEGER NOT NULL DEFAULT 0,
    distance_km             NUMERIC(8, 2) NOT NULL DEFAULT 0,
    calculation_breakdown   JSONB NOT NULL DEFAULT '{}'::JSONB,
    gross_amount_fcfa       NUMERIC(14, 2) NOT NULL CHECK (gross_amount_fcfa >= 0),
    withholding_fcfa        NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (withholding_fcfa >= 0),
    net_amount_fcfa         NUMERIC(14, 2) NOT NULL CHECK (net_amount_fcfa >= 0),
    cap_exceeded_warning    BOOLEAN NOT NULL DEFAULT FALSE,
    cap_warning_details     TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Garde-fou : seuls les acteurs émargés présents peuvent être liquidés pour une session
CREATE OR REPLACE FUNCTION public.enforce_attendance_presence_for_indemnity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_present BOOLEAN;
BEGIN
    IF NEW.attendance_id IS NOT NULL THEN
        SELECT is_present INTO v_present FROM public.session_attendances WHERE id = NEW.attendance_id;
        IF NOT COALESCE(v_present, FALSE) THEN
            RAISE EXCEPTION 'REGLE INDEMNITE : Impossible de liquider une indemnité pour un membre absent sur la feuille de présence.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_indemnity_presence_check
BEFORE INSERT OR UPDATE ON public.indemnity_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_presence_for_indemnity();

-- Garde-fou budgétaire avant Visa CF sur une liquidation d'indemnités
CREATE OR REPLACE FUNCTION public.enforce_indemnity_budget_availability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_alloc NUMERIC(18, 2);
    v_committed NUMERIC(18, 2);
BEGIN
    IF NEW.status IN ('VISA_CF', 'MANDATE', 'PAYE') AND OLD.status NOT IN ('VISA_CF', 'MANDATE', 'PAYE') THEN
        SELECT initial_allocation_fcfa, committed_fcfa INTO v_alloc, v_committed
        FROM public.budget_lines WHERE id = NEW.budget_line_id FOR UPDATE;

        IF (v_committed + NEW.total_gross_fcfa) > v_alloc THEN
            RAISE EXCEPTION 'VERROU BUDGETAIRE INDEMNITES : Crédits insuffisants sur la ligne budgétaire (Disponible : % FCFA, Demandé : % FCFA).',
                (v_alloc - v_committed), NEW.total_gross_fcfa;
        END IF;

        UPDATE public.budget_lines
        SET committed_fcfa = committed_fcfa + NEW.total_gross_fcfa
        WHERE id = NEW.budget_line_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_indemnity_budget_check
BEFORE UPDATE OF status ON public.indemnity_liquidations
FOR EACH ROW EXECUTE FUNCTION public.enforce_indemnity_budget_availability();

-- ----------------------------------------------------------------------------
-- 6. MODULE CONTENTIEUX, RECOURS & SUSPENSION AUTOMATIQUE
-- ----------------------------------------------------------------------------
CREATE TABLE public.disputes (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id                   UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    project_id                  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    tender_file_id              UUID REFERENCES public.tender_files(id) ON DELETE SET NULL,
    award_id                    UUID REFERENCES public.awards(id) ON DELETE SET NULL,
    contract_id                 UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
    claimant_supplier_id        UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    claimant_name               TEXT NOT NULL,
    dispute_number              TEXT NOT NULL,
    stage                       dispute_stage NOT NULL,
    status                      dispute_status NOT NULL DEFAULT 'DEPOSE',
    filed_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reference_event_at          TIMESTAMPTZ, -- Date publication attribution ou rejet
    legal_deadline_days         INTEGER NOT NULL DEFAULT 5,
    is_foreclosed               BOOLEAN NOT NULL DEFAULT FALSE,
    prior_mo_seizure_verified   BOOLEAN NOT NULL DEFAULT TRUE,
    suspension_active           BOOLEAN NOT NULL DEFAULT FALSE,
    subject                     TEXT NOT NULL,
    grounds_summary             TEXT NOT NULL,
    claimant_attachments        JSONB NOT NULL DEFAULT '[]'::JSONB,
    -- Audit Juridique IA en 4 étapes
    ai_risk_score               TEXT CHECK (ai_risk_score IN ('INFONDE', 'VICE_MINEUR', 'RISQUE_ELEVE_ANNULATION')),
    ai_admissibility_check      JSONB,
    ai_factual_cross_check      JSONB,
    mo_response_draft           TEXT,
    mo_response_signed_at       TIMESTAMPTZ,
    armp_transmitted_at         TIMESTAMPTZ,
    armp_decision_ref           TEXT,
    final_decision_summary      TEXT,
    resolved_at                 TIMESTAMPTZ,
    sync_version                BIGINT NOT NULL DEFAULT 1,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entity_id, dispute_number)
);

-- Trigger : Effet suspensif automatique (CMP) lors d'un recours recevable à l'attribution
CREATE OR REPLACE FUNCTION public.enforce_dispute_suspensive_effect()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.stage IN ('PRE_OUVERTURE', 'OUVERTURE_PLIS', 'ATTRIBUTION')
       AND NEW.is_foreclosed = FALSE
       AND NEW.status IN ('DEPOSE', 'EN_VERIFICATION_RECEVABILITE', 'SUSPENDU_INSTRUCTION', 'TRANSMIS_ARMP') THEN
        NEW.suspension_active := TRUE;

        UPDATE public.projects
        SET status = 'SUSPENDU_CONTENTIEUX'
        WHERE id = NEW.project_id
          AND status NOT IN ('CONTRACTUALISE', 'EN_EXECUTION', 'RECEPTION_PROVISOIRE', 'RECEPTION_DEFINITIVE', 'RESILIE');

        IF NEW.award_id IS NOT NULL THEN
            UPDATE public.awards SET status = 'SUSPENDU_RECOURS' WHERE id = NEW.award_id AND status = 'PROVISOIRE';
        END IF;
    ELSIF NEW.status IN ('FORCLOS_REJETE', 'DECISION_RENDUE', 'CLOTURE') THEN
        NEW.suspension_active := FALSE;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_disputes_suspensive
BEFORE INSERT OR UPDATE ON public.disputes
FOR EACH ROW EXECUTE FUNCTION public.enforce_dispute_suspensive_effect();

-- Verrou bloquant la signature d'un contrat si un recours suspensif actif existe
CREATE OR REPLACE FUNCTION public.block_contract_signature_on_active_dispute()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_active_disputes INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_active_disputes
    FROM public.disputes
    WHERE project_id = NEW.project_id AND suspension_active = TRUE;

    IF v_active_disputes > 0 THEN
        RAISE EXCEPTION 'EFFET SUSPENSIF ACTIF (CMP) : Signature du contrat bloquée car % recours suspensif(s) est/sont en cours d''instruction sur ce dossier.', v_active_disputes;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_contracts_block_on_dispute
BEFORE INSERT OR UPDATE OF signed_by_mo_at ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.block_contract_signature_on_active_dispute();

-- ----------------------------------------------------------------------------
-- 7. BIBLIOTHEQUE DE CORRESPONDANCES ADMINISTRATIVES & BASE VECTORIELLE RAG
-- ----------------------------------------------------------------------------
CREATE TABLE public.correspondence_templates (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id                   UUID REFERENCES public.entities(id) ON DELETE CASCADE, -- NULL = modèle officiel national
    role_owner                  rbac_role NOT NULL,
    case_type                   TEXT NOT NULL, -- BT_DAO_CIPM, NOTE_AVENANT, OS_DEMARRAGE, MISE_EN_DEMEURE, REPONSE_RECOURS, ETAT_INDEMNITES...
    title                       TEXT NOT NULL,
    administrative_rank_target  TEXT NOT NULL, -- Ministre, Préfet, Maire, DG ARMP, Soumissionnaire
    subject_template            TEXT NOT NULL,
    body_template               TEXT NOT NULL,
    variables_schema            JSONB NOT NULL DEFAULT '[]'::JSONB,
    legal_citations             TEXT[] NOT NULL DEFAULT '{}',
    is_validated_best_practice  BOOLEAN NOT NULL DEFAULT FALSE,
    usage_count                 INTEGER NOT NULL DEFAULT 0,
    sync_version                BIGINT NOT NULL DEFAULT 1,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.generated_correspondences (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id           UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    template_id         UUID REFERENCES public.correspondence_templates(id) ON DELETE SET NULL,
    project_id          UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    contract_id         UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
    dispute_id          UUID REFERENCES public.disputes(id) ON DELETE SET NULL,
    liquidation_id      UUID REFERENCES public.indemnity_liquidations(id) ON DELETE SET NULL,
    chrono_number       TEXT NOT NULL,
    sender_user_id      UUID NOT NULL REFERENCES public.user_profiles(id),
    recipient_label     TEXT NOT NULL,
    subject             TEXT NOT NULL,
    body_rendered       TEXT NOT NULL,
    ampliations         TEXT[] NOT NULL DEFAULT '{}',
    status              TEXT NOT NULL DEFAULT 'BROUILLON' CHECK (status IN ('BROUILLON', 'VALIDE', 'SIGNE', 'TRANSMIS')),
    sha256_seal         TEXT,
    qr_verification_id  UUID DEFAULT gen_random_uuid(),
    pdf_storage_path    TEXT,
    signed_at           TIMESTAMPTZ,
    sync_version        BIGINT NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entity_id, chrono_number)
);

CREATE TABLE public.legal_knowledge_chunks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_code         TEXT NOT NULL, -- DECRET_2018_366, LOI_2019_024, DECRET_2013_271, CGI_2026...
    source_title        TEXT NOT NULL,
    article_ref         TEXT NOT NULL,
    domain_tag          TEXT NOT NULL, -- PASSATION, INDEMNITES, FISCALITE, CONTENTIEUX, CTD, OHADA
    effective_date      DATE,
    content             TEXT NOT NULL,
    metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
    embedding           vector(768), -- Compatible Gemini text-embedding-004 / Ollama nomic-embed-text
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_legal_chunks_embedding ON public.legal_knowledge_chunks
    USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_legal_chunks_domain ON public.legal_knowledge_chunks (domain_tag, source_code);

CREATE OR REPLACE FUNCTION public.match_legal_chunks(
    query_embedding vector(768),
    match_threshold FLOAT DEFAULT 0.65,
    match_count INT DEFAULT 8,
    filter_domain TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    source_code TEXT,
    source_title TEXT,
    article_ref TEXT,
    domain_tag TEXT,
    content TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        l.id,
        l.source_code,
        l.source_title,
        l.article_ref,
        l.domain_tag,
        l.content,
        1 - (l.embedding <=> query_embedding) AS similarity
    FROM public.legal_knowledge_chunks l
    WHERE (filter_domain IS NULL OR l.domain_tag = filter_domain)
      AND 1 - (l.embedding <=> query_embedding) >= match_threshold
    ORDER BY l.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. JOURNAL D'AUDIT IMMUABLE AVEC CHAINAGE SHA-256 (APPEND-ONLY)
-- ----------------------------------------------------------------------------
CREATE TABLE public.audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    entity_id       UUID REFERENCES public.entities(id) ON DELETE SET NULL,
    actor_user_id   UUID,
    actor_role      rbac_role,
    action          TEXT NOT NULL, -- INSERT, UPDATE, SIGN, SEAL, DISPUTE_SUSPEND, INDEMNITY_LIQUIDATE
    table_name      TEXT NOT NULL,
    record_id       TEXT NOT NULL,
    old_data        JSONB,
    new_data        JSONB,
    prev_hash       TEXT NOT NULL,
    record_hash     TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.append_audit_hash_chain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_prev TEXT;
    v_payload TEXT;
BEGIN
    SELECT record_hash INTO v_prev FROM public.audit_logs ORDER BY id DESC LIMIT 1;
    NEW.prev_hash := COALESCE(v_prev, 'GENESIS_COMMANDE_PUBLIQUE_CM');
    v_payload := NEW.prev_hash || '|' || COALESCE(NEW.entity_id::TEXT, '') || '|' ||
                 COALESCE(NEW.actor_user_id::TEXT, '') || '|' || NEW.action || '|' ||
                 NEW.table_name || '|' || NEW.record_id || '|' ||
                 COALESCE(NEW.new_data::TEXT, '') || '|' || NOW()::TEXT;
    NEW.record_hash := encode(digest(v_payload, 'sha256'), 'hex');
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_logs_chain
BEFORE INSERT ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.append_audit_hash_chain();

CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'INTEGRITE AUDIT : La table audit_logs est strictement immuable (append-only). Toute modification ou suppression est interdite.';
END;
$$;

CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- ----------------------------------------------------------------------------
-- 9. INDEXES DE PERFORMANCE & TRIGGERS UPDATED_AT
-- ----------------------------------------------------------------------------
CREATE INDEX idx_memberships_user_entity ON public.entity_memberships(user_id, entity_id) WHERE active = TRUE;
CREATE INDEX idx_projects_entity_status ON public.projects(entity_id, status, fiscal_year);
CREATE INDEX idx_bids_tender_supplier ON public.bids(tender_file_id, supplier_id);
CREATE INDEX idx_contracts_entity_supplier ON public.contracts(entity_id, supplier_id, status);
CREATE INDEX idx_decomptes_contract ON public.decomptes(contract_id, status);
CREATE INDEX idx_indemnity_liq_entity ON public.indemnity_liquidations(entity_id, fiscal_year, status);
CREATE INDEX idx_disputes_project_status ON public.disputes(project_id, status, suspension_active);
CREATE INDEX idx_suppliers_name_trgm ON public.suppliers USING gin (company_name gin_trgm_ops);

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'entities', 'user_profiles', 'commissions', 'suppliers', 'budget_lines',
        'projects', 'tender_files', 'bids', 'sca_evaluations', 'awards',
        'contracts', 'securities', 'service_orders', 'decomptes', 'amendments',
        'terminations', 'receptions', 'indemnity_scales', 'session_attendances',
        'indemnity_liquidations', 'disputes', 'correspondence_templates', 'generated_correspondences'
    ] LOOP
        EXECUTE format('CREATE TRIGGER trg_%I_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();', t, t);
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 10. FONCTIONS HELPER RBAC & POLITIQUES ROW-LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_is_entity_member(p_entity_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.entity_memberships em
        WHERE em.user_id = auth.uid()
          AND em.entity_id = p_entity_id
          AND em.active = TRUE
          AND (em.valid_until IS NULL OR em.valid_until >= CURRENT_DATE)
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_has_entity_role(p_entity_id UUID, p_roles rbac_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.entity_memberships em
        WHERE em.user_id = auth.uid()
          AND em.entity_id = p_entity_id
          AND em.role = ANY(p_roles)
          AND em.active = TRUE
          AND (em.valid_until IS NULL OR em.valid_until >= CURRENT_DATE)
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_is_armp_global()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.entity_memberships em
        WHERE em.user_id = auth.uid()
          AND em.role IN ('ARMP_OBSERVATEUR', 'ARMP_REGULATEUR', 'SUPER_ADMIN')
          AND em.active = TRUE
    );
$$;

-- Activation RLS sur l'ensemble des tables sensibles
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tender_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tender_addenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sca_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.securities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decomptes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indemnity_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indemnity_liquidations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indemnity_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correspondence_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_correspondences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Politiques : Profils & Entités
CREATE POLICY p_profiles_self ON public.user_profiles
    FOR SELECT USING (id = auth.uid() OR public.auth_is_armp_global());
CREATE POLICY p_profiles_update_self ON public.user_profiles
    FOR UPDATE USING (id = auth.uid());

CREATE POLICY p_entities_read ON public.entities
    FOR SELECT USING (public.auth_is_entity_member(id) OR public.auth_is_armp_global());

CREATE POLICY p_memberships_read ON public.entity_memberships
    FOR SELECT USING (user_id = auth.uid() OR public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','SUPER_ADMIN']::rbac_role[]));

CREATE POLICY p_commissions_read ON public.commissions
    FOR SELECT USING (public.auth_is_entity_member(entity_id) OR public.auth_is_armp_global());
CREATE POLICY p_commissions_write ON public.commissions
    FOR ALL USING (public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','SUPER_ADMIN']::rbac_role[]));

CREATE POLICY p_suppliers_read ON public.suppliers
    FOR SELECT USING (
        owner_user_id = auth.uid()
        OR auth.uid() IS NOT NULL
    );
CREATE POLICY p_suppliers_owner_write ON public.suppliers
    FOR ALL USING (owner_user_id = auth.uid() OR public.auth_is_armp_global());

CREATE POLICY p_budget_lines_read ON public.budget_lines
    FOR SELECT USING (public.auth_is_entity_member(entity_id) OR public.auth_is_armp_global());
CREATE POLICY p_budget_lines_write ON public.budget_lines
    FOR ALL USING (public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','CONTROLEUR_FINANCIER','RECEVEUR_COMPTABLE','SUPER_ADMIN']::rbac_role[]));

-- Politiques : Projets, DAO & Additifs (Lecture publique des DAO publiés pour soumissionnaires)
CREATE POLICY p_projects_read ON public.projects
    FOR SELECT USING (
        public.auth_is_entity_member(entity_id)
        OR public.auth_is_armp_global()
        OR status IN ('PUBLIE', 'ATTRIBUE_STANDSTILL')
    );

CREATE POLICY p_projects_write ON public.projects
    FOR ALL USING (public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','SUPER_ADMIN']::rbac_role[]));

CREATE POLICY p_tender_files_read ON public.tender_files
    FOR SELECT USING (
        public.auth_is_entity_member(entity_id)
        OR public.auth_is_armp_global()
        OR published_at IS NOT NULL
    );

CREATE POLICY p_tender_files_write ON public.tender_files
    FOR ALL USING (public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','CPM_PRESIDENT','CPM_SECRETAIRE','SUPER_ADMIN']::rbac_role[]));

CREATE POLICY p_tender_addenda_read ON public.tender_addenda
    FOR SELECT USING (
        public.auth_is_entity_member(entity_id)
        OR public.auth_is_armp_global()
        OR EXISTS (SELECT 1 FROM public.tender_files tf WHERE tf.id = tender_file_id AND tf.published_at IS NOT NULL)
    );
CREATE POLICY p_tender_addenda_write ON public.tender_addenda
    FOR ALL USING (public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','CPM_PRESIDENT','CPM_SECRETAIRE','SUPER_ADMIN']::rbac_role[]));

-- Politiques critiques sur les Offres (Bids) :
-- 1) Un soumissionnaire ne voit que ses propres offres.
-- 2) L'entité (SIGAMP, CPM, SCA, ARMP) voit les offres de l'entité.
-- 3) Les soumissionnaires peuvent déposer avant la deadline.
CREATE POLICY p_bids_read ON public.bids
    FOR SELECT USING (
        public.auth_is_entity_member(entity_id)
        OR public.auth_is_armp_global()
        OR EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.owner_user_id = auth.uid())
    );

CREATE POLICY p_bids_supplier_insert ON public.bids
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.owner_user_id = auth.uid())
        OR public.auth_has_entity_role(entity_id, ARRAY['SIGAMP','CPM_SECRETAIRE','SUPER_ADMIN']::rbac_role[])
    );

CREATE POLICY p_sca_eval_access ON public.sca_evaluations
    FOR ALL USING (
        public.auth_has_entity_role(entity_id, ARRAY['SCA_RAPPORTEUR','SCA_MEMBRE','CPM_PRESIDENT','CPM_MEMBRE','CPM_SECRETAIRE','SIGAMP','MO_MOD','ARMP_OBSERVATEUR','ARMP_REGULATEUR','SUPER_ADMIN']::rbac_role[])
        OR public.auth_is_armp_global()
    );

CREATE POLICY p_awards_read ON public.awards
    FOR SELECT USING (
        public.auth_is_entity_member(entity_id)
        OR public.auth_is_armp_global()
        OR status IN ('PROVISOIRE', 'SUSPENDU_RECOURS', 'DEFINITIF', 'INFRUCTUEUX')
    );
CREATE POLICY p_awards_write ON public.awards
    FOR ALL USING (public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','CPM_PRESIDENT','CCCM','SUPER_ADMIN']::rbac_role[]));

-- Politiques Contrats, Sûretés, OS, Décomptes, Avenants, Résiliations, Réceptions
CREATE POLICY p_contracts_read ON public.contracts
    FOR SELECT USING (
        public.auth_is_entity_member(entity_id)
        OR public.auth_is_armp_global()
        OR EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.owner_user_id = auth.uid())
    );

CREATE POLICY p_contracts_write ON public.contracts
    FOR ALL USING (public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','CONTROLEUR_FINANCIER','TUTELLE_ETAT','SUPER_ADMIN']::rbac_role[]));

CREATE POLICY p_securities_access ON public.securities
    FOR ALL USING (
        public.auth_is_entity_member(entity_id)
        OR public.auth_is_armp_global()
        OR EXISTS (
            SELECT 1 FROM public.contracts c
            JOIN public.suppliers s ON s.id = c.supplier_id
            WHERE c.id = contract_id AND s.owner_user_id = auth.uid()
        )
    );

CREATE POLICY p_service_orders_read ON public.service_orders
    FOR SELECT USING (
        public.auth_is_entity_member(entity_id)
        OR public.auth_is_armp_global()
        OR EXISTS (
            SELECT 1 FROM public.contracts c
            JOIN public.suppliers s ON s.id = c.supplier_id
            WHERE c.id = contract_id AND s.owner_user_id = auth.uid()
        )
    );
CREATE POLICY p_service_orders_write ON public.service_orders
    FOR ALL USING (public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','INGENIEUR_MARCHE','CHEF_SERVICE_MARCHE','SUPER_ADMIN']::rbac_role[]));

CREATE POLICY p_decomptes_read ON public.decomptes
    FOR SELECT USING (
        public.auth_is_entity_member(entity_id)
        OR public.auth_is_armp_global()
        OR EXISTS (
            SELECT 1 FROM public.contracts c
            JOIN public.suppliers s ON s.id = c.supplier_id
            WHERE c.id = contract_id AND s.owner_user_id = auth.uid()
        )
    );

CREATE POLICY p_decomptes_write ON public.decomptes
    FOR ALL USING (public.auth_has_entity_role(entity_id, ARRAY['INGENIEUR_MARCHE','CHEF_SERVICE_MARCHE','SIGAMP','CONTROLEUR_FINANCIER','RECEVEUR_COMPTABLE','MO_MOD','SUPER_ADMIN']::rbac_role[]));

CREATE POLICY p_amendments_access ON public.amendments
    FOR ALL USING (public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','INGENIEUR_MARCHE','CPM_PRESIDENT','CCCM','CONTROLEUR_FINANCIER','TUTELLE_ETAT','SUPER_ADMIN']::rbac_role[]));

CREATE POLICY p_terminations_access ON public.terminations
    FOR ALL USING (public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','INGENIEUR_MARCHE','ARMP_REGULATEUR','TUTELLE_ETAT','SUPER_ADMIN']::rbac_role[]));

CREATE POLICY p_receptions_read ON public.receptions
    FOR SELECT USING (
        public.auth_is_entity_member(entity_id)
        OR public.auth_is_armp_global()
        OR EXISTS (
            SELECT 1 FROM public.contracts c
            JOIN public.suppliers s ON s.id = c.supplier_id
            WHERE c.id = contract_id AND s.owner_user_id = auth.uid()
        )
    );
CREATE POLICY p_receptions_write ON public.receptions
    FOR ALL USING (public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','INGENIEUR_MARCHE','CHEF_SERVICE_MARCHE','SUPER_ADMIN']::rbac_role[]));

-- Politiques Moteur d'Indemnités (Cloisonnement strict : chacun voit ses propres items, SIGAMP/MO/CF/Receveur gèrent)
CREATE POLICY p_indemnity_scales_read ON public.indemnity_scales
    FOR SELECT USING (entity_id IS NULL OR public.auth_is_entity_member(entity_id) OR public.auth_is_armp_global());

CREATE POLICY p_indemnity_scales_write ON public.indemnity_scales
    FOR ALL USING (entity_id IS NOT NULL AND public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','CONTROLEUR_FINANCIER','SUPER_ADMIN']::rbac_role[]));

CREATE POLICY p_attendances_access ON public.session_attendances
    FOR ALL USING (public.auth_is_entity_member(entity_id) OR public.auth_is_armp_global());

CREATE POLICY p_liquidations_read ON public.indemnity_liquidations
    FOR SELECT USING (
        public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','CONTROLEUR_FINANCIER','RECEVEUR_COMPTABLE','CPM_PRESIDENT','ARMP_REGULATEUR','SUPER_ADMIN']::rbac_role[])
        OR public.auth_is_armp_global()
    );

CREATE POLICY p_liquidations_write ON public.indemnity_liquidations
    FOR ALL USING (public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','CONTROLEUR_FINANCIER','RECEVEUR_COMPTABLE','SUPER_ADMIN']::rbac_role[]));

CREATE POLICY p_indemnity_items_read ON public.indemnity_items
    FOR SELECT USING (
        beneficiary_id = auth.uid()
        OR public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','CONTROLEUR_FINANCIER','RECEVEUR_COMPTABLE','SUPER_ADMIN']::rbac_role[])
        OR public.auth_is_armp_global()
    );

-- Politiques Contentieux & Recours
CREATE POLICY p_disputes_read ON public.disputes
    FOR SELECT USING (
        public.auth_is_entity_member(entity_id)
        OR public.auth_is_armp_global()
        OR EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = claimant_supplier_id AND s.owner_user_id = auth.uid())
    );

CREATE POLICY p_disputes_insert ON public.disputes
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = claimant_supplier_id AND s.owner_user_id = auth.uid())
        OR public.auth_has_entity_role(entity_id, ARRAY['SIGAMP','MO_MOD','ARMP_REGULATEUR','SUPER_ADMIN']::rbac_role[])
    );

CREATE POLICY p_disputes_manage ON public.disputes
    FOR UPDATE USING (
        public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','ARMP_REGULATEUR','SUPER_ADMIN']::rbac_role[])
        OR public.auth_is_armp_global()
    );

-- Politiques Correspondances, RAG & Audit Immuable
CREATE POLICY p_templates_read ON public.correspondence_templates
    FOR SELECT USING (entity_id IS NULL OR public.auth_is_entity_member(entity_id));

CREATE POLICY p_generated_corr_access ON public.generated_correspondences
    FOR ALL USING (public.auth_is_entity_member(entity_id) OR public.auth_is_armp_global());

CREATE POLICY p_legal_rag_read ON public.legal_knowledge_chunks
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY p_audit_logs_read ON public.audit_logs
    FOR SELECT USING (
        public.auth_has_entity_role(entity_id, ARRAY['MO_MOD','SIGAMP','CONTROLEUR_FINANCIER','ARMP_REGULATEUR','TUTELLE_ETAT','SUPER_ADMIN']::rbac_role[])
        OR public.auth_is_armp_global()
    );

CREATE POLICY p_audit_logs_insert ON public.audit_logs
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Vue sécurisée isolant les montants financiers pendant la phase technique SCA
CREATE OR REPLACE VIEW public.v_bids_blind_evaluation
WITH (security_invoker = true) AS
SELECT
    b.id,
    b.entity_id,
    b.tender_file_id,
    b.supplier_id,
    b.lot_number,
    b.submitted_at,
    b.is_late,
    b.admin_docs,
    b.admin_eliminated,
    b.elimination_reasons,
    b.tech_score,
    b.tech_passed,
    b.tech_validated_at,
    CASE
        WHEN b.tech_passed = TRUE AND b.tech_validated_at IS NOT NULL THEN b.financial_amount_ht
        ELSE NULL
    END AS financial_amount_ht,
    CASE
        WHEN b.tech_passed = TRUE AND b.tech_validated_at IS NOT NULL THEN b.financial_amount_ttc
        ELSE NULL
    END AS financial_amount_ttc,
    b.is_oab_suspected,
    b.is_awarded
FROM public.bids b;
