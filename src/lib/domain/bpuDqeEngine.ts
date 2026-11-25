import type { FiscalRegime, ProcurementNature } from '../../types/domain';
import { DEFAULT_REGULATORY_DAO_PARAMS } from './daoAssemblerEngine';

export type BpuUnitCode = 'U' | 'Fft' | 'Ens' | 'm²' | 'm³' | 'ml' | 'kg' | 'T' | 'J/H' | 'Mois';

export interface BpuDqeLineItem {
  id: string;
  priceNumber: string;
  sectionTitle?: string;
  designation: string;
  unit: BpuUnitCode | string;
  unitPriceHt: number;
  quantity: number;
  isBlankTemplate?: boolean;
}

export interface ComputedBpuDqeLine extends BpuDqeLineItem {
  unitPriceWords: string;
  lineTotalHt: number;
}

export interface BpuDqeTotalsSummary {
  lines: ComputedBpuDqeLine[];
  totalHt: number;
  tvaRate: number;
  tvaAmount: number;
  totalTtc: number;
  airRate: number;
  airAmount: number;
  netToOrder: number;
  bidBondMax2Pct: number;
  guaranteeRetention10Pct: number;
  totalTtcWords: string;
}

const UNITS_FR = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
  'dix-sept',
  'dix-huit',
  'dix-neuf',
];

const TENS_FR = [
  '',
  'dix',
  'vingt',
  'trente',
  'quarante',
  'cinquante',
  'soixante',
  'soixante',
  'quatre-vingt',
  'quatre-vingt',
];

function underHundredToFrench(n: number): string {
  if (n < 20) return UNITS_FR[n] ?? '';
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return TENS_FR[t] ?? '';
    if (u === 1) return `${TENS_FR[t]} et un`;
    return `${TENS_FR[t]}-${UNITS_FR[u]}`;
  }
  if (n < 80) {
    const u = n - 60;
    if (u === 11) return 'soixante et onze';
    return `soixante-${underHundredToFrench(u)}`;
  }
  if (n === 80) return 'quatre-vingts';
  return `quatre-vingt-${underHundredToFrench(n - 80)}`;
}

function underThousandToFrench(n: number): string {
  if (n < 100) return underHundredToFrench(n);
  const c = Math.floor(n / 100);
  const r = n % 100;
  const centLabel = c === 1 ? 'cent' : `${UNITS_FR[c]} cent${r === 0 ? 's' : ''}`;
  return r === 0 ? centLabel : `${centLabel} ${underHundredToFrench(r)}`;
}

/**
 * Convertit un montant entier en FCFA en toutes lettres (français réglementaire ARMP).
 */
export function numberToFrenchWordsFcfa(rawAmount: number): string {
  const n = Math.max(0, Math.round(rawAmount));
  if (n === 0) return 'zéro franc CFA';

  const milliards = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const milliers = Math.floor((n % 1_000_000) / 1_000);
  const reste = n % 1_000;

  const parts: string[] = [];
  if (milliards > 0) {
    parts.push(`${underThousandToFrench(milliards)} milliard${milliards > 1 ? 's' : ''}`);
  }
  if (millions > 0) {
    parts.push(`${underThousandToFrench(millions)} million${millions > 1 ? 's' : ''}`);
  }
  if (milliers > 0) {
    parts.push(milliers === 1 ? 'mille' : `${underThousandToFrench(milliers)} mille`);
  }
  if (reste > 0) {
    parts.push(underThousandToFrench(reste));
  }

  return `${parts.join(' ')} franc${n > 1 ? 's' : ''} CFA`;
}

export function resolveAirRateForFiscalRegime(regime: FiscalRegime): number {
  switch (regime) {
    case 'REEL':
      return 0.022;
    case 'SIMPLIFIE':
      return 0.055;
    case 'ETRANGER_NON_RESIDENT':
      return 0.15;
    case 'LIBERATOIRE':
    default:
      return 0;
  }
}

export function computeBpuDqeSummary(
  items: BpuDqeLineItem[],
  options?: {
    fiscalRegime?: FiscalRegime;
    tvaApplicable?: boolean;
    tvaRate?: number;
  }
): BpuDqeTotalsSummary {
  const tvaRate =
    options?.tvaApplicable === false
      ? 0
      : (options?.tvaRate ?? DEFAULT_REGULATORY_DAO_PARAMS.tvaRate);
  const airRate = resolveAirRateForFiscalRegime(options?.fiscalRegime ?? 'REEL');

  const lines: ComputedBpuDqeLine[] = items.map((it) => {
    const unitPriceHt = Math.max(0, Math.round(Number(it.unitPriceHt) || 0));
    const quantity = Math.max(0, Number(it.quantity) || 0);
    const lineTotalHt = Math.round(unitPriceHt * quantity);
    return {
      ...it,
      unitPriceHt,
      quantity,
      unitPriceWords: numberToFrenchWordsFcfa(unitPriceHt),
      lineTotalHt,
    };
  });

  const totalHt = lines.reduce((sum, l) => sum + l.lineTotalHt, 0);
  const tvaAmount = Math.round(totalHt * tvaRate);
  const totalTtc = totalHt + tvaAmount;
  const airAmount = Math.round(totalHt * airRate);
  const netToOrder = Math.max(0, totalHt - airAmount);
  const bidBondMax2Pct = Math.round(totalTtc * 0.02);
  const guaranteeRetention10Pct = Math.round(totalTtc * 0.1);

  return {
    lines,
    totalHt,
    tvaRate,
    tvaAmount,
    totalTtc,
    airRate,
    airAmount,
    netToOrder,
    bidBondMax2Pct,
    guaranteeRetention10Pct,
    totalTtcWords: numberToFrenchWordsFcfa(totalTtc),
  };
}

export function getPresetBpuLines(nature: ProcurementNature): BpuDqeLineItem[] {
  if (nature === 'FOURNITURES') {
    return [
      {
        id: 'f1',
        priceNumber: '101',
        sectionTitle: 'MOBILIER SCOLAIRE & BUREAU',
        designation: 'Fourniture et livraison de tables-bancs métalliques à 2 places en bois dur traité',
        unit: 'U',
        unitPriceHt: 45_000,
        quantity: 250,
      },
      {
        id: 'f2',
        priceNumber: '102',
        sectionTitle: 'MOBILIER SCOLAIRE & BUREAU',
        designation: 'Bureaux de maître en bois verni avec tiroirs fermant à clé + chaise',
        unit: 'Ens',
        unitPriceHt: 115_000,
        quantity: 20,
      },
      {
        id: 'f3',
        priceNumber: '201',
        sectionTitle: 'ÉQUIPEMENT INFORMATIQUE',
        designation: 'Ordinateur portable professionnel Core i7, 16 Go RAM, SSD 512 Go + onduleur',
        unit: 'Ens',
        unitPriceHt: 580_000,
        quantity: 6,
      },
    ];
  }

  if (nature === 'SERVICES_QUANTIFIABLES' || nature === 'PRESTATIONS_INTELLECTUELLES') {
    return [
      {
        id: 's1',
        priceNumber: '101',
        sectionTitle: 'PRESTATIONS DE BASE',
        designation: 'Diagnostic technique, levé topographique et rapport préliminaire validé',
        unit: 'Fft',
        unitPriceHt: 3_500_000,
        quantity: 1,
      },
      {
        id: 's2',
        priceNumber: '102',
        sectionTitle: 'PRESTATIONS DE BASE',
        designation: 'Prestations d’expertise mensuelle / maintenance préventive et corrective sur site',
        unit: 'Mois',
        unitPriceHt: 850_000,
        quantity: 12,
      },
      {
        id: 's3',
        priceNumber: '201',
        sectionTitle: 'FORMATION & TRANSFERT',
        designation: 'Session de formation des agents SIGAMP/STM avec supports pédagogiques',
        unit: 'J/H',
        unitPriceHt: 150_000,
        quantity: 15,
      },
    ];
  }

  // Défaut TRAVAUX
  return [
    {
      id: 't1',
      priceNumber: '101',
      sectionTitle: 'INSTALLATION & PRÉPARATOIRES',
      designation: 'Installation de chantier, amenée/repli matériel et panneau de chantier réglementaire',
      unit: 'Fft',
      unitPriceHt: 2_500_000,
      quantity: 1,
    },
    {
      id: 't2',
      priceNumber: '201',
      sectionTitle: 'TERRASSEMENT & VOIRIE',
      designation: 'Décapage, terrassement général et mise en forme de la plateforme en grave latéritique',
      unit: 'm³',
      unitPriceHt: 8_500,
      quantity: 1_200,
    },
    {
      id: 't3',
      priceNumber: '301',
      sectionTitle: 'REVÊTEMENT & ASSAINISSEMENT',
      designation: 'Fourniture et pose de pavés autobloquants haute résistance ép. 8 cm sur lit de sable',
      unit: 'm²',
      unitPriceHt: 14_500,
      quantity: 1_650,
    },
    {
      id: 't4',
      priceNumber: '302',
      sectionTitle: 'REVÊTEMENT & ASSAINISSEMENT',
      designation: 'Construction de caniveaux en béton armé dosé à 350 kg/m³ section 60x60 avec dallettes',
      unit: 'ml',
      unitPriceHt: 42_000,
      quantity: 120,
    },
  ];
}

export function buildBpuTableRows(summary: BpuDqeTotalsSummary, blankForBidder = false): string[][] {
  const header = [
    'N° Prix',
    'Désignation des prestations / ouvrages',
    'Unité',
    'P.U. HT (Chiffres)',
    'P.U. HT (En toutes lettres)',
  ];
  const rows = summary.lines.map((l) => [
    l.priceNumber,
    l.designation,
    String(l.unit),
    blankForBidder ? '................' : l.unitPriceHt.toLocaleString('fr-FR'),
    blankForBidder ? '........................................' : l.unitPriceWords,
  ]);
  return [header, ...rows];
}

export function buildDqeTableRows(summary: BpuDqeTotalsSummary, blankForBidder = false): string[][] {
  const header = [
    'N° Prix',
    'Désignation des prestations / ouvrages',
    'Unité',
    'Quantité',
    'P.U. HT (FCFA)',
    'Montant HT (FCFA)',
  ];
  const rows = summary.lines.map((l) => [
    l.priceNumber,
    l.designation,
    String(l.unit),
    l.quantity.toLocaleString('fr-FR'),
    blankForBidder ? '..........' : l.unitPriceHt.toLocaleString('fr-FR'),
    blankForBidder ? '............' : l.lineTotalHt.toLocaleString('fr-FR'),
  ]);

  const footer: string[][] = [
    [
      '',
      'TOTAL GÉNÉRAL HORS TAXES (HT)',
      '',
      '',
      '',
      blankForBidder ? '............' : `${summary.totalHt.toLocaleString('fr-FR')} F`,
    ],
    [
      '',
      `TVA (${(summary.tvaRate * 100).toFixed(2)} %)`,
      '',
      '',
      '',
      blankForBidder ? '............' : `${summary.tvaAmount.toLocaleString('fr-FR')} F`,
    ],
    [
      '',
      'TOTAL TOUTES TAXES COMPRISES (TTC)',
      '',
      '',
      '',
      blankForBidder ? '............' : `${summary.totalTtc.toLocaleString('fr-FR')} F`,
    ],
    [
      '',
      `AIR / Précompte retenu (${(summary.airRate * 100).toFixed(1)} %)`,
      '',
      '',
      '',
      blankForBidder ? '............' : `${summary.airAmount.toLocaleString('fr-FR')} F`,
    ],
    [
      '',
      'NET À MANDATER AU COCONTRACTANT (HT - AIR)',
      '',
      '',
      '',
      blankForBidder ? '............' : `${summary.netToOrder.toLocaleString('fr-FR')} F`,
    ],
  ];

  return [header, ...rows, ...footer];
}

export function formatBpuDqeTextBlock(summary: BpuDqeTotalsSummary): string {
  const linesText = summary.lines
    .map(
      (l) =>
        `• Prix ${l.priceNumber} | ${l.designation} | ${l.quantity} ${l.unit} x ${l.unitPriceHt.toLocaleString('fr-FR')} F (${l.unitPriceWords}) = ${l.lineTotalHt.toLocaleString('fr-FR')} F HT`
    )
    .join('\n');

  return [
    '--- RÉCAPITULATIF FINANCIER ESTIMATIF (DQE / CGI CAMEROUN) ---',
    linesText,
    '',
    `Total Général HT : ${summary.totalHt.toLocaleString('fr-FR')} FCFA`,
    `TVA (${(summary.tvaRate * 100).toFixed(2)} %) : ${summary.tvaAmount.toLocaleString('fr-FR')} FCFA`,
    `Total Général TTC : ${summary.totalTtc.toLocaleString('fr-FR')} FCFA (${summary.totalTtcWords})`,
    `AIR / Précompte (${(summary.airRate * 100).toFixed(1)} %) : ${summary.airAmount.toLocaleString('fr-FR')} FCFA | Net à mandater : ${summary.netToOrder.toLocaleString('fr-FR')} FCFA`,
    `Caution soumission max (2 % TTC) : ${summary.bidBondMax2Pct.toLocaleString('fr-FR')} FCFA | Retenue garantie (10 % TTC) : ${summary.guaranteeRetention10Pct.toLocaleString('fr-FR')} FCFA`,
  ].join('\n');
}

export function exportBpuToCsv(items: BpuDqeLineItem[]): string {
  const header = 'N_PRIX;SECTION;DESIGNATION;UNITE;PU_HT;QUANTITE';
  const rows = items.map(
    (it) =>
      `${it.priceNumber};${(it.sectionTitle ?? '').replace(/;/g, ',')};${it.designation.replace(
        /;/g,
        ','
      )};${it.unit};${it.unitPriceHt};${it.quantity}`
  );
  return [header, ...rows].join('\n');
}

export function parseBpuFromCsv(csvText: string): BpuDqeLineItem[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const result: BpuDqeLineItem[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]!;
    if (i === 0 && raw.toUpperCase().includes('DESIGNATION')) continue;
    const sep = raw.includes(';') ? ';' : ',';
    const cols = raw.split(sep).map((c) => c.trim());
    if (cols.length < 4) continue;
    const priceNumber = cols[0] || String(100 + result.length + 1);
    const hasSection = cols.length >= 6;
    const sectionTitle = hasSection ? cols[1] : undefined;
    const designation = hasSection ? cols[2]! : cols[1]!;
    const unit = (hasSection ? cols[3] : cols[2]) || 'U';
    const unitPriceHt = Number((hasSection ? cols[4] : cols[3])?.replace(/\s+/g, '')) || 0;
    const quantity = Number((hasSection ? cols[5] : cols[4])?.replace(/\s+/g, '')) || 1;
    if (!designation) continue;
    result.push({
      id: `csv-${i}-${Date.now()}`,
      priceNumber,
      sectionTitle,
      designation,
      unit,
      unitPriceHt,
      quantity,
    });
  }
  return result;
}
