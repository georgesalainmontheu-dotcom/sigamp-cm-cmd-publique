import type {
  CommissionType,
  ContractType,
  EntityType,
  FiscalRegime,
  IndemnityTriggerEvent,
  ProcurementMode,
  ProcurementNature,
  RbacRole,
} from './domain';

// ============================================================================
// 1. PASSERELLE IA MULTI-FOURNISSEURS & AUTO-FALLBACK
// ============================================================================

export type AiProviderId = 'gemini' | 'groq' | 'mistral' | 'openrouter' | 'ollama';

export type AiTaskKind =
  | 'LONG_DOC_ANALYSIS'       // DAO, rapports SCA, requêtes contentieuses -> Gemini prioritaire
  | 'FAST_NLP_COMMAND'        // Commandes NLP & Function Calling < 1s -> Groq prioritaire
  | 'FRANCOPHONE_DRAFTING'    // Rédaction administrative francophone -> Mistral prioritaire
  | 'DISPUTE_LEGAL_AUDIT'     // Audit contentieux -> Gemini / Mistral
  | 'OFFLINE_LOCAL';          // Mode hors-ligne -> Ollama prioritaire

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: AiToolCallRequest[];
}

export interface AiToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<
      string,
      {
        type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
        description: string;
        enum?: readonly string[];
        items?: { type: string };
      }
    >;
    required: readonly string[];
  };
}

export interface AiGatewayRequest {
  taskKind: AiTaskKind;
  messages: AiChatMessage[];
  tools?: AiToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
  offlineMode?: boolean;
  preferredProvider?: AiProviderId;
  timeoutMs?: number;
}

export interface AiProviderAttemptLog {
  provider: AiProviderId;
  model: string;
  statusCode?: number;
  outcome: 'SUCCESS' | 'RATE_LIMITED_429' | 'SKIPPED_COOLDOWN' | 'UNCONFIGURED' | 'ERROR';
  latencyMs: number;
  errorMessage?: string;
}

export interface AiTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiGatewayResponse {
  providerUsed: AiProviderId;
  modelUsed: string;
  content: string;
  toolCalls: AiToolCallRequest[];
  isOfflineFallback: boolean;
  latencyMs: number;
  usage?: AiTokenUsage;
  attempts: AiProviderAttemptLog[];
}

export interface AiProviderConfig {
  geminiApiKey?: string;
  geminiModel?: string;
  geminiEmbedModel?: string;
  groqApiKey?: string;
  groqModel?: string;
  mistralApiKey?: string;
  mistralModel?: string;
  openrouterApiKey?: string;
  openrouterModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  ollamaEmbedModel?: string;
}

// ============================================================================
// 2. RAG JURIDIQUE (pgvector legal_knowledge_chunks)
// ============================================================================

export interface LegalKnowledgeChunkMatch {
  id: string;
  sourceCode: string;
  sourceTitle: string;
  articleRef: string;
  domainTag: string;
  content: string;
  similarity: number;
}

// ============================================================================
// 3. REDACTION ADMINISTRATIVE & APPRENTISSAGE DE MODELES
// ============================================================================

export type CorrespondenceCaseType =
  | 'BORDEREAU_TRANSMISSION'
  | 'NOTE_INFORMATION'
  | 'ORDRE_SERVICE'
  | 'MISE_EN_DEMEURE'
  | 'NOTIFICATION_ATTRIBUTION'
  | 'NOTIFICATION_REJET'
  | 'REPONSE_RECOURS_MO'
  | 'MEMOIRE_DEFENSE_ARMP'
  | 'ETAT_INDEMNITES';

export type HierarchyDirection =
  | 'ASCENDANT'     // Vers autorité supérieure (Ministre, Gouverneur, Préfet, DG ARMP, Président CCCM)
  | 'EGALITAIRE'    // Entre pairs / Présidents CIPM / Contrôleur Financier
  | 'DESCENDANT'    // Vers collaborateur, Ingénieur, Chef Service Marché
  | 'EXTERNE_TIERS'; // Vers Entreprise Titulaire ou Soumissionnaire

export interface CorrespondenceTemplateRecord {
  id: string;
  entityId: string | null;
  roleOwner: RbacRole;
  caseType: CorrespondenceCaseType;
  title: string;
  administrativeRankTarget: string;
  hierarchyDirection: HierarchyDirection;
  subjectTemplate: string;
  bodyTemplate: string;
  defaultAmpliations: string[];
  variablesSchema: string[];
  legalCitations: string[];
  isValidatedBestPractice: boolean;
  usageCount: number;
}

export interface AdministrativeHeaderContext {
  republicHeader?: string;
  motto?: string;
  entityName: string;
  entityShortName?: string;
  entityType: EntityType;
  serviceLine: string; // Ex: "Service Interne de Gestion Administrative des Marchés Publics (SIGAMP)"
  city: string;
  chronoNumber: string;
  dateFormatted: string;
  senderRole: RbacRole;
  senderTitle: string;
  senderName: string;
  recipientLabel: string;
  recipientRank: string;
  hierarchyDirection: HierarchyDirection;
}

export interface CorrespondenceSqlContext {
  projectCode?: string;
  projectTitle?: string;
  fiscalYear?: number;
  contractNumber?: string;
  contractType?: ContractType;
  procurementMode?: ProcurementMode;
  nature?: ProcurementNature;
  commissionType?: CommissionType;
  supplierName?: string;
  supplierNiu?: string;
  amountHtFcfa?: number;
  amountTtcFcfa?: number;
  executionDays?: number;
  deadlineDateFormatted?: string;
  gracePeriodDays?: number;
  disputeNumber?: string;
  referenceDocument?: string;
  attachmentsList?: Array<{
    designation: string;
    copiesCount: number;
    observations?: string;
  }>;
  customVariables?: Record<string, string | number | boolean>;
}

export interface GenerateCorrespondenceInput {
  entityId: string;
  caseType: CorrespondenceCaseType;
  header: AdministrativeHeaderContext;
  sqlContext: CorrespondenceSqlContext;
  templatesCatalog?: CorrespondenceTemplateRecord[];
  customInstructions?: string;
  useAiRefinement?: boolean;
  offlineMode?: boolean;
}

export interface GeneratedCorrespondenceResult {
  templateUsedId: string;
  caseType: CorrespondenceCaseType;
  chronoNumber: string;
  timbreBlock: string;
  recipientBlock: string;
  referencesList: string[];
  subject: string;
  bodyRendered: string;
  fullFormattedDocument: string;
  ampliations: string[];
  legalCitations: string[];
  injectedVariables: Record<string, string>;
  aiRefined: boolean;
  aiProviderUsed?: AiProviderId;
}

export interface LearnTemplateInput {
  entityId: string | null;
  roleOwner: RbacRole;
  caseType: CorrespondenceCaseType;
  administrativeRankTarget: string;
  hierarchyDirection: HierarchyDirection;
  validatedSubject: string;
  validatedBody: string;
  sqlContextUsed: CorrespondenceSqlContext;
  legalCitations?: string[];
  defaultAmpliations?: string[];
  existingTemplates?: CorrespondenceTemplateRecord[];
}

export interface LearnedTemplateProposal {
  shouldPersist: boolean;
  reason: string;
  template: CorrespondenceTemplateRecord;
  extractedPlaceholders: string[];
}

// ============================================================================
// 4. CONTENTIEUX & AUDIT JURIDIQUE
// ============================================================================

export type DisputeStage =
  | 'PRE_OUVERTURE'
  | 'OUVERTURE_PLIS'
  | 'ATTRIBUTION'
  | 'EXECUTION'
  | 'RESILIATION';

export type DisputeRiskScore =
  | 'INFONDE'
  | 'VICE_MINEUR'
  | 'RISQUE_ELEVE_ANNULATION';

export interface SubmittedDocExpiryRecord {
  docType: string; // Ex: "ATTESTATION_NON_REDEVANCE", "CNPS", "CAUTION_SOUMISSION", "RCCM"
  documentRef: string;
  issuedAt?: string;
  expiresAt?: string;
  isPresentAtOpening: boolean;
  isAuthenticVerified?: boolean;
}

export interface DisputeBidSnapshot {
  bidId: string;
  supplierId: string;
  supplierName: string;
  isClaimant: boolean;
  isProvisionalWinner: boolean;
  lotNumber: number;
  submittedAtIso: string;
  isLate: boolean;
  isArmpExcluded: boolean;
  armpExclusionUntilIso?: string;
  adminEliminated: boolean;
  eliminationReasons: string[];
  techScore?: number;
  techMinRequiredScore?: number;
  techPassed?: boolean;
  financialAmountHt?: number;
  financialAmountTtc?: number;
  correctedFinancialTtc?: number;
  isOabSuspected?: boolean;
  oabJustificationAccepted?: boolean;
  bidBondAmountFcfa?: number;
  requiredBidBondFcfa?: number;
  adminDocuments: SubmittedDocExpiryRecord[];
}

export interface DisputeOpeningPvSnapshot {
  pvNumber: string;
  openingDateIso: string;
  submissionDeadlineIso: string;
  commissionType: CommissionType;
  presentMembersCount: number;
  quorumReached: boolean;
  armpObserverPresent: boolean;
  incidentsNoted: string[];
}

export interface DisputeScaReportSnapshot {
  reportRef: string;
  adoptedByCpmAtIso?: string;
  cccmOpinionRef?: string;
  summaryConclusions: string;
  keyFindings: string[];
}

export interface DisputeAuditInput {
  entityId: string;
  entityName: string;
  entityType: EntityType;
  city: string;
  projectId: string;
  projectCode: string;
  projectTitle: string;
  tenderNumber: string;
  procurementMode: ProcurementMode;
  nature: ProcurementNature;
  disputeNumber: string;
  stage: DisputeStage;
  claimantSupplierId: string;
  claimantName: string;
  claimantSignatory?: string;
  filedAtIso: string;
  referenceEventAtIso: string; // Date publication attribution ou rejet ou PV ouverture
  priorMoSeizureVerified: boolean;
  legalDeadlineBusinessDays?: number; // Défaut CMP = 5 jours ouvrables
  extraHolidaysIso?: string[];
  subject: string;
  groundsSummary: string;
  grievances: string[];
  openingPv: DisputeOpeningPvSnapshot;
  scaReport?: DisputeScaReportSnapshot;
  bids: DisputeBidSnapshot[];
  moSenderName: string;
  moSenderTitle: string;
  legalChunks?: LegalKnowledgeChunkMatch[];
  useAiSynthesis?: boolean;
  offlineMode?: boolean;
}

export interface AdmissibilityCheckResult {
  referenceEventAtIso: string;
  filedAtIso: string;
  legalDeadlineDateIso: string;
  businessDaysElapsed: number;
  legalDeadlineBusinessDays: number;
  isWithinDeadline: boolean;
  priorMoSeizureVerified: boolean;
  isAdmissible: boolean;
  isForeclosed: boolean;
  suspensionActive: boolean;
  contractSignatureLocked: boolean;
  admissibilityReasons: string[];
}

export interface FactualCrossCheckItem {
  grievance: string;
  verificationSource: 'PV_OUVERTURE' | 'RAPPORT_SCA' | 'EXPIRATION_PIECES' | 'REGISTRE_ARMP' | 'OFFRE_FINANCIERE';
  verdict: 'CONFIRME_GRIEF' | 'INFIRME_GRIEF' | 'A_VERIFIER_COMPLEMENT';
  evidenceDetails: string;
  legalImpact: 'AUCUN' | 'MINEUR' | 'CRITIQUE';
}

export interface DisputeAuditResult {
  disputeNumber: string;
  admissibility: AdmissibilityCheckResult;
  factualCrossCheck: FactualCrossCheckItem[];
  riskScore: DisputeRiskScore;
  recommendedDecision:
    | 'REJET_FORCLUSION'
    | 'REJET_AU_FOND_MOTIVE'
    | 'RECTIFICATION_MATERIELLE_SCA'
    | 'ANNULATION_ATTRIBUTION_REEXAMEN_CPM';
  legalSynthesis: string;
  legalCitations: string[];
  moResponseDraft: string;
  armpDefenseMemo: string;
  aiProviderUsed?: AiProviderId;
  auditedAtIso: string;
}

// ============================================================================
// 5. CONTEXTE DE DONNEES POUR AGENT / FUNCTION CALLING
// ============================================================================

export interface AiToolExecutionContext {
  entityId: string;
  entityName: string;
  entityType: EntityType;
  city: string;
  fiscalYear: number;
  actorUserId: string;
  actorRole: RbacRole;
  actorName: string;
  actorTitle: string;
  // Hooks optionnels vers Supabase ou stockage local IndexedDB (Jalon 4)
  persistAction?: (actionName: string, payload: Record<string, unknown>) => Promise<string | void>;
}

export interface AiToolExecutionResult {
  toolName: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  auditSummary: string;
}

export interface AgenticWorkflowResult {
  answer: string;
  providerUsed: AiProviderId;
  modelUsed: string;
  toolExecutions: AiToolExecutionResult[];
  iterations: number;
  isOfflineFallback: boolean;
}
