-- ============================================================================
-- SIGAMP-CM V2.0 : Corpus Juridique Structuré Complet de la Commande Publique
-- Couvre les 8 piliers réglementaires camerounais (CMP 2018/366, CPM/CCCM 2013/271,
-- MINMAP/ARMP 2012/075-076, CGCTD 2019/024, Loi 2018/012 & CGI/MINFI,
-- Circulaire 001/CAB/PM Maturation, Indemnités, Acte Uniforme OHADA & Sanctions)
-- ============================================================================

INSERT INTO public.legal_knowledge_chunks
    (id, source_code, source_title, article_ref, domain_tag, effective_date, content, metadata)
VALUES
(
    '77777777-7777-4777-8777-000000000001',
    'CMP-2018-366',
    'Décret n° 2018/366 du 20 juin 2018 portant Code des Marchés Publics',
    'Art. 1-4',
    'PRINCIPES_GENERAUX',
    '2018-06-20',
    'La commande publique obéit aux principes de liberté d''accès, d''égalité de traitement des candidats, de transparence des procédures, d''efficience et d''intégrité. Tout marché public donne lieu à un appel à la concurrence préalable, sauf dérogation légale expresse.',
    '{"pillar":"CMP"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000002',
    'CMP-2018-366',
    'Décret n° 2018/366 portant Code des Marchés Publics',
    'Art. 10-12',
    'SEUILS_PASSATION',
    '2018-06-20',
    'Classification selon les montants TTC : Bon de Commande Administratif (< 5 000 000 FCFA TTC), Lettre-Commande (>= 5 000 000 et < 50 000 000 FCFA TTC), Marché Public (>= 50 000 000 FCFA TTC). Aucun fractionnement artificiel des dépenses n''est toléré pour éluder les seuils.',
    '{"pillar":"CMP"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000003',
    'CMP-2018-366',
    'Décret n° 2018/366 portant Code des Marchés Publics',
    'Art. 73-84',
    'MODES_PASSATION',
    '2018-06-20',
    'Les modes de passation comprennent l''Appel d''Offres National Ouvert (AONO), l''Appel d''Offres International Ouvert (AOIO), l''Appel d''Offres Restreint (AONR/AOIR précédé d''une préqualification), le Concours, la Demande de Cotation (< 30M FCFA pour fournitures/services courants), et le Gré à Gré soumis à autorisation préalable du MINMAP.',
    '{"pillar":"CMP"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000004',
    'CMP-2018-366',
    'Décret n° 2018/366 portant Code des Marchés Publics',
    'Art. 86-90',
    'PUBLICITE_ADDITIFS',
    '2018-06-20',
    'L''Avis d''Appel d''Offres (AAO) est rédigé en français et en anglais (strict bilinguisme). Le délai minimal de publicité est de 21 à 25 jours pour un AONO (15 jours en urgence motivée) et 45 jours pour un AOIO. Tout additif substantiel ou publié à moins de 7 jours de la date limite d''ouverture entraîne obligatoirement une prorogation de délai.',
    '{"pillar":"CMP"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000005',
    'CMP-2018-366',
    'Décret n° 2018/366 portant Code des Marchés Publics',
    'Art. 91-95',
    'VALIDITE_OFFRES_CAUTIONS',
    '2018-06-20',
    'La durée de validité des offres est fixée à 90 jours à compter de la date limite de dépôt. Le cautionnement de soumission (1% à 2% du montant prévisionnel) garantit le maintien de l''offre et doit être délivré par un établissement agréé COBAC sous forme de garantie autonome OHADA.',
    '{"pillar":"CMP"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000006',
    'CMP-2018-366',
    'Décret n° 2018/366 portant Code des Marchés Publics',
    'Art. 96-104',
    'OUVERTURE_EVALUATION_OAB',
    '2018-06-20',
    'Tout pli déposé après l''heure limite est rejeté sans ouverture. L''évaluation par la SCA suit trois phases étanches : conformité administrative, notation technique (avec seuil éliminatoire), puis ouverture financière des seules offres techniquement qualifiées. Une Offre Anormalement Basse (OAB, écart significatif sous la référence pondérée estimation/moyenne) impose une demande écrite de sous-détails de prix.',
    '{"pillar":"CMP"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000007',
    'CMP-2018-366',
    'Décret n° 2018/366 portant Code des Marchés Publics',
    'Art. 105-110',
    'ATTRIBUTION_STANDSTILL',
    '2018-06-20',
    'La décision d''attribution est publiée et notifiée simultanément à l''attributaire et aux candidats non retenus avec indication précise des motifs de rejet. Un délai d''attente (standstill) de 5 jours ouvrables doit être respecté avant la signature du contrat.',
    '{"pillar":"CMP"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000008',
    'CMP-2018-366',
    'Décret n° 2018/366 portant Code des Marchés Publics',
    'Art. 111-118',
    'CONTRACTUALISATION_SURETES',
    '2018-06-20',
    'Le titulaire fournit un cautionnement définitif de bonne exécution (2% à 5% du montant TTC) dans les 20 jours suivant la notification du marché, une caution d''avance de démarrage couvrant 100% de l''avance (max 20%), et subit une retenue de garantie de 10% (remplaçable par une caution bancaire).',
    '{"pillar":"CMP"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000009',
    'CMP-2018-366',
    'Décret n° 2018/366 portant Code des Marchés Publics',
    'Art. 119-123',
    'AVENANTS',
    '2018-06-20',
    'Les modifications en cours d''exécution donnent lieu à avenant après avis de la CPM ou CCCM. Le montant cumulé de tous les avenants ne peut dépasser 30% du montant du marché de base, sauf dérogation exceptionnelle de l''Autorité chargée des Marchés Publics (MINMAP).',
    '{"pillar":"CMP"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000010',
    'CMP-2018-366',
    'Décret n° 2018/366 portant Code des Marchés Publics',
    'Art. 166-170',
    'PENALITES_RESILIATION',
    '2018-06-20',
    'Pénalités de retard : 1/2000e du montant TTC par jour du 1er au 30e jour calendaire de retard net (après déduction des jours d''arrêt/intempéries formalisés par OS), puis 1/1000e à compter du 31e jour, plafonnées à 10%. La résiliation aux torts exclusifs exige une mise en demeure préalable (15 à 21 jours), la confiscation des cautions et la saisine de l''ARMP.',
    '{"pillar":"CMP"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000011',
    'CMP-2018-366',
    'Décret n° 2018/366 portant Code des Marchés Publics',
    'Art. 155-164',
    'RECEPTIONS_GARANTIES',
    '2018-06-20',
    'La réception provisoire est prononcée par la commission ad hoc (MO, Ingénieur du Marché, Chef de Service, Comptable-Matières, Titulaire). En cas de réserves, un délai de levée est fixé et bloque la libération du cautionnement de bonne exécution. La réception définitive intervient à l''expiration du délai de garantie (6 mois à 1 an) et entraîne la mainlevée de la retenue de garantie (10%).',
    '{"pillar":"CMP"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000012',
    'CMP-2018-366',
    'Décret n° 2018/366 portant Code des Marchés Publics',
    'Art. 171-178',
    'CONTENTIEUX',
    '2018-06-20',
    'Tout candidat lésé doit saisir préalablement le Maître d''Ouvrage dans un délai de 5 jours ouvrables suivant la publication/notification contestée, puis l''ARMP le cas échéant. Le recours recevable en phase de passation suspend automatiquement la signature du marché jusqu''à décision définitive.',
    '{"pillar":"CMP"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000013',
    'DEC-2013-271',
    'Décret n° 2012/074 modifié par le Décret n° 2013/271 relatif aux Commissions des Marchés',
    'Art. 3-18',
    'COMMISSIONS_PASSATION',
    '2013-08-05',
    'Les Commissions Internes (CIPM), Régionales (CRPM) et Départementales (CDPM) assurent l''ouverture des plis, désignent les Sous-Commissions d''Analyse (SCA) et formulent les propositions d''attribution. Le quorum est vérifié en séance sur feuille de présence émargée avec participation obligatoire de l''Observateur Indépendant ARMP dès les seuils réglementaires.',
    '{"pillar":"CPM_CCCM"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000014',
    'DEC-2013-271',
    'Décret n° 2012/074 modifié par le Décret n° 2013/271 relatif aux CCCM',
    'Art. 19-32',
    'CCCM_AVIS_CONFORME',
    '2013-08-05',
    'Les Commissions Centrales de Contrôle des Marchés (CCCM-TR pour Travaux >= 500M FCFA, CCCM-AG pour Approvisionnements Généraux >= 250M FCFA, CCCM-SPI pour Services et Prestations Intellectuelles >= 100M FCFA, et CCCM-FC pour Services Financiers/Gouvernance) émettent un avis conforme préalable sur le DAO, le rapport d''analyse, l''attribution et les avenants.',
    '{"pillar":"CPM_CCCM"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000015',
    'DEC-2012-075',
    'Décret n° 2012/075 portant organisation du Ministère des Marchés Publics (MINMAP)',
    'Art. 1-14',
    'MINMAP_TUTELLE',
    '2012-03-08',
    'Le MINMAP exerce le rôle d''Autorité chargée des Marchés Publics : il délivre les autorisations préalables de gré à gré, accorde les dérogations pour avenants excédant le plafond de 30%, et assure le contrôle externe de l''exécution physique et administrative des marchés.',
    '{"pillar":"MINMAP_ARMP"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000016',
    'DEC-2012-076',
    'Décret n° 2012/076 portant organisation de l''Agence de Régulation des Marchés Publics (ARMP)',
    'Art. 1-20',
    'ARMP_REGULATION',
    '2012-03-08',
    'L''ARMP assure la régulation, le suivi-évaluation du système, la formation, le déploiement des Observateurs Indépendants, la tenue du fichier national des entreprises exclues, et l''instruction des recours via le Comité de Règlement des Différends (CRD).',
    '{"pillar":"MINMAP_ARMP"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000017',
    'LOI-2019-024-CGCTD',
    'Loi n° 2019/024 du 24 décembre 2019 portant Code Général des Collectivités Territoriales Décentralisées',
    'Art. 72-88',
    'CGCTD_TUTELLE',
    '2019-12-24',
    'Les marchés des Communes, Communautés Urbaines et Régions sont passés par le Maire ou le Président du Conseil Régional après délibération budgétaire et avis de la CDPM/CIPM/CRPM. Ils sont soumis au contrôle de légalité du représentant de l''État (Préfet ou Gouverneur) et au visa du Receveur Municipal/Régional.',
    '{"pillar":"CGCTD"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000018',
    'LOI-2018-012-FIN',
    'Loi n° 2018/012 portant Régime Financier de l''État et des autres Entités Publiques',
    'Art. 45-62',
    'FINANCES_ENGAGEMENT',
    '2018-07-11',
    'Aucune dépense de commande publique ne peut être notifiée ni exécutée sans engagement comptable préalable et visa de disponibilité budgétaire du Contrôleur Financier (CF) ou du Contrôleur Financier Spécialisé sur la ligne budgétaire concernée (Chapitre, Article, Paragraphe).',
    '{"pillar":"FINANCES_CGI"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000019',
    'CGI-MINFI-CM',
    'Code Général des Impôts du Cameroun & Circulaire d''exécution budgétaire MINFI',
    'Art. 149-151 & 92bis',
    'FISCALITE_DECOMPTES',
    '2025-01-01',
    'Sur tout décompte public : TVA au taux de 19,25% retenue à la source par les entités publiques habilitées ; Acompte d''Impôt sur le Revenu (AIR) de 2,2% pour les entreprises au régime réel munies d''une attestation de non-redevance valide, ou 5,5% (régime simplifié/défaut) ; Taxe Spéciale sur le Revenu (TSR) de 15% pour les prestataires étrangers non-résidents ; Droits d''Enregistrement de 2% (Marchés >= 5M) ou 5% (Lettre-Commande / BCA selon nature).',
    '{"pillar":"FINANCES_CGI"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000020',
    'CIRC-001-CAB-PM',
    'Circulaire n° 001/CAB/PM & Directives MINEPAT sur la Maturation des Projets',
    'Points 1-4',
    'MATURATION',
    '2021-01-15',
    'L''inscription au Journal des Projets et le lancement de tout appel d''offres exigent un dossier complet de maturation : Études APS/APD (Travaux) ou TDR (Prestations Intellectuelles), Acte de disponibilité du site/emprise foncière libre de toute contrainte, Estimation prévisionnelle basée sur la Mercuriale des Prix, et Notice/Étude d''Impact Environnemental et Social (EIES).',
    '{"pillar":"MATURATION"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000021',
    'TEXTE-INDEMNITES-CM',
    'Régime des Indemnités de Session et Frais de Mission (CPM, SCA, SIGAMP, Réceptions, ARMP)',
    'Barème Session',
    'INDEMNITES',
    '2019-03-01',
    'Les indemnités de session des Présidents, Membres, Secrétaires, Rapporteurs SCA, Agents SIGAMP, Membres des Commissions de Réception et Observateurs Indépendants ARMP sont strictement subordonnées à l''émargement effectif sur la feuille de présence de chaque séance (ouverture, analyse, attribution, réception), plafonnées par session/mois/exercice, soumises à retenue fiscale et au visa préalable du Contrôleur Financier.',
    '{"pillar":"INDEMNITES"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000022',
    'OHADA-AUS-SURETES',
    'Acte Uniforme OHADA portant Organisation des Sûretés (Garantie autonome à première demande)',
    'Art. 39-49',
    'SURETES_OHADA',
    '2011-05-16',
    'Les cautions bancaires exigées en commande publique (soumission, bonne exécution, avance de démarrage, remplacement retenue de garantie) prennent la forme de garanties autonomes à première demande irrévocables émises par un établissement financier agréé. Le garant ne peut opposer aucune exception tirée du contrat de base en cas d''appel régulier pour défaillance.',
    '{"pillar":"OHADA_SANCTIONS"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000023',
    'CIRC-00000001-MINMAP',
    'Circulaire n° 00000001/PR/MINMAP/CAB relative aux sanctions des titulaires défaillants',
    'Procédure Exclusion',
    'SANCTIONS_ARMP',
    '2017-04-10',
    'En cas de carence avérée, d''abandon de chantier ou de fraude documentaire, le Maître d''Ouvrage notifie une mise en demeure de 15 à 21 jours, constate la carence par PV contradictoire, prononce la résiliation aux torts exclusifs avec saisie des cautions et transmet le dossier à l''ARMP pour inscription sur la liste des entreprises exclues de la commande publique (suspension de 2 ans ou exclusion définitive).',
    '{"pillar":"OHADA_SANCTIONS"}'::jsonb
),
(
    '77777777-7777-4777-8777-000000000024',
    'CMP-2018-366',
    'Décret n° 2018/366 — Désignation de l''Ingénieur du Marché et du Chef de Service du Marché',
    'Art. 125-132',
    'INGENIEUR_CHEF_SERVICE',
    '2018-06-20',
    'Le Maître d''Ouvrage désigne un Chef de Service du Marché (supervision administrative, coordination générale, notification des OS) et un Ingénieur du Marché (suivi technique terrain, élaboration préalable du CCTP/Devis Confidentiel, attachements contradictoires et proposition de décomptes).',
    '{"pillar":"CMP"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    source_code = EXCLUDED.source_code,
    source_title = EXCLUDED.source_title,
    article_ref = EXCLUDED.article_ref,
    domain_tag = EXCLUDED.domain_tag,
    content = EXCLUDED.content,
    metadata = EXCLUDED.metadata;
