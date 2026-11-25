/**
 * Types de domaine alignés sur le schéma PostgreSQL / Supabase (Jalon 1).
 * Zéro dépendance UI — réutilisable côté navigateur Offline-First et Edge Functions.
 */

export type EntityType =
  | 'MINISTERE'
  | 'PREFECTURE'
  | 'GOUVERNORAT'
  | 'SOUS_PREFECTURE'
  | 'COMMUNE'
  | 'COMMUNAUTE_URBAINE'
  | 'REGION'
  | 'EPA'
  | 'ENTREPRISE_PUBLIQUE'
  | 'PROJET_PROGRAMME'
  | 'MISSION_DIPLOMATIQUE';

export type RbacRole =
  | 'SUPER_ADMIN'
  | 'ADMIN_ENTITE'
  | 'MO_MOD'
  | 'SIGAMP'
  | 'CPM_PRESIDENT'
  | 'CPM_MEMBRE'
  | 'CPM_SECRETAIRE'
  | 'SCA_RAPPORTEUR'
  | 'SCA_MEMBRE'
  | 'CCCM'
  | 'ARMP_OBSERVATEUR'
  | 'ARMP_REGULATEUR'
  | 'CONTROLEUR_FINANCIER'
  | 'RECEVEUR_COMPTABLE'
  | 'INGENIEUR_MARCHE'
  | 'CHEF_SERVICE_MARCHE'
  | 'TUTELLE_ETAT'
  | 'SOUMISSIONNAIRE';

export type ProcurementNature =
  | 'TRAVAUX'
  | 'FOURNITURES'
  | 'SERVICES_QUANTIFIABLES'
  | 'PRESTATIONS_INTELLECTUELLES';

export type ProcurementMode =
  | 'AONO'
  | 'AOIO'
  | 'AONR'
  | 'AOIR'
  | 'ASMI'
  | 'DC_COTATION'
  | 'GRE_A_GRE'
  | 'REGIE';

export type ContractType =
  | 'BON_COMMANDE_ADMINISTRATIF'
  | 'LETTRE_COMMANDE'
  | 'MARCHE';

export type CommissionType =
  | 'CIPM'
  | 'CRPM'
  | 'CDPM'
  | 'CCCM_TR'
  | 'CCCM_AG'
  | 'CCCM_SPI'
  | 'CCCM_FC';

export type FiscalRegime =
  | 'REEL'
  | 'SIMPLIFIE'
  | 'LIBERATOIRE'
  | 'ETRANGER_NON_RESIDENT';

export type IndemnityTriggerEvent =
  | 'VALIDATION_DAO'
  | 'OUVERTURE_PLIS'
  | 'ADOPTION_RAPPORT_SCA'
  | 'EXAMEN_AVENANT'
  | 'SUIVI_EXECUTION_DECOMPTE'
  | 'INSTRUCTION_CONTENTIEUX'
  | 'RECEPTION_PROVISOIRE'
  | 'RECEPTION_DEFINITIVE'
  | 'MISSION_TERRAIN';
