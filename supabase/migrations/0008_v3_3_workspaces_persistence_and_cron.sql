-- Migration 0008 : Persistance multi-tenant des espaces Commission (CPM/SCA), Finance, Soumissionnaire & Contentieux
CREATE TABLE IF NOT EXISTS public.entity_workspace_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  space_key TEXT NOT NULL CHECK (space_key IN ('CPM_SCA', 'FINANCE_CF', 'SOUMISSIONNAIRE', 'CONTENTIEUX')),
  state_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_id, space_key)
);

CREATE INDEX IF NOT EXISTS idx_entity_workspace_states_entity
  ON public.entity_workspace_states (entity_id, space_key);

ALTER TABLE public.entity_workspace_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_entity_workspace_states_select ON public.entity_workspace_states;
CREATE POLICY p_entity_workspace_states_select ON public.entity_workspace_states
FOR SELECT TO authenticated
USING (public.is_platform_super_admin() OR public.has_entity_role(entity_id));

DROP POLICY IF EXISTS p_entity_workspace_states_write ON public.entity_workspace_states;
CREATE POLICY p_entity_workspace_states_write ON public.entity_workspace_states
FOR ALL TO authenticated
USING (public.is_platform_super_admin() OR public.has_entity_role(entity_id))
WITH CHECK (public.is_platform_super_admin() OR public.has_entity_role(entity_id));
