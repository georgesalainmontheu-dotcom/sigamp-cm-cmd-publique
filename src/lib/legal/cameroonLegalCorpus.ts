import type { LegalKnowledgeChunkMatch } from '../../types/ai';

export interface LegalCorpusArticle {
  id: string;
  sourceCode: string;
  sourceTitle: string;
  articleRef: string;
  domainTag: string;
  effectiveDate: string;
  content: string;
  keywords: string[];
}

/**
 * Corpus Juridique Complet de la Commande Publique Camerounaise (V2.0)
 * Exploitable hors-ligne (Local-First) et synchronisé avec `legal_knowledge_chunks` sur Supabase.
 * Couvre les 8 piliers : CMP 2018/366, CPM/CCCM 2013/271, MINMAP/ARMP 2012/075-076,
 * CGCTD 2019/024, Loi 2018/012 & CGI/MINFI, Circulaire 001/CAB/PM, Indemnités, OHADA & Sanctions.
 */
export const CAMEROON_LEGAL_CORPUS: LegalCorpusArticle[] = [
  {
    id: '77777777-7777-4777-8777-000000000001',
    sourceCode: 'CMP-2018-366',
    sourceTitle: 'Décret n° 2018/366 du 20 juin 2018 portant Code des Marchés Publics',
    articleRef: 'Art. 1-4',
    domainTag: 'PRINCIPES_GENERAUX',
    effectiveDate: '2018-06-20',
    content:
      "La commande publique obéit aux principes de liberté d'accès, d'égalité de traitement des candidats, de transparence des procédures, d'efficience et d'intégrité. Tout marché public donne lieu à un appel à la concurrence préalable, sauf dérogation légale expresse.",
    keywords: ['principes', 'transparence', 'egalite', 'concurrence', 'cmp', '2018/366'],
  },
  {
    id: '77777777-7777-4777-8777-000000000002',
    sourceCode: 'CMP-2018-366',
    sourceTitle: 'Décret n° 2018/366 portant Code des Marchés Publics',
    articleRef: 'Art. 10-12',
    domainTag: 'SEUILS_PASSATION',
    effectiveDate: '2018-06-20',
    content:
      'Classification selon les montants TTC : Bon de Commande Administratif (< 5 000 000 FCFA TTC), Lettre-Commande (>= 5 000 000 et < 50 000 000 FCFA TTC), Marché Public (>= 50 000 000 FCFA TTC). Aucun fractionnement artificiel des dépenses n’est toléré pour éluder les seuils.',
    keywords: ['seuil', 'bca', 'lettre-commande', 'marche', '5 millions', '50 millions', 'fractionnement'],
  },
  {
    id: '77777777-7777-4777-8777-000000000003',
    sourceCode: 'CMP-2018-366',
    sourceTitle: 'Décret n° 2018/366 portant Code des Marchés Publics',
    articleRef: 'Art. 73-84',
    domainTag: 'MODES_PASSATION',
    effectiveDate: '2018-06-20',
    content:
      "Les modes de passation comprennent l'Appel d'Offres National Ouvert (AONO), l'Appel d'Offres International Ouvert (AOIO), l'Appel d'Offres Restreint (AONR/AOIR précédé d'une préqualification), le Concours, la Demande de Cotation (< 30M FCFA pour fournitures/services courants), et le Gré à Gré soumis à autorisation préalable du MINMAP.",
    keywords: ['aono', 'aoio', 'aonr', 'cotation', 'gre a gre', 'asmi', 'minmap'],
  },
  {
    id: '77777777-7777-4777-8777-000000000004',
    sourceCode: 'CMP-2018-366',
    sourceTitle: 'Décret n° 2018/366 portant Code des Marchés Publics',
    articleRef: 'Art. 86-90',
    domainTag: 'PUBLICITE_ADDITIFS',
    effectiveDate: '2018-06-20',
    content:
      "L'Avis d'Appel d'Offres (AAO) est rédigé en français et en anglais (strict bilinguisme). Le délai minimal de publicité est de 21 à 25 jours pour un AONO (15 jours en urgence motivée) et 45 jours pour un AOIO. Tout additif substantiel ou publié à moins de 7 jours de la date limite d'ouverture entraîne obligatoirement une prorogation de délai.",
    keywords: ['aao', 'bilingue', 'publicite', 'additif', 'prorogation', '7 jours', 'dao'],
  },
  {
    id: '77777777-7777-4777-8777-000000000005',
    sourceCode: 'CMP-2018-366',
    sourceTitle: 'Décret n° 2018/366 portant Code des Marchés Publics',
    articleRef: 'Art. 91-95',
    domainTag: 'VALIDITE_OFFRES_CAUTIONS',
    effectiveDate: '2018-06-20',
    content:
      "La durée de validité des offres est fixée à 90 jours à compter de la date limite de dépôt. Le cautionnement de soumission (1% à 2% du montant prévisionnel) garantit le maintien de l'offre et doit être délivré par un établissement agréé COBAC sous forme de garantie autonome OHADA.",
    keywords: ['validite', '90 jours', 'caution soumission', 'cobac', 'ohada'],
  },
  {
    id: '77777777-7777-4777-8777-000000000006',
    sourceCode: 'CMP-2018-366',
    sourceTitle: 'Décret n° 2018/366 portant Code des Marchés Publics',
    articleRef: 'Art. 96-104',
    domainTag: 'OUVERTURE_EVALUATION_OAB',
    effectiveDate: '2018-06-20',
    content:
      "Tout pli déposé après l'heure limite est rejeté sans ouverture. L'évaluation par la SCA suit trois phases étanches : conformité administrative, notation technique, puis ouverture financière des seules offres techniquement qualifiées. Une Offre Anormalement Basse (OAB) impose une demande écrite de sous-détails de prix.",
    keywords: ['ouverture', 'plis', 'sca', 'oab', 'anormalement basse', 'devis confidentiel', 'sous-details'],
  },
  {
    id: '77777777-7777-4777-8777-000000000007',
    sourceCode: 'CMP-2018-366',
    sourceTitle: 'Décret n° 2018/366 portant Code des Marchés Publics',
    articleRef: 'Art. 105-110',
    domainTag: 'ATTRIBUTION_STANDSTILL',
    effectiveDate: '2018-06-20',
    content:
      "La décision d'attribution est publiée et notifiée simultanément à l'attributaire et aux candidats non retenus avec motifs précis. Un délai d'attente (standstill) de 5 jours ouvrables doit être respecté avant la signature du contrat.",
    keywords: ['attribution', 'notification', 'standstill', '5 jours ouvrables', 'signature'],
  },
  {
    id: '77777777-7777-4777-8777-000000000008',
    sourceCode: 'CMP-2018-366',
    sourceTitle: 'Décret n° 2018/366 portant Code des Marchés Publics',
    articleRef: 'Art. 111-118',
    domainTag: 'CONTRACTUALISATION_SURETES',
    effectiveDate: '2018-06-20',
    content:
      "Le titulaire fournit un cautionnement définitif de bonne exécution (2% à 5% TTC) dans les 20 jours suivant notification, une caution d'avance de démarrage couvrant 100% de l'avance (max 20%), et subit une retenue de garantie de 10% (remplaçable par une caution bancaire).",
    keywords: ['bonne execution', 'avance demarrage', 'retenue garantie', '10%', 'cautionnement'],
  },
  {
    id: '77777777-7777-4777-8777-000000000009',
    sourceCode: 'CMP-2018-366',
    sourceTitle: 'Décret n° 2018/366 portant Code des Marchés Publics',
    articleRef: 'Art. 119-123',
    domainTag: 'AVENANTS',
    effectiveDate: '2018-06-20',
    content:
      'Les modifications donnent lieu à avenant après avis CPM/CCCM. Le montant cumulé des avenants ne peut dépasser 30% du montant du marché de base, sauf dérogation exceptionnelle du MINMAP.',
    keywords: ['avenant', '30%', 'plafond', 'derogation', 'minmap'],
  },
  {
    id: '77777777-7777-4777-8777-000000000010',
    sourceCode: 'CMP-2018-366',
    sourceTitle: 'Décret n° 2018/366 portant Code des Marchés Publics',
    articleRef: 'Art. 166-170',
    domainTag: 'PENALITES_RESILIATION',
    effectiveDate: '2018-06-20',
    content:
      "Pénalités de retard : 1/2000e par jour du 1er au 30e jour de retard net, puis 1/1000e à compter du 31e jour, plafonnées à 10%. La résiliation aux torts exclusifs exige une mise en demeure préalable (15 à 21 jours), la confiscation des cautions et la saisine de l'ARMP.",
    keywords: ['penalite', '1/2000', '1/1000', 'resiliation', 'mise en demeure', '15', '21 jours'],
  },
  {
    id: '77777777-7777-4777-8777-000000000011',
    sourceCode: 'CMP-2018-366',
    sourceTitle: 'Décret n° 2018/366 portant Code des Marchés Publics',
    articleRef: 'Art. 155-164',
    domainTag: 'RECEPTIONS_GARANTIES',
    effectiveDate: '2018-06-20',
    content:
      "La réception provisoire est prononcée par la commission ad hoc. En cas de réserves, un délai de levée est fixé et bloque la libération de la caution de bonne exécution. La réception définitive intervient à l'expiration du délai de garantie (6 mois à 1 an) et entraîne la mainlevée de la retenue de garantie (10%).",
    keywords: ['reception provisoire', 'reception definitive', 'reserves', 'garantie', 'mainlevee'],
  },
  {
    id: '77777777-7777-4777-8777-000000000012',
    sourceCode: 'CMP-2018-366',
    sourceTitle: 'Décret n° 2018/366 portant Code des Marchés Publics',
    articleRef: 'Art. 171-178',
    domainTag: 'CONTENTIEUX',
    effectiveDate: '2018-06-20',
    content:
      "Tout candidat lésé saisit préalablement le Maître d'Ouvrage dans un délai de 5 jours ouvrables, puis l'ARMP le cas échéant. Le recours recevable en phase de passation suspend automatiquement la signature du marché.",
    keywords: ['recours', 'contentieux', 'forclusion', '5 jours ouvrables', 'suspensif', 'armp'],
  },
  {
    id: '77777777-7777-4777-8777-000000000013',
    sourceCode: 'DEC-2013-271',
    sourceTitle:
      'Décret n° 2012/074 modifié par le Décret n° 2013/271 relatif aux Commissions des Marchés',
    articleRef: 'Art. 3-18',
    domainTag: 'COMMISSIONS_PASSATION',
    effectiveDate: '2013-08-05',
    content:
      "Les Commissions Internes (CIPM), Régionales (CRPM) et Départementales (CDPM) assurent l'ouverture des plis, désignent les Sous-Commissions d'Analyse (SCA) et proposent l'attribution, avec feuille de présence émargée et Observateur Indépendant ARMP.",
    keywords: ['cipm', 'crpm', 'cdpm', 'commission', 'quorum', 'observateur armp'],
  },
  {
    id: '77777777-7777-4777-8777-000000000014',
    sourceCode: 'DEC-2013-271',
    sourceTitle: 'Décret n° 2012/074 modifié par le Décret n° 2013/271 relatif aux CCCM',
    articleRef: 'Art. 19-32',
    domainTag: 'CCCM_AVIS_CONFORME',
    effectiveDate: '2013-08-05',
    content:
      "Les CCCM (CCCM-TR Travaux >= 500M, CCCM-AG Fournitures >= 250M, CCCM-SPI Services/PI >= 100M, CCCM-FC) émettent un avis conforme préalable sur le DAO, l'attribution et les avenants.",
    keywords: ['cccm', 'cccm-tr', 'cccm-ag', 'cccm-spi', 'cccm-fc', 'avis conforme'],
  },
  {
    id: '77777777-7777-4777-8777-000000000015',
    sourceCode: 'DEC-2012-075',
    sourceTitle: 'Décret n° 2012/075 portant organisation du MINMAP',
    articleRef: 'Art. 1-14',
    domainTag: 'MINMAP_TUTELLE',
    effectiveDate: '2012-03-08',
    content:
      "Le MINMAP délivre les autorisations préalables de gré à gré, accorde les dérogations pour avenants > 30%, et contrôle l'exécution des marchés.",
    keywords: ['minmap', 'autorisation', 'derogation', 'controle'],
  },
  {
    id: '77777777-7777-4777-8777-000000000016',
    sourceCode: 'DEC-2012-076',
    sourceTitle: "Décret n° 2012/076 portant organisation de l'ARMP",
    articleRef: 'Art. 1-20',
    domainTag: 'ARMP_REGULATION',
    effectiveDate: '2012-03-08',
    content:
      "L'ARMP assure la régulation, le déploiement des Observateurs Indépendants, la liste des entreprises exclues, et l'instruction des recours au Comité de Règlement des Différends (CRD).",
    keywords: ['armp', 'regulation', 'crd', 'exclusion', 'observateur'],
  },
  {
    id: '77777777-7777-4777-8777-000000000017',
    sourceCode: 'LOI-2019-024-CGCTD',
    sourceTitle:
      'Loi n° 2019/024 portant Code Général des Collectivités Territoriales Décentralisées',
    articleRef: 'Art. 72-88',
    domainTag: 'CGCTD_TUTELLE',
    effectiveDate: '2019-12-24',
    content:
      "Les marchés des Communes, Communautés Urbaines et Régions sont soumis au contrôle de légalité du représentant de l'État (Préfet ou Gouverneur) et au visa du Receveur Municipal/Régional.",
    keywords: ['cgctd', 'commune', 'region', 'prefet', 'gouverneur', 'tutelle', 'receveur'],
  },
  {
    id: '77777777-7777-4777-8777-000000000018',
    sourceCode: 'LOI-2018-012-FIN',
    sourceTitle:
      "Loi n° 2018/012 portant Régime Financier de l'État et des autres Entités Publiques",
    articleRef: 'Art. 45-62',
    domainTag: 'FINANCES_ENGAGEMENT',
    effectiveDate: '2018-07-11',
    content:
      'Aucune dépense ne peut être notifiée ni exécutée sans engagement comptable préalable et visa du Contrôleur Financier sur la ligne budgétaire concernée.',
    keywords: ['controleur financier', 'visa', 'engagement', 'budget', 'chapitre', 'article'],
  },
  {
    id: '77777777-7777-4777-8777-000000000019',
    sourceCode: 'CGI-MINFI-CM',
    sourceTitle: "Code Général des Impôts & Circulaire d'exécution budgétaire MINFI",
    articleRef: 'Art. 149-151 & 92bis',
    domainTag: 'FISCALITE_DECOMPTES',
    effectiveDate: '2025-01-01',
    content:
      "TVA 19,25% retenue à la source ; AIR 2,2% (réel + non-redevance) ou 5,5% (simplifié) ; TSR 15% (non-résidents) ; Droits d'Enregistrement 2% (Marchés) ou 5% (Lettre-Commande/BCA selon nature).",
    keywords: ['tva', '19.25', 'air', '2.2', '5.5', 'tsr', '15%', 'enregistrement', 'decompte', 'cgi'],
  },
  {
    id: '77777777-7777-4777-8777-000000000020',
    sourceCode: 'CIRC-001-CAB-PM',
    sourceTitle: 'Circulaire n° 001/CAB/PM & Directives MINEPAT sur la Maturation des Projets',
    articleRef: 'Points 1-4',
    domainTag: 'MATURATION',
    effectiveDate: '2021-01-15',
    content:
      "Le lancement exige un dossier complet de maturation : Études APS/APD ou TDR, Acte de disponibilité du site/emprise foncière, Estimation Mercuriale, et Notice/Étude EIES.",
    keywords: ['maturation', 'aps', 'apd', 'tdr', 'disponibilite', 'foncier', 'mercuriale', 'eies', 'minepat'],
  },
  {
    id: '77777777-7777-4777-8777-000000000021',
    sourceCode: 'TEXTE-INDEMNITES-CM',
    sourceTitle:
      'Régime des Indemnités de Session et Frais de Mission (CPM, SCA, SIGAMP, Réceptions, ARMP)',
    articleRef: 'Barème Session',
    domainTag: 'INDEMNITES',
    effectiveDate: '2019-03-01',
    content:
      "Les indemnités sont strictement subordonnées à l'émargement sur la feuille de présence de chaque séance, plafonnées et soumises à retenue fiscale et visa CF.",
    keywords: ['indemnites', 'emargement', 'feuille de presence', 'sigamp', 'mission', 'reception'],
  },
  {
    id: '77777777-7777-4777-8777-000000000022',
    sourceCode: 'OHADA-AUS-SURETES',
    sourceTitle: 'Acte Uniforme OHADA portant Organisation des Sûretés',
    articleRef: 'Art. 39-49',
    domainTag: 'SURETES_OHADA',
    effectiveDate: '2011-05-16',
    content:
      'Les cautions bancaires sont des garanties autonomes à première demande irrévocables émises par un établissement agréé COBAC.',
    keywords: ['ohada', 'suretes', 'garantie autonome', 'premiere demande', 'caution'],
  },
  {
    id: '77777777-7777-4777-8777-000000000023',
    sourceCode: 'CIRC-00000001-MINMAP',
    sourceTitle: 'Circulaire n° 00000001/PR/MINMAP/CAB relative aux sanctions des titulaires défaillants',
    articleRef: 'Procédure Exclusion',
    domainTag: 'SANCTIONS_ARMP',
    effectiveDate: '2017-04-10',
    content:
      "Mise en demeure 15 à 21 jours, PV de carence, résiliation aux torts exclusifs, saisie des cautions et transmission à l'ARMP pour suspension ou exclusion définitive.",
    keywords: ['sanction', 'exclusion', 'carence', 'resiliation', 'armp'],
  },
  {
    id: '77777777-7777-4777-8777-000000000024',
    sourceCode: 'CMP-2018-366',
    sourceTitle: "Décret n° 2018/366 — Ingénieur du Marché & Chef de Service du Marché",
    articleRef: 'Art. 125-132',
    domainTag: 'INGENIEUR_CHEF_SERVICE',
    effectiveDate: '2018-06-20',
    content:
      "Le Maître d'Ouvrage désigne un Chef de Service du Marché (supervision administrative, OS) et un Ingénieur du Marché (CCTP, Devis Confidentiel, attachements et décomptes).",
    keywords: ['ingenieur du marche', 'chef de service', 'cctp', 'devis confidentiel', 'attachement'],
  },
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

/**
 * Moteur RAG Juridique Local-First (fonctionne hors-ligne et sans appel API externe).
 */
export function searchLocalLegalCorpus(
  query: string,
  options?: { domainTag?: string; limit?: number }
): LegalKnowledgeChunkMatch[] {
  const queryTokens = new Set(tokenize(query));
  const limit = options?.limit ?? 4;

  const scored = CAMEROON_LEGAL_CORPUS.filter(
    (entry) => !options?.domainTag || entry.domainTag === options.domainTag
  ).map((entry) => {
    const haystackTokens = new Set([
      ...tokenize(entry.content),
      ...tokenize(entry.sourceTitle),
      ...entry.keywords.flatMap((k) => tokenize(k)),
    ]);

    let matches = 0;
    for (const qt of queryTokens) {
      if (haystackTokens.has(qt)) matches += 1;
    }

    const similarity =
      queryTokens.size > 0
        ? Math.min(0.99, Number((0.45 + (matches / queryTokens.size) * 0.54).toFixed(4)))
        : 0.5;

    return {
      entry,
      matches,
      similarity,
    };
  });

  scored.sort((a, b) => b.matches - a.matches || b.similarity - a.similarity);

  return scored.slice(0, limit).map(({ entry, similarity }) => ({
    id: entry.id,
    sourceCode: entry.sourceCode,
    sourceTitle: entry.sourceTitle,
    articleRef: entry.articleRef,
    domainTag: entry.domainTag,
    content: entry.content,
    similarity,
  }));
}
