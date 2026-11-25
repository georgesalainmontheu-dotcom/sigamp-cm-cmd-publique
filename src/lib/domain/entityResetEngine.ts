/**
 * Moteur de Remise à Zéro Sécurisée pour lancement en Production Effective (Axe 5 V2.1).
 * Purge les données opérationnelles de test d'une entité tout en préservant :
 *  - L'entité elle-même, son paramétrage interne et son Studio Visuel (Figma/CMS)
 *  - Sa licence d'exploitation active
 *  - Ses logins / comptes configurés (sauf option explicite deleteTestUsers)
 *  - Les modèles DAO-types et le corpus juridique national.
 */

export const PURGE_OPERATIONAL_TABLES_ORDERED = [
  'receptions',
  'indemnity_liquidations',
  'disputes',
  'decomptes',
  'amendments',
  'contracts',
  'bids',
  'tender_files',
  'confidential_estimates',
  'cctp_documents',
  'technical_assignments',
  'project_maturation_items',
  'projects',
  'generated_correspondences',
  'entity_sequences',
] as const;

export const PRESERVED_CONFIGURATION_ITEMS = [
  'Paramétrage institutionnel de l’entité (entities)',
  'Identité visuelle, logo, palette & blocs Studio Figma/CMS',
  'Licence d’exploitation active & historique des commandes de licence',
  'Comptes utilisateurs & rôles RBAC configurés (sauf comptes marqués test si option cochée)',
  'Modèles DAO-Types ARMP & Corpus juridique camerounais RAG',
  'Journal d’audit immuable (incluant l’acte de remise à zéro)',
] as const;

export interface EntityResetValidationInput {
  targetEntityId: string;
  expectedEntityCode: string;
  confirmEntityCode: string;
  reason: string;
  deleteTestUsers: boolean;
}

export interface EntityResetValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateResetConfirmation(
  input: EntityResetValidationInput
): EntityResetValidationResult {
  const errors: string[] = [];
  if (!input.targetEntityId.trim()) {
    errors.push('Identifiant d’entité cible manquant.');
  }
  if (
    input.confirmEntityCode.trim().toUpperCase() !==
    input.expectedEntityCode.trim().toUpperCase()
  ) {
    errors.push(
      `Confirmation invalide : saisissez exactement le code de l’entité (« ${input.expectedEntityCode} »).`
    );
  }
  if (input.reason.trim().length < 10) {
    errors.push(
      'Motif obligatoire (au moins 10 caractères, ex: « Clôture pilote & bascule production 2026 »).'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export interface EntityResetSummary {
  entityId: string;
  entityCode: string;
  purgedTables: Array<{ table: string; deletedCount: number }>;
  totalDeletedRows: number;
  deletedTestMembershipsCount: number;
  preservedItems: readonly string[];
  auditLogId: string;
  executedAtIso: string;
}
