import os
from pathlib import Path
from playwright.sync_api import sync_playwright

HTML_CONTENT = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<title>SIGAMP-CM — Manuel Utilisateur Complet (Langage Courant)</title>
<style>
  @page {
    size: A4;
    margin: 18mm 15mm 18mm 15mm;
    @top-left {
      content: "SIGAMP-CM • Manuel Utilisateur Complet (Langage Courant)";
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 8pt;
      color: #64748b;
    }
    @top-right {
      content: "TIT-Consulting Solutions (TIT-CS)";
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 8pt;
      color: #64748b;
    }
    @bottom-left {
      content: "Conforme Décret N° 2018/366 (Code des Marchés Publics) & Circulaire 2026";
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 8pt;
      color: #64748b;
    }
    @bottom-right {
      content: "Page " counter(page) " / " counter(pages);
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 8pt;
      font-weight: bold;
      color: #0A1F3D;
    }
  }
  @page :first {
    @top-left { content: none; }
    @top-right { content: none; }
  }
  body {
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    color: #1e293b;
    font-size: 10pt;
    line-height: 1.52;
    margin: 0;
  }
  .cover {
    background: linear-gradient(135deg, #0A1F3D 0%, #123363 100%);
    color: white;
    padding: 34px 30px;
    border-radius: 14px;
    border-bottom: 6px solid #D4AF37;
    page-break-after: always;
  }
  .cover .badge {
    display: inline-block;
    background: rgba(212, 175, 55, 0.2);
    border: 1px solid #D4AF37;
    color: #FDE68A;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
  }
  .cover h1 {
    font-size: 26pt;
    margin: 18px 0 8px 0;
    line-height: 1.15;
    color: #ffffff;
  }
  .cover h2 {
    font-size: 13pt;
    font-weight: 400;
    color: #cbd5e1;
    margin: 0 0 22px 0;
  }
  .cover-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 20px;
  }
  .cover-card {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.16);
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 9pt;
  }
  .cover-card strong {
    color: #D4AF37;
    display: block;
    margin-bottom: 4px;
  }
  h2.section-title {
    color: #0A1F3D;
    border-left: 5px solid #D4AF37;
    padding-left: 10px;
    font-size: 14.5pt;
    margin: 22px 0 10px 0;
    page-break-after: avoid;
  }
  h3.sub-title {
    color: #0F2F5B;
    font-size: 11.5pt;
    margin: 14px 0 6px 0;
    page-break-after: avoid;
  }
  p { margin: 0 0 8px 0; }
  ul, ol { margin: 4px 0 10px 0; padding-left: 20px; }
  li { margin-bottom: 4px; }
  .callout {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-left: 4px solid #0A1F3D;
    border-radius: 8px;
    padding: 10px 13px;
    margin: 10px 0;
    page-break-inside: avoid;
  }
  .callout.gold {
    background: #fffbeb;
    border-color: #fde68a;
    border-left-color: #D4AF37;
  }
  .callout.green {
    background: #ecfdf5;
    border-color: #a7f3d0;
    border-left-color: #059669;
  }
  .callout strong { color: #0A1F3D; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 14px 0;
    font-size: 9pt;
  }
  th {
    background: #0A1F3D;
    color: #D4AF37;
    text-align: left;
    padding: 7px 9px;
    font-weight: 700;
  }
  td {
    border: 1px solid #cbd5e1;
    padding: 6px 9px;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #f8fafc; }
  .role-pill {
    display: inline-block;
    background: #0A1F3D;
    color: #D4AF37;
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 8pt;
    font-weight: 700;
  }
  .tag-code {
    font-family: Consolas, monospace;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 8.5pt;
    color: #0f172a;
  }
  .page-break { page-break-before: always; }
</style>
</head>
<body>

<div class="cover">
  <span class="badge">Manuel Officiel &bull; Édition V3.0 Production</span>
  <h1>SIGAMP-CM<br/>Guide Complet de l’Utilisateur</h1>
  <h2>Système Intégré de Gestion des Actes et des Marchés Publics du Cameroun — Rédigé en langage simple et courant pour tous les acteurs</h2>
  <p style="font-size:10pt;color:#e2e8f0;">
    Ce document a été conçu par un collège pluridisciplinaire d’experts (Maîtrise d’Ouvrage, Ingénierie SIGAMP, Commission des Marchés, Contrôle Financier, Soumissionnaires et Architecte Plateforme) afin que <strong>toute personne, même non informaticienne</strong>, puisse maîtriser la plateforme dès sa première connexion. Chaque terme technique ou juridique y est traduit en mots simples.
  </p>
  <div class="cover-grid">
    <div class="cover-card">
      <strong>Public concerné</strong>
      Maires, Préfets, Gouverneurs, Chefs de service SIGAMP, Présidents et membres CPM/SCA, Contrôleurs Financiers, Receveurs, Entreprises soumissionnaires et Super Administrateur TIT-CS.
    </div>
    <div class="cover-card">
      <strong>Ce que vous allez apprendre</strong>
      1. Se connecter à son institution<br/>
      2. Suivre un marché de l’idée au paiement<br/>
      3. Produire les 44 Actes &amp; DTAO/DC<br/>
      4. Comprendre chaque mot technique sans jargon
    </div>
    <div class="cover-card">
      <strong>Assistant Robot Intégré</strong>
      Dans l’application, le robot interactif « SIGAMP-Bot » se déplace sur votre écran et vous montre directement où cliquer selon votre rôle !
    </div>
    <div class="cover-card">
      <strong>Cadre réglementaire</strong>
      Décret N° 2018/366 du 20 juin 2018 portant Code des Marchés Publics et textes d’application ARMP / MINMAP en vigueur.
    </div>
  </div>
</div>

<h2 class="section-title">1. À quoi sert SIGAMP-CM ? (L’idée en 1 minute)</h2>
<p>
  Imaginez tout le parcours d’un projet public — par exemple <em>construire une salle de classe</em> ou <em>réhabiliter une route communale</em> — depuis le premier papier qui exprime le besoin jusqu’au dernier paiement de l’entreprise qui a fait les travaux.
</p>
<p>
  Dans le passé, ces dossiers circulaient uniquement en papier entre plusieurs bureaux, avec des risques d’oubli de délais, d’erreurs de calcul ou de perte de documents. <strong>SIGAMP-CM rassemble tout ce travail dans un seul logiciel sécurisé</strong> : chaque acteur voit uniquement ce qui concerne sa mission, produit les lettres et dossiers officiels aux bons formats (Word ou PDF avec l’en-tête de son institution), et archive automatiquement les pièces signées dans un coffre-fort numérique infalsifiable.
</p>

<div class="callout gold">
  <strong>Le principe d’or à retenir :</strong> personne n’a besoin de tout connaître ! Une fois connecté, vous arrivez automatiquement dans <strong>votre espace de travail</strong> (Mairie/SIGAMP, Commission des Marchés, Finance, Entreprise ou Contentieux), et le robot guide à l’écran ne vous montre que les boutons utiles pour votre poste.
</div>

<h2 class="section-title">2. Les 6 profils d’utilisateurs : qui fait quoi ?</h2>
<table>
  <thead>
    <tr>
      <th>Espace dans le logiciel</th>
      <th>Personnes concernées dans la vraie vie</th>
      <th>Ce qu’elles font dans SIGAMP-CM</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><span class="role-pill">MO / SIGAMP</span></td>
      <td>Maire, Préfet, Gouverneur, Délégué, Chef SIGAMP, Services techniques</td>
      <td>Créent les projets, préparent les études, rédigent les dossiers d’appel d’offres, suivent les chantiers, gèrent les avenants, rédigent les correspondances et liquident les indemnités de session.</td>
    </tr>
    <tr>
      <td><span class="role-pill">Commission CPM / SCA</span></td>
      <td>Président de Commission, Rapporteur, Membres et Sous-Commission d’Analyse</td>
      <td>Reçoivent les offres des entreprises, enregistrent les séances de dépouillement (ouverture des plis), notent les dossiers techniques et financiers, et proposent le candidat retenu.</td>
    </tr>
    <tr>
      <td><span class="role-pill">Finance &amp; Contrôle</span></td>
      <td>Contrôleur Financier, Receveur Municipal, Comptable</td>
      <td>Vérifient que l’argent est bien disponible dans le budget avant d’engager le marché, visent les paiements (décomptes), surveillent les garanties bancaires (cautions) et les pénalités de retard.</td>
    </tr>
    <tr>
      <td><span class="role-pill">Soumissionnaire</span></td>
      <td>Entreprises, Bureaux d’études, Prestataires</td>
      <td>Consultent les avis d’appel d’offres publiés, téléchargent les dossiers, préparent et déposent leur offre en ligne en recevant un reçu horodaté.</td>
    </tr>
    <tr>
      <td><span class="role-pill">Contentieux &amp; ARMP</span></td>
      <td>Maître d’Ouvrage, Juriste, Régulateur ARMP</td>
      <td>Enregistrent les recours (plaintes) des candidats ou les blocages d’exécution, comptent les jours de délai légal de réponse et génèrent les décisions motivées.</td>
    </tr>
    <tr>
      <td><span class="role-pill">Admin / Super Admin</span></td>
      <td>Administrateur d’entité ou TIT-CS</td>
      <td>Personnalisent le logo, les couleurs et les modèles de documents dans <strong>Studio &amp; CMS</strong>, gèrent les comptes utilisateurs, les licences et la remise à zéro avant mise en production.</td>
    </tr>
  </tbody>
</table>

<div class="page-break"></div>

<h2 class="section-title">3. Pas à pas : démarrer sur la plateforme</h2>

<h3 class="sub-title">Étape 1 : Se connecter sur la bonne institution</h3>
<ol>
  <li>Ouvrez l’adresse du portail dans votre navigateur (ordinateur, tablette ou téléphone).</li>
  <li>Dans la liste <strong>« Entité publique »</strong>, choisissez votre institution (ex. : Commune, Préfecture, Ministère…).</li>
  <li>Saisissez votre <strong>adresse email</strong> (ou votre identifiant court pour les administrateurs) et votre <strong>mot de passe</strong>.</li>
  <li>Cliquez sur <strong>« Se connecter »</strong>. Si vous voyez un message indiquant que la licence est expirée ou que votre compte n’est pas rattaché à cette entité, contactez votre administrateur ou TIT-CS.</li>
</ol>

<h3 class="sub-title">Étape 2 : Comprendre la barre du haut (toujours visible)</h3>
<p>En haut de votre écran, vous retrouvez à tout moment les 5 repères essentiels :</p>
<ul>
  <li><strong>Logo et nom de votre institution</strong> : confirme dans quelle entité vous travaillez (impossible de mélanger deux mairies).</li>
  <li><strong>Indicateur de connexion &amp; Hors-Ligne</strong> : vert quand Internet est disponible. Si la connexion coupe en plein travail, vous pouvez continuer : vos brouillons sont gardés en sécurité dans votre navigateur et envoyés automatiquement dès le retour d’Internet.</li>
  <li><strong>44 Actes &amp; DTAO / DC</strong> : ouvre le générateur automatique des 44 lettres officielles et dossiers types.</li>
  <li><strong>GED Régalienne</strong> : ouvre le coffre-fort numérique contenant toutes les pièces archivées et scellées.</li>
  <li><strong>Copilote IA (Ctrl+K)</strong> : un assistant juridique intelligent qui vous aide à rédiger ou vérifier un texte selon le Code des Marchés Publics.</li>
  <li><strong>Bouton du Robot Guide</strong> (en bas à droite) : réveille ou masque le petit robot animé qui vous guide pas à pas à l’écran.</li>
</ul>

<h2 class="section-title">4. Guide détaillé de chaque espace de travail</h2>

<h3 class="sub-title">A. Espace Maître d’Ouvrage &amp; SIGAMP (6 onglets)</h3>
<ol>
  <li><strong>Chaîne de Valeur Intégrale (7 Étapes)</strong> : C’est le tableau de bord complet d’un marché. Vous y suivez chaque projet étape par étape : <em>1. Maturation → 2. Programmation → 3. Passation → 4. Attribution → 5. Signature &amp; Engagement → 6. Exécution → 7. Clôture &amp; Réception</em>. Tant que les pièces obligatoires d’une étape ne sont pas prêtes, le logiciel vous le signale clairement.</li>
  <li><strong>Journal des Projets &amp; Routage CMP</strong> : Sert à enregistrer un nouveau besoin (nom du projet, montant estimé, source de financement). Selon le montant en FCFA, le logiciel calcule automatiquement si le dossier passe en Demande de Cotation, en Appel d’Offres devant la CIPM, ou en seuil supérieur.</li>
  <li><strong>Montage DAO &amp; Délais / Additifs</strong> : Calcule les dates limites légales de publication, d’ouverture des plis et de report éventuel (additif) pour éviter tout vice de procédure.</li>
  <li><strong>Avenants (30%) &amp; Mise en Demeure</strong> : Lorsque des travaux imprévus surviennent, vous saisissez le montant de l’avenant : le logiciel bloque ou alerte automatiquement si le cumul dépasse le plafond légal de <strong>30 %</strong> du marché initial. Vous pouvez aussi générer une lettre officielle de mise en demeure si l’entreprise abandonne le chantier ou prend du retard.</li>
  <li><strong>Correspondances &amp; Actes</strong> : Prépare en un clic les lettres officielles (Ordre de service de démarrer, notification d’attribution, convocation de commission…).</li>
  <li><strong>Liquidation Indemnités</strong> : Calcule automatiquement les indemnités de session des membres et experts de la commission selon le barème officiel.</li>
</ol>

<h3 class="sub-title">B. Espace Commission (CPM / SCA)</h3>
<p>
  Cet espace est dédié au travail de la Commission de Passation et de sa Sous-Commission d’Analyse :
</p>
<ul>
  <li>Enregistrez la date et l’heure d’ouverture des plis et la liste des candidats présents.</li>
  <li>Saisissez les notes administratives, techniques (note sur 100, seuil de qualification) et financières.</li>
  <li>Le système classe les soumissionnaires de façon transparente et génère le procès-verbal d’analyse et la proposition d’attribution sans erreur de calcul.</li>
</ul>

<h3 class="sub-title">C. Espace Finance &amp; Contrôle Financier</h3>
<p>
  Le Contrôleur Financier et le Receveur vérifient la régularité budgétaire :
</p>
<ul>
  <li>Contrôle de disponibilité des crédits avant la signature du marché.</li>
  <li>Vérification et visa des décomptes (factures d’avancement des travaux).</li>
  <li>Calcul automatique des <strong>retenues de garantie</strong>, des <strong>pénalités de retard</strong> et alerte quand une caution bancaire approche de sa date d’expiration.</li>
</ul>

<div class="page-break"></div>

<h3 class="sub-title">D. Portail Soumissionnaire (Entreprises)</h3>
<ul>
  <li>Liste des avis d’appels d’offres ouverts pour l’institution sélectionnée.</li>
  <li>Téléchargement du dossier d’appel d’offres (DAO / DC).</li>
  <li>Dépôt sécurisé des offres administrative, technique et financière avec attestation de dépôt horodatée.</li>
</ul>

<h3 class="sub-title">E. Fabrique Documentaire (44 Actes &amp; DTAO / DC)</h3>
<p>
  C’est ici que se fabriquent les documents officiels prêts à imprimer ou à signer :
</p>
<ul>
  <li><strong>44 Actes Administratifs</strong> : choisissez un acte (de l’acte n°1 jusqu’à l’acte n°44 : arrêtés, décisions, lettres de convocation, ordres de service, procès-verbaux, certificats de mainlevée…), remplissez les champs en français simple, puis exportez en <strong>PDF</strong> ou en <strong>Word (.docx)</strong> avec automatiquement le logo, la devise et les signatures de votre institution.</li>
  <li><strong>Générateur DTAO / DC</strong> : composez les pièces maîtresses d’un dossier d’appel d’offres (Avis d’Appel d’Offres, Règlement Particulier, CCTP, Cadre du Devis…) en choisissant la langue (Français ou Anglais).</li>
  <li><strong>Bibliothèque Juridique ARMP</strong> : consultez à tout moment les textes de loi et circulaires officiels indexés dans la plateforme.</li>
</ul>

<h3 class="sub-title">F. GED Régalienne (Le Coffre-Fort Numérique)</h3>
<p>
  Chaque document marqué « Signé &amp; Archivé » est enregistré dans la GED avec une <strong>empreinte numérique unique (SHA-256)</strong>. C’est l’équivalent d’une empreinte digitale : si quelqu’un modifie ne serait-ce qu’une virgule dans le fichier, la vérification le détecte immédiatement. Les documents y sont classés par exercice budgétaire, par marché et par statut.
</p>

<h3 class="sub-title">G. Studio &amp; CMS V3.0, Licences et Remise à Zéro (Administrateurs)</h3>
<ul>
  <li><strong>Studio Visuel</strong> : permet de placer le vrai logo de la Mairie/Préfecture/Institution, choisir les couleurs officielles, rédiger l’en-tête bilingue (République du Cameroun / Paix-Travail-Patrie) et le pied de page, et voir le rendu exact avant de publier.</li>
  <li><strong>11 Modules CMS</strong> : permettent de personnaliser sans programmer les textes modèles des 44 actes, les membres de la commission, les seuils de validation, le répertoire des prestataires, et la politique d’archivage GED.</li>
  <li><strong>Vente &amp; Gestion des Licences</strong> : suit la durée de validité de l’abonnement de chaque entité, déclenche les alertes préventives avant expiration (à 30 jours, 15 jours, 7 jours et 1 jour) et prépare les emails de relance. En cas d’expiration, les anciens dossiers restent lisibles mais la création de nouveaux actes est verrouillée jusqu’au renouvellement.</li>
  <li><strong>Remise à Zéro &amp; Mode Démo Réversible</strong> : permet au Super Administrateur de vider les dossiers de test avant la vraie mise en production, ou de masquer/réactiver instantanément les comptes de démonstration sans jamais perdre la configuration, les logos ou les licences.</li>
</ul>

<div class="page-break"></div>

<h2 class="section-title">5. Dictionnaire complet en langage courant (Tous les termes techniques expliqués)</h2>
<p>
  Pas de panique devant les sigles ou mots informatiques ! Voici la traduction simple de chaque terme que vous rencontrerez dans SIGAMP-CM :
</p>

<table>
  <thead>
    <tr>
      <th style="width:24%;">Terme ou Sigle</th>
      <th style="width:26%;">Ce que ça veut dire en entier</th>
      <th style="width:50%;">Explication en langage simple (comme dans la vie courante)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>SIGAMP-CM</strong></td>
      <td>Système Intégré de Gestion des Actes et des Marchés Publics du Cameroun</td>
      <td>Le nom complet de ce logiciel qui gère toutes les étapes d’un marché public au Cameroun.</td>
    </tr>
    <tr>
      <td><strong>MO / MOD</strong></td>
      <td>Maître d’Ouvrage / Maître d’Ouvrage Délégué</td>
      <td>L’institution publique (Maire, Ministre, Préfet, Directeur) qui commande les travaux ou achats et en est responsable.</td>
    </tr>
    <tr>
      <td><strong>SIGAMP (Service)</strong></td>
      <td>Service Interne de Gestion Administrative des Marchés Publics</td>
      <td>Le bureau spécialisé à l’intérieur de l’institution qui prépare les dossiers de marchés et veille au respect des délais.</td>
    </tr>
    <tr>
      <td><strong>CPM / CIPM / CRPM / CCPM</strong></td>
      <td>Commission de Passation des Marchés (Interne, Régionale, Centrale)</td>
      <td>Le jury officiel qui ouvre les enveloppes des entreprises, compare les offres et propose qui doit gagner le marché.</td>
    </tr>
    <tr>
      <td><strong>SCA</strong></td>
      <td>Sous-Commission d’Analyse</td>
      <td>L’équipe d’experts techniques chargée par la Commission de lire en détail chaque dossier d’entreprise et de lui donner une note.</td>
    </tr>
    <tr>
      <td><strong>ARMP</strong></td>
      <td>Agence de Régulation des Marchés Publics</td>
      <td>L’arbitre national indépendant qui surveille la bonne application des règles, forme les acteurs et juge les recours.</td>
    </tr>
    <tr>
      <td><strong>DAO / DTAO / DC</strong></td>
      <td>Dossier d’Appel d’Offres / Dossier Type / Demande de Cotation</td>
      <td>Le cahier complet envoyé aux entreprises qui explique ce qu’on veut acheter ou construire et comment elles doivent répondre. La DC est la version allégée pour les petits montants.</td>
    </tr>
    <tr>
      <td><strong>CCTP</strong></td>
      <td>Cahier des Clauses Techniques Particulières</td>
      <td>La partie du dossier qui décrit précisément les matériaux, les dimensions, les normes et la qualité attendue du travail.</td>
    </tr>
    <tr>
      <td><strong>BPU / DQE</strong></td>
      <td>Bordereau des Prix Unitaires / Devis Quantitatif et Estimatif</td>
      <td>Le tableau des prix : combien coûte 1 unité de chaque matériel ou travail (BPU), multiplié par les quantités prévues pour avoir le total (DQE).</td>
    </tr>
    <tr>
      <td><strong>OS</strong></td>
      <td>Ordre de Service</td>
      <td>La lettre officielle signée par le Maître d’Ouvrage qui donne le « top départ » (ou l’arrêt temporaire) des travaux. C’est elle qui fait démarrer le chronomètre des délais !</td>
    </tr>
    <tr>
      <td><strong>PV</strong></td>
      <td>Procès-Verbal</td>
      <td>Le compte rendu officiel et signé d’une réunion importante (ouverture des enveloppes, visite de chantier, réception finale des travaux).</td>
    </tr>
    <tr>
      <td><strong>Avenant (et plafond 30%)</strong></td>
      <td>Modification écrite d’un contrat déjà signé</td>
      <td>Si un imprévu oblige à ajouter ou ajuster des travaux, on signe un avenant. Au Cameroun, le total des ajouts ne peut pas dépasser 30 % du prix initial du marché.</td>
    </tr>
    <tr>
      <td><strong>Mise en demeure</strong></td>
      <td>Dernier avertissement officiel</td>
      <td>Lettre formelle prévenant une entreprise défaillante qu’elle a un délai court pour reprendre ou corriger le chantier, faute de quoi son contrat sera résilié.</td>
    </tr>
    <tr>
      <td><strong>Cautionnement &amp; Mainlevée</strong></td>
      <td>Garantie bancaire &amp; attestation de libération</td>
      <td>Somme bloquée à la banque par l’entreprise pour prouver son sérieux. Une fois le travail bien fini, la « mainlevée » autorise la banque à lui rendre cette garantie.</td>
    </tr>
    <tr>
      <td><strong>Décompte</strong></td>
      <td>Facture d’avancement vérifiée</td>
      <td>Document chiffré présentant la part de travaux réellement réalisée ce mois-ci pour déclencher un paiement partiel.</td>
    </tr>
    <tr>
      <td><strong>GED Régalienne</strong></td>
      <td>Gestion Électronique des Documents</td>
      <td>Le coffre-fort numérique officiel de l’institution où sont classés et protégés tous les actes signés.</td>
    </tr>
    <tr>
      <td><strong>Empreinte SHA-256</strong></td>
      <td>Code mathématique unique d’un fichier</td>
      <td>Une « empreinte digitale » informatique de 64 caractères : si le fichier est altéré même d’un mot, le code change et prouve que le document a été touché.</td>
    </tr>
    <tr>
      <td><strong>RBAC</strong></td>
      <td>Contrôle d’accès basé sur les rôles</td>
      <td>Règle de sécurité simple : chacun ne voit et ne peut cliquer que sur ce qui correspond à son métier dans l’organisation.</td>
    </tr>
    <tr>
      <td><strong>Multi-entités (Multi-tenant)</strong></td>
      <td>Plusieurs institutions sur un même logiciel sécurisé</td>
      <td>Plusieurs mairies ou ministères utilisent SIGAMP-CM en même temps, mais chacune reste dans son compartiment totalement étanche (chacun chez soi).</td>
    </tr>
    <tr>
      <td><strong>RLS (Row-Level Security)</strong></td>
      <td>Verrouillage ligne par ligne dans la base de données</td>
      <td>Double serrure invisible au cœur du serveur : même si quelqu’un essayait de contourner l’écran, la base de données refuse d’afficher les dossiers d’une autre institution.</td>
    </tr>
    <tr>
      <td><strong>Mode Hors-Ligne / IndexedDB</strong></td>
      <td>Travail sans Internet enregistré sur votre appareil</td>
      <td>Mémoire interne sécurisée de votre navigateur : si Internet coupe, votre travail reste sauvegardé sur l’ordinateur et se synchronise tout seul quand la connexion revient.</td>
    </tr>
    <tr>
      <td><strong>Studio &amp; CMS</strong></td>
      <td>Atelier visuel &amp; Gestionnaire de contenus</td>
      <td>L’espace où l’administrateur règle l’apparence (logo, couleurs) et adapte les textes types des documents sans avoir besoin d’un informaticien.</td>
    </tr>
    <tr>
      <td><strong>Grand Reset &amp; Mode Démo</strong></td>
      <td>Remise à zéro production &amp; Bascule d’essais</td>
      <td>Outil réservé au Super Admin pour effacer tous les faux dossiers de formation avant le vrai démarrage, et cacher/réactiver les comptes de démonstration en un clic.</td>
    </tr>
  </tbody>
</table>

<div class="callout green">
  <strong>Besoin d’aide pendant votre travail ?</strong> Cliquez sur le petit robot guide animé en bas à droite de votre écran : il vous emmène directement devant le bon bouton et vous l’explique en français courant selon votre rôle du moment !
</div>

</body>
</html>
"""


def main() -> None:
    root = Path("/home/user")
    targets = [
        root / "public" / "docs" / "SIGAMP_CM_Manuel_Utilisateur_Complet.pdf",
        root / "docs" / "SIGAMP_CM_Manuel_Utilisateur_Complet.pdf",
    ]
    for t in targets:
        t.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(HTML_CONTENT, wait_until="networkidle")
        pdf_bytes = page.pdf(
            format="A4",
            print_background=True,
            display_header_footer=True,
            margin={"top": "18mm", "right": "15mm", "bottom": "18mm", "left": "15mm"},
        )
        browser.close()

    for t in targets:
        t.write_bytes(pdf_bytes)
        print(f"Generated {t} ({len(pdf_bytes)} bytes)")


if __name__ == "__main__":
    main()
