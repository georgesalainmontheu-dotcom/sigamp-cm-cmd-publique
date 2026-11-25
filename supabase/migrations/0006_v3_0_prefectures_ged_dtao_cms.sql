-- ============================================================================
-- SIGAMP-CM V3.0 : Préfectures & Hiérarchie Territoriale, Application GED
-- Régalienne, Catalogue DTAO / Demande de Cotation Intégral, Bibliothèque
-- Officielle des Lois & Administration CMS Complète
-- ============================================================================

-- Note : L'extension de l'enum entity_type ('PREFECTURE', 'GOUVERNORAT',
-- 'SOUS_PREFECTURE', 'MISSION_DIPLOMATIQUE') est appliquée dans la migration
-- préalable 0011_v3_0_add_prefecture_entity_types.

-- 1. Hiérarchie territoriale et tutelle sur `public.entities`
ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS parent_entity_id UUID REFERENCES public.entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS has_own_cipm BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_entities_parent ON public.entities (parent_entity_id);
CREATE INDEX IF NOT EXISTS idx_entities_type_active ON public.entities (type, active, is_active);

-- 2. Fiches d'identification complètes sur `public.user_profiles` (CMS Utilisateurs)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS matricule TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS niu TEXT,
  ADD COLUMN IF NOT EXISTS department_service TEXT;

-- 3. Seed entité Préfecture du Haut-Nkam (Bafang) & rattachement Commune de Bafang
INSERT INTO public.entities (
  id, code, name, type, region, department, municipality,
  primary_color, accent_color, has_own_cipm, active, is_active
)
VALUES (
  '11111111-1111-4111-8111-111111111122',
  'CM-OU-PREF-HN',
  'Préfecture du Haut-Nkam (CDPM / MOD)',
  'PREFECTURE',
  'Ouest',
  'Haut-Nkam',
  'Bafang',
  '#0A1F3D',
  '#D4AF37',
  TRUE,
  TRUE,
  TRUE
)
ON CONFLICT (id) DO UPDATE SET
  type = 'PREFECTURE',
  name = EXCLUDED.name,
  active = TRUE,
  is_active = TRUE;

INSERT INTO public.entity_licenses (
  id, entity_id, plan_code, status, license_key, offline_proof_token,
  starts_at, expires_at, max_active_logins, amount_fcfa, payment_ref, receipt_sha256
)
VALUES (
  '99999999-9999-4999-8999-999999999902',
  '11111111-1111-4111-8111-111111111122',
  'ANNUELLE',
  'ACTIVE',
  'TITCS-SIGAMP-PREFHN26-9902B',
  'SIGAMP-OFFLINE-PREFHN26-VERIFIED-TITCS',
  '2026-01-01T00:00:00Z',
  '2027-12-31T23:59:59Z',
  60,
  1500000,
  'VIR-TRESOR-PREFHN-2026-001',
  encode(sha256('TITCS-SIGAMP-PREFHN26-9902B|CM-OU-PREF-HN|2027-12-31'::bytea), 'hex')
)
ON CONFLICT (id) DO NOTHING;

UPDATE public.entities
SET parent_entity_id = '11111111-1111-4111-8111-111111111122'
WHERE id = '11111111-1111-4111-8111-111111111111'
  AND parent_entity_id IS NULL;

-- 4. Application GED Intégrée (« Chemise Régalienne du Marché »)
CREATE TABLE IF NOT EXISTS public.ged_folders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  folder_code   TEXT NOT NULL CHECK (
    folder_code IN (
      '01_MATURATION_BUDGET',
      '02_LANCEMENT_DAO_DC',
      '03_OUVERTURE_ANALYSE',
      '04_CONTRAT_ENREGISTREMENT',
      '05_EXECUTION_FINANCES',
      '06_RECEPTIONS_CLOTURE_CONTENTIEUX',
      '00_CORRESPONDANCES_GENERALES'
    )
  ),
  label         TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_id, project_id, folder_code)
);

CREATE TABLE IF NOT EXISTS public.ged_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  project_id        UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  folder_code       TEXT NOT NULL DEFAULT '00_CORRESPONDANCES_GENERALES',
  document_category TEXT NOT NULL, -- 'DAO_INTEGRAL', 'DEMANDE_COTATION', 'ACTE_PARAMETRIQUE', 'PIECE_SCANNE', 'LOI_REFERENTIEL'
  act_code          TEXT,          -- Ex: 'DOC_08_DECISION_ATTRIBUTION'
  title             TEXT NOT NULL,
  chrono_number     TEXT,
  file_name         TEXT NOT NULL,
  mime_type         TEXT NOT NULL DEFAULT 'application/pdf',
  file_size_bytes   BIGINT NOT NULL DEFAULT 0,
  sha256_hash       TEXT NOT NULL,
  version_number    INTEGER NOT NULL DEFAULT 1,
  lifecycle_status  TEXT NOT NULL DEFAULT 'VALIDE' CHECK (
    lifecycle_status IN ('BROUILLON', 'VALIDE', 'SIGNE_SCELLE', 'ARCHIVE')
  ),
  storage_path      TEXT,
  content_text      TEXT,
  qr_verification_id TEXT,
  actor_role        rbac_role,
  created_by        UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  signed_by         UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  signed_at         TIMESTAMPTZ,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ged_document_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES public.ged_documents(id) ON DELETE CASCADE,
  entity_id       UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  file_name       TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  sha256_hash     TEXT NOT NULL,
  storage_path    TEXT,
  change_note     TEXT,
  created_by      UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_ged_docs_entity_created
  ON public.ged_documents (entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ged_docs_project_folder
  ON public.ged_documents (entity_id, project_id, folder_code);
CREATE INDEX IF NOT EXISTS idx_ged_docs_sha256
  ON public.ged_documents (sha256_hash);
CREATE INDEX IF NOT EXISTS idx_ged_docs_fts
  ON public.ged_documents USING GIN (
    to_tsvector('french', COALESCE(title, '') || ' ' || COALESCE(chrono_number, '') || ' ' || COALESCE(content_text, ''))
  );

ALTER TABLE public.ged_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ged_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ged_document_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ged_folders_select ON public.ged_folders;
DROP POLICY IF EXISTS p_ged_folders_write ON public.ged_folders;
CREATE POLICY p_ged_folders_select ON public.ged_folders FOR SELECT TO authenticated
USING (public.has_entity_role(entity_id) OR public.is_armp_or_tutelle() OR public.is_platform_super_admin());
CREATE POLICY p_ged_folders_write ON public.ged_folders FOR ALL TO authenticated
USING (public.has_entity_role(entity_id) OR public.is_platform_super_admin())
WITH CHECK (public.has_entity_role(entity_id) OR public.is_platform_super_admin());

DROP POLICY IF EXISTS p_ged_docs_select ON public.ged_documents;
DROP POLICY IF EXISTS p_ged_docs_write ON public.ged_documents;
CREATE POLICY p_ged_docs_select ON public.ged_documents FOR SELECT TO authenticated
USING (
  public.is_platform_super_admin()
  OR public.is_armp_or_tutelle()
  OR (
    public.has_entity_role(entity_id)
    AND (
      folder_code <> '01_MATURATION_BUDGET'
      OR act_code <> 'DEVIS_CONFIDENTIEL'
      OR public.has_entity_role(entity_id, ARRAY['MO_MOD', 'SIGAMP', 'ADMIN_ENTITE', 'SUPER_ADMIN', 'CONTROLEUR_FINANCIER']::rbac_role[])
    )
  )
);
CREATE POLICY p_ged_docs_write ON public.ged_documents FOR ALL TO authenticated
USING (public.has_entity_role(entity_id) OR public.is_platform_super_admin())
WITH CHECK (public.has_entity_role(entity_id) OR public.is_platform_super_admin());

DROP POLICY IF EXISTS p_ged_versions_select ON public.ged_document_versions;
DROP POLICY IF EXISTS p_ged_versions_write ON public.ged_document_versions;
CREATE POLICY p_ged_versions_select ON public.ged_document_versions FOR SELECT TO authenticated
USING (public.has_entity_role(entity_id) OR public.is_armp_or_tutelle() OR public.is_platform_super_admin());
CREATE POLICY p_ged_versions_write ON public.ged_document_versions FOR INSERT TO authenticated
WITH CHECK (public.has_entity_role(entity_id) OR public.is_platform_super_admin());

-- 5. Catalogue Officiel Intégral des DTAO / Demande de Cotation & Bibliothèque des Lois
CREATE TABLE IF NOT EXISTS public.official_dtao_catalog (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  procedure_kind  TEXT NOT NULL, -- 'TRAVAUX', 'FOURNITURES', 'PRESTATIONS_INTELLECTUELLES', 'DC_COTATION', 'FACILITATION'
  legal_basis     TEXT NOT NULL,
  source_pdf_path TEXT NOT NULL,
  total_pages     INTEGER NOT NULL,
  pieces_summary  JSONB NOT NULL DEFAULT '[]'::jsonb,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.official_legal_library (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  category        TEXT NOT NULL, -- 'CODE_MARCHES', 'MANUEL_PROCEDURES', 'GUIDE_REGULATION', 'FACILITATION', 'ARRETE'
  effective_date  DATE,
  source_pdf_path TEXT NOT NULL,
  total_pages     INTEGER NOT NULL,
  summary         TEXT NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.official_dtao_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_legal_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_dtao_cat_select ON public.official_dtao_catalog;
CREATE POLICY p_dtao_cat_select ON public.official_dtao_catalog FOR SELECT TO authenticated
USING (active = TRUE);

DROP POLICY IF EXISTS p_legal_lib_select ON public.official_legal_library;
CREATE POLICY p_legal_lib_select ON public.official_legal_library FOR SELECT TO authenticated
USING (active = TRUE);

INSERT INTO public.official_dtao_catalog (slug, title, procedure_kind, legal_basis, source_pdf_path, total_pages)
VALUES
  ('dtao_travaux_2024', 'DTAO Marchés de Travaux (Version 2024 ARMP)', 'TRAVAUX', 'Décret n° 2018/366 & Arrêté n° 038/CAB/PM', '/official-docs/dtao/DTAO_Travaux_2024.pdf', 163),
  ('dtao_travaux_officiel', 'DTAO Marchés de Travaux Classique (Arrêté 038/PM)', 'TRAVAUX', 'Arrêté n° 038/CAB/PM du 15 mai 2014', '/official-docs/dtao/DTAO_Travaux.pdf', 118),
  ('dtao_fournitures_locales', 'DTAO Fournitures Achetées Localement', 'FOURNITURES', 'Arrêté n° 038/CAB/PM & CMP 2018/366', '/official-docs/dtao/DTAO_Fournitures_Locales.pdf', 108),
  ('dtao_fournitures_importees', 'DTAO Fournitures Importées', 'FOURNITURES', 'Arrêté n° 038/CAB/PM & CMP 2018/366', '/official-docs/dtao/DTAO_Fournitures_Importees.pdf', 104),
  ('dtao_services_pi_2024', 'DTAO Services Non Quantifiables & Prestations Intellectuelles (2024)', 'PRESTATIONS_INTELLECTUELLES', 'Décret n° 2018/366 Art. 78', '/official-docs/dtao/DTAO_Services_Prestations_Intellectuelles_2024.pdf', 175),
  ('dt_demande_cotation', 'Dossier Type de Demande de Cotation (Travaux, Fournitures & Services)', 'DC_COTATION', 'Décret n° 2018/366 & Arrêté DTDC ARMP', '/official-docs/dtao/DT_Demande_Cotation_ARMP.pdf', 171)
ON CONFLICT (slug) DO UPDATE SET
  total_pages = EXCLUDED.total_pages,
  source_pdf_path = EXCLUDED.source_pdf_path;

INSERT INTO public.official_legal_library (slug, title, category, effective_date, source_pdf_path, total_pages, summary)
VALUES
  ('decret_2018_366', 'Décret n° 2018/366 du 20 juin 2018 portant Code des Marchés Publics', 'CODE_MARCHES', '2018-06-20', '/official-docs/laws/Decret_2018_366_Code_Marches_Publics.pdf', 98, 'Texte intégral officiel du Code des Marchés Publics du Cameroun (98 pages).'),
  ('recueil_facilitation_2023', 'Recueil Officiel des Documents de Facilitation des Marchés Publics (ARMP / MINMAP Mai 2023)', 'FACILITATION', '2023-05-01', '/official-docs/laws/Recueil_Documents_Facilitation_ARMP_2023.pdf', 83, '38 formulaires & modèles officiels + 15 canevas de PV, rapports SCA, OI, CCCM et rapports périodiques.'),
  ('manuel_passation_2023', 'Manuel des Procédures de Passation des Marchés Publics (ARMP)', 'MANUEL_PROCEDURES', '2023-05-01', '/official-docs/laws/Manuel_Procedures_Passation_ARMP_2023.pdf', 42, 'Mode opératoire détaillé étape par étape de la passation et signature des marchés et lettres-commandes.'),
  ('guide_regulation_2023', 'Guide de la Régulation des Marchés Publics (ARMP)', 'GUIDE_REGULATION', '2023-05-01', '/official-docs/laws/Guide_Regulation_ARMP_2023.pdf', 79, 'Référentiel de contrôle, examen des DCE, seuils, additifs et conformité réglementaire.')
ON CONFLICT (slug) DO UPDATE SET
  total_pages = EXCLUDED.total_pages,
  source_pdf_path = EXCLUDED.source_pdf_path;
