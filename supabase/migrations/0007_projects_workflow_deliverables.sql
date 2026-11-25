-- Migration 0007 : Persistance structurée des livrables & chaîne de valeur (Étapes 1 à 7) sur public.projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS workflow_state JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_projects_entity_fiscal ON public.projects (entity_id, fiscal_year, updated_at DESC);
