-- ============================================================================
-- SIGAMP-CM V1.1 : Durcissement RLS (Secret des Plis SCA),
-- Séquençage Atomique Sans Collision & Cautionnement de Recours
-- ============================================================================

-- 1. Colonnes de recevabilité / cautionnement de recours sur public.disputes
ALTER TABLE public.disputes
    ADD COLUMN IF NOT EXISTS appeal_bond_ref TEXT,
    ADD COLUMN IF NOT EXISTS appeal_bond_amount_fcfa NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS appeal_bond_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Durcissement RLS sur public.bids :
-- Empêcher SCA_MEMBRE / SCA_RAPPORTEUR d'accéder directement aux montants financiers
-- avant validation formelle de l'évaluation technique (tech_validated_at IS NOT NULL).
DROP POLICY IF EXISTS p_bids_select ON public.bids;

CREATE POLICY p_bids_select ON public.bids FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE s.id = supplier_id AND s.owner_user_id = auth.uid()
    )
    OR public.is_armp_or_tutelle()
    OR (
        public.has_entity_role(
            entity_id,
            ARRAY['MO_MOD', 'SIGAMP', 'CPM_PRESIDENT', 'CPM_MEMBRE', 'CPM_SECRETAIRE', 'CCCM']::rbac_role[]
        )
        AND EXISTS (
            SELECT 1 FROM public.tender_files tf
            WHERE tf.id = tender_file_id AND NOW() >= tf.opening_datetime
        )
    )
    OR (
        tech_validated_at IS NOT NULL
        AND public.has_entity_role(entity_id, ARRAY['SCA_RAPPORTEUR', 'SCA_MEMBRE']::rbac_role[])
        AND EXISTS (
            SELECT 1 FROM public.tender_files tf
            WHERE tf.id = tender_file_id AND NOW() >= tf.opening_datetime
        )
    )
);

-- 3. Fonction RPC sécurisée get_bids_for_evaluation(p_tender_file_id UUID)
-- Permet à la SCA (et aux membres habilités) d'évaluer l'administratif et le technique
-- tout en masquant systématiquement les colonnes financières tant que tech_validated_at IS NULL.
CREATE OR REPLACE FUNCTION public.get_bids_for_evaluation(p_tender_file_id UUID)
RETURNS TABLE (
    id UUID,
    entity_id UUID,
    tender_file_id UUID,
    supplier_id UUID,
    lot_number INTEGER,
    submitted_at TIMESTAMPTZ,
    is_late BOOLEAN,
    admin_docs JSONB,
    bid_bond_amount_fcfa NUMERIC(18, 2),
    bid_bond_bank TEXT,
    admin_eliminated BOOLEAN,
    elimination_reasons TEXT[],
    tech_score NUMERIC(5, 2),
    tech_passed BOOLEAN,
    tech_validated_at TIMESTAMPTZ,
    financial_amount_ht NUMERIC(18, 2),
    financial_amount_ttc NUMERIC(18, 2),
    corrected_financial_ttc NUMERIC(18, 2),
    is_oab_suspected BOOLEAN,
    oab_threshold_ratio NUMERIC(6, 4),
    is_awarded BOOLEAN,
    financial_masked BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_entity_id UUID;
    v_opening_dt TIMESTAMPTZ;
    v_can_see_before_tech BOOLEAN;
BEGIN
    SELECT tf.entity_id, tf.opening_datetime
    INTO v_entity_id, v_opening_dt
    FROM public.tender_files tf
    WHERE tf.id = p_tender_file_id;

    IF v_entity_id IS NULL THEN
        RETURN;
    END IF;

    IF NOW() < v_opening_dt AND NOT public.is_armp_or_tutelle() THEN
        RAISE EXCEPTION 'SECRET DES PLIS : L''ouverture des plis n''a pas encore eu lieu (prévue le %).', v_opening_dt;
    END IF;

    IF NOT (
        public.is_armp_or_tutelle()
        OR public.has_entity_role(
            v_entity_id,
            ARRAY[
                'MO_MOD', 'SIGAMP', 'CPM_PRESIDENT', 'CPM_MEMBRE', 'CPM_SECRETAIRE',
                'SCA_RAPPORTEUR', 'SCA_MEMBRE', 'CCCM'
            ]::rbac_role[]
        )
    ) THEN
        RAISE EXCEPTION 'ACCES REFUSE : Vous n''êtes pas habilité à consulter les plis de ce dossier.';
    END IF;

    v_can_see_before_tech := public.is_armp_or_tutelle() OR public.has_entity_role(
        v_entity_id,
        ARRAY['MO_MOD', 'SIGAMP', 'CPM_PRESIDENT', 'CPM_SECRETAIRE']::rbac_role[]
    );

    RETURN QUERY
    SELECT
        b.id,
        b.entity_id,
        b.tender_file_id,
        b.supplier_id,
        b.lot_number,
        b.submitted_at,
        b.is_late,
        b.admin_docs,
        b.bid_bond_amount_fcfa,
        b.bid_bond_bank,
        b.admin_eliminated,
        b.elimination_reasons,
        b.tech_score,
        b.tech_passed,
        b.tech_validated_at,
        CASE WHEN b.tech_validated_at IS NOT NULL OR v_can_see_before_tech THEN b.financial_amount_ht ELSE NULL END,
        CASE WHEN b.tech_validated_at IS NOT NULL OR v_can_see_before_tech THEN b.financial_amount_ttc ELSE NULL END,
        CASE WHEN b.tech_validated_at IS NOT NULL OR v_can_see_before_tech THEN b.corrected_financial_ttc ELSE NULL END,
        CASE WHEN b.tech_validated_at IS NOT NULL OR v_can_see_before_tech THEN b.is_oab_suspected ELSE FALSE END,
        CASE WHEN b.tech_validated_at IS NOT NULL OR v_can_see_before_tech THEN b.oab_threshold_ratio ELSE NULL END,
        b.is_awarded,
        NOT (b.tech_validated_at IS NOT NULL OR v_can_see_before_tech) AS financial_masked
    FROM public.bids b
    WHERE b.tender_file_id = p_tender_file_id
    ORDER BY b.lot_number ASC, b.submitted_at ASC;
END;
$$;

-- 4. Table de séquençage chronologique atomique (anti-collision offline)
CREATE TABLE IF NOT EXISTS public.entity_sequences (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id   UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    fiscal_year INTEGER NOT NULL CHECK (fiscal_year BETWEEN 2020 AND 2100),
    doc_type    TEXT NOT NULL,
    last_seq    INTEGER NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entity_id, fiscal_year, doc_type)
);

ALTER TABLE public.entity_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_entity_sequences_select ON public.entity_sequences;
DROP POLICY IF EXISTS p_entity_sequences_write ON public.entity_sequences;

CREATE POLICY p_entity_sequences_select ON public.entity_sequences
FOR SELECT TO authenticated
USING (public.has_entity_role(entity_id) OR public.is_armp_or_tutelle());

CREATE POLICY p_entity_sequences_write ON public.entity_sequences
FOR ALL TO authenticated
USING (public.has_entity_role(entity_id))
WITH CHECK (public.has_entity_role(entity_id));

-- 5. Fonction atomique allocate_next_chrono_number(...) avec verrouillage FOR UPDATE
CREATE OR REPLACE FUNCTION public.allocate_next_chrono_number(
    p_entity_id UUID,
    p_fiscal_year INTEGER,
    p_doc_type TEXT,
    p_prefix TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seq INTEGER;
    v_doc_type TEXT;
    v_clean_prefix TEXT;
    v_padded TEXT;
BEGIN
    v_doc_type := upper(trim(p_doc_type));
    IF v_doc_type IS NULL OR length(v_doc_type) = 0 THEN
        RAISE EXCEPTION 'doc_type est obligatoire pour allouer un numéro chronologique.';
    END IF;

    IF auth.uid() IS NOT NULL AND NOT (public.has_entity_role(p_entity_id) OR public.is_armp_or_tutelle()) THEN
        RAISE EXCEPTION 'ACCES REFUSE : L''acteur n''est pas membre habilité de cette entité.';
    END IF;

    INSERT INTO public.entity_sequences (entity_id, fiscal_year, doc_type, last_seq)
    VALUES (p_entity_id, p_fiscal_year, v_doc_type, 0)
    ON CONFLICT (entity_id, fiscal_year, doc_type) DO NOTHING;

    SELECT last_seq INTO v_seq
    FROM public.entity_sequences
    WHERE entity_id = p_entity_id
      AND fiscal_year = p_fiscal_year
      AND doc_type = v_doc_type
    FOR UPDATE;

    v_seq := v_seq + 1;

    UPDATE public.entity_sequences
    SET last_seq = v_seq,
        updated_at = NOW()
    WHERE entity_id = p_entity_id
      AND fiscal_year = p_fiscal_year
      AND doc_type = v_doc_type;

    v_padded := lpad(v_seq::TEXT, 4, '0');
    v_clean_prefix := NULLIF(trim(COALESCE(p_prefix, '')), '');

    IF v_clean_prefix IS NOT NULL THEN
        RETURN v_clean_prefix || '-' || v_padded || '-' || p_fiscal_year::TEXT;
    END IF;

    RETURN v_doc_type || '-' || v_padded || '-' || p_fiscal_year::TEXT;
END;
$$;
