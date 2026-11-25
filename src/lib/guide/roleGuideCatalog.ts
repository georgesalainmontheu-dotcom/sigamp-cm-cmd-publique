import type { ActiveRoleProfile, WorkspaceSpaceId } from '../ui/demoProfiles';

export interface GuideStep {
  id: string;
  tag: string;
  title: string;
  explanation: string;
  actionTip: string;
  glossary?: Array<{ term: string; meaning: string }>;
}

const COMMON_TOPBAR_STEPS: GuideStep[] = [
  {
    id: 'topbar-entity',
    tag: 'topbar-entity-badge',
    title: 'Votre Institution Connectée',
    explanation:
      'Ce bandeau affiche votre mairie, préfecture ou organisme public. Vos dossiers sont isolés dans un espace privé : aucune autre institution ne peut les voir.',
    actionTip: 'Vérifiez toujours ce nom avant de créer un nouveau document officiel.',
    glossary: [
      {
        term: 'Multi-entités',
        meaning: 'Plusieurs institutions utilisent le même logiciel, chacune dans son coffre séparé.',
      },
    ],
  },
  {
    id: 'topbar-offline',
    tag: 'topbar-offline-sync',
    title: 'Travail Même Sans Internet (Hors-Ligne)',
    explanation:
      'Si la connexion coupe, vos brouillons restent enregistrés dans votre ordinateur ou téléphone et partent automatiquement sur le serveur dès que le réseau revient.',
    actionTip: 'En cas de coupure, continuez normalement puis cliquez ici pour synchroniser au retour du réseau.',
    glossary: [
      {
        term: 'IndexedDB / Hors-Ligne',
        meaning: 'Mémoire locale sécurisée de votre navigateur qui protège votre saisie sans Internet.',
      },
    ],
  },
  {
    id: 'topbar-ged',
    tag: 'topbar-ged-btn',
    title: 'GED Régalienne (Coffre-Fort Numérique)',
    explanation:
      'Ouvre la grande armoire numérique où tous les documents signés sont rangés et scellés avec une empreinte infalsifiable.',
    actionTip: 'Cliquez ici pour retrouver ou vérifier l’authenticité d’un document archivé.',
    glossary: [
      {
        term: 'GED & SHA-256',
        meaning: 'Classement officiel + empreinte mathématique prouvant qu’un PDF n’a jamais été modifié.',
      },
    ],
  },
  {
    id: 'topbar-factory',
    tag: 'topbar-factory-btn',
    title: 'Fabrique des 44 Actes & DTAO / DC',
    explanation:
      'Permet de générer en quelques clics vos 44 lettres administratives officielles et vos Dossiers d’Appel d’Offres en PDF ou Word avec votre logo.',
    actionTip: 'Utilisez ce bouton dès que vous devez rédiger une lettre type ou un cahier des charges.',
    glossary: [
      {
        term: 'DTAO / DC',
        meaning: 'Dossier Type d’Appel d’Offres / Demande de Cotation (version allégée pour petits montants).',
      },
    ],
  },
  {
    id: 'topbar-ai',
    tag: 'topbar-ai-btn',
    title: 'Copilote Juridique IA (Ctrl+K)',
    explanation:
      'Votre assistant intelligent qui répond à vos questions sur le Code des Marchés Publics et vous aide à rédiger sans faute juridique.',
    actionTip: 'Appuyez sur Ctrl+K ou cliquez ici pour poser une question en français courant.',
  },
];

const ROLE_SPECIFIC_STEPS: Record<WorkspaceSpaceId, GuideStep[]> = {
  SIGAMP_MO: [
    {
      id: 'sigamp-value-chain',
      tag: 'sigamp-tab-VALUE_CHAIN',
      title: '1. Chaîne de Valeur (Les 7 Étapes d’un Marché)',
      explanation:
        'Suivez ici tout le film d’un projet : de la première idée (Maturation) jusqu’au paiement final et à la réception des travaux.',
      actionTip: 'Sélectionnez un projet et cochez ou générez les pièces attendues étape par étape.',
      glossary: [
        {
          term: 'Maturation',
          meaning: 'Préparation sérieuse d’un projet (études, budget, terrain) avant de lancer l’appel d’offres.',
        },
      ],
    },
    {
      id: 'sigamp-projects',
      tag: 'sigamp-tab-PROJECTS',
      title: '2. Journal des Projets & Routage Commission',
      explanation:
        'Enregistrez un nouveau besoin (montant estimé, nature des travaux). Le logiciel calcule tout seul quelle Commission doit le traiter.',
      actionTip: 'Créez vos nouveaux projets ici pour que le système détermine le bon seuil légal.',
      glossary: [
        {
          term: 'CPM / CIPM',
          meaning: 'Commission de Passation des Marchés chargée d’examiner et attribuer le dossier.',
        },
      ],
    },
    {
      id: 'sigamp-dao',
      tag: 'sigamp-tab-DAO_TIMELINE',
      title: '3. Montage DAO & Calendrier Légal',
      explanation:
        'Calcule automatiquement la date d’ouverture des enveloppes et vérifie que les délais obligatoires de publicité sont respectés.',
      actionTip: 'Indiquez la date de publication pour obtenir les dates légales sans risque de recours.',
    },
    {
      id: 'sigamp-avenants',
      tag: 'sigamp-tab-AVENANTS_MED',
      title: '4. Avenants (Plafond 30%) & Mise en Demeure',
      explanation:
        'Contrôle que les ajouts à un contrat en cours ne dépassent jamais 30 % du prix initial, et prépare les avertissements officiels en cas de retard.',
      actionTip: 'Simulez toujours un avenant ici avant de le soumettre à la signature.',
      glossary: [
        {
          term: 'Avenant / Mise en demeure',
          meaning: 'Modification écrite d’un marché / Dernier avertissement officiel avant résiliation.',
        },
      ],
    },
    {
      id: 'sigamp-corresp',
      tag: 'sigamp-tab-CORRESPONDENCE',
      title: '5. Correspondances & Ordres de Service',
      explanation:
        'Préparez rapidement vos lettres officielles : ordre de démarrer les travaux (OS), notifications et convocations.',
      actionTip: 'Choisissez le modèle souhaité puis exportez en Word ou PDF.',
    },
    {
      id: 'sigamp-indemnities',
      tag: 'sigamp-tab-INDEMNITIES',
      title: '6. Calcul des Indemnités de Session',
      explanation:
        'Calcule automatiquement les frais de session des membres et rapporteurs de la Commission selon le barème réglementaire.',
      actionTip: 'Renseignez les séances tenues pour éditer l’état de liquidation.',
    },
  ],
  CPM_SCA_ARMP: [
    {
      id: 'cpm-main',
      tag: 'workspace-primary-panel',
      title: 'Espace Commission des Marchés & Analyse (CPM / SCA)',
      explanation:
        'C’est ici que vous enregistrez l’ouverture des plis des entreprises, saisissez les notes techniques et financières, et établissez le classement officiel.',
      actionTip: 'Vérifiez le seuil technique minimum avant de valider la proposition d’attribution.',
      glossary: [
        {
          term: 'SCA',
          meaning: 'Sous-Commission d’Analyse qui note en détail chaque offre technique et financière.',
        },
      ],
    },
  ],
  FINANCE_CF: [
    {
      id: 'finance-main',
      tag: 'workspace-primary-panel',
      title: 'Contrôle Financier, Cautions & Décomptes',
      explanation:
        'Contrôlez la disponibilité de l’argent au budget, visez les factures d’avancement (décomptes) et surveillez les garanties bancaires qui arrivent à expiration.',
      actionTip: 'Surveillez les alertes jaunes ou rouges sur les cautions avant de viser un paiement.',
      glossary: [
        {
          term: 'Décompte & Cautionnement',
          meaning: 'Facture partielle de chantier vérifiée / Garantie déposée à la banque par l’entreprise.',
        },
      ],
    },
  ],
  SOUMISSIONNAIRE: [
    {
      id: 'bidder-main',
      tag: 'workspace-primary-panel',
      title: 'Portail Entreprises & Dépôt des Offres',
      explanation:
        'Consultez les avis d’appel d’offres ouverts, téléchargez le dossier complet et déposez votre offre en ligne en recevant un reçu horodaté.',
      actionTip: 'Préparez séparément votre dossier administratif, technique et financier avant la clôture.',
    },
  ],
  CONTENTIEUX: [
    {
      id: 'dispute-main',
      tag: 'workspace-primary-panel',
      title: 'Contentieux, Recours & Arbitrage ARMP',
      explanation:
        'Enregistrez les plaintes ou contestations d’entreprises, suivez le compte à rebours du délai légal de réponse et générez la décision motivée.',
      actionTip: 'Respectez scrupuleusement le délai indiqué sur le badge pour éviter une suspension automatique.',
      glossary: [
        {
          term: 'ARMP',
          meaning: 'Agence de Régulation des Marchés Publics, l’arbitre national indépendant.',
        },
      ],
    },
  ],
};

export function getGuideStepsForContext(
  profile: ActiveRoleProfile,
  overlayMode: 'NONE' | 'GED' | 'FACTORY' | 'STUDIO'
): GuideStep[] {
  if (overlayMode === 'STUDIO') {
    return [
      {
        id: 'studio-main',
        tag: 'overlay-studio-root',
        title: 'Studio Visuel, 11 Modules CMS, Licences & Grand Reset',
        explanation:
          'Personnalisez le logo, les couleurs et les modèles de lettres de votre institution, suivez les alertes de licence (J-30 / J-15 / J-7) et pilotez la bascule en production.',
        actionTip: 'Cliquez sur « Publier / Appliquer immédiatement » après toute modification visuelle.',
        glossary: [
          {
            term: 'Studio & CMS',
            meaning: 'Atelier de mise en page et gestionnaire de textes types sans programmation.',
          },
          {
            term: 'Grand Reset & Mode Démo',
            meaning: 'Purge des dossiers d’essai avant démarrage réel + masquage réversible des démos.',
          },
        ],
      },
      ...COMMON_TOPBAR_STEPS,
    ];
  }

  if (overlayMode === 'FACTORY') {
    return [
      {
        id: 'factory-main',
        tag: 'overlay-factory-root',
        title: 'Fabrique des 44 Actes Officiels & Générateur DTAO / DC',
        explanation:
          'Choisissez un des 44 actes officiels ou composez un Dossier d’Appel d’Offres, remplissez les champs en français courant et exportez en PDF ou Word avec votre en-tête.',
        actionTip: 'Utilisez le sélecteur FR / EN pour générer un dossier bilingue en un clic.',
      },
      ...COMMON_TOPBAR_STEPS,
    ];
  }

  if (overlayMode === 'GED') {
    return [
      {
        id: 'ged-main',
        tag: 'overlay-ged-root',
        title: 'GED Régalienne — Coffre-Fort & Empreintes SHA-256',
        explanation:
          'Toutes les pièces signées et scellées apparaissent ici. Vous pouvez filtrer par année ou par marché et vérifier que personne n’a falsifié un document.',
        actionTip: 'Cliquez sur un document archivé pour contrôler son scellé numérique.',
      },
      ...COMMON_TOPBAR_STEPS,
    ];
  }

  const roleSteps = ROLE_SPECIFIC_STEPS[profile.spaceId] ?? [];
  const studioShortcut: GuideStep[] =
    profile.isPlatformSuperAdmin || profile.isEntityAdmin
      ? [
          {
            id: 'topbar-studio',
            tag: 'topbar-studio-btn',
            title: 'Studio & CMS V3.0 (Administrateurs)',
            explanation:
              'Votre poste de commande pour changer le logo, gérer les utilisateurs, contrôler les licences et lancer la Remise à Zéro ou le Mode Démo.',
            actionTip: 'Ouvrez ce menu pour accéder aux 11 modules CMS et aux alertes de licence.',
          },
        ]
      : [];

  return [...roleSteps, ...COMMON_TOPBAR_STEPS, ...studioShortcut];
}
