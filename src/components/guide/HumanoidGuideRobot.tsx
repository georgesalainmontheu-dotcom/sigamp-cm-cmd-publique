'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  MapPin,
  Minimize2,
  Sparkles,
  X,
} from 'lucide-react';
import type { ActiveRoleProfile } from '../../lib/ui/demoProfiles';
import { getGuideStepsForContext, type GuideStep } from '../../lib/guide/roleGuideCatalog';

interface HumanoidGuideRobotProps {
  profile: ActiveRoleProfile;
  overlayMode: 'NONE' | 'GED' | 'FACTORY' | 'STUDIO';
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function HumanoidGuideRobot({ profile, overlayMode }: HumanoidGuideRobotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [robotPos, setRobotPos] = useState<{ top: number; left: number }>({
    top: 420,
    left: 24,
  });
  const [isWalking, setIsWalking] = useState(false);

  const steps = useMemo(
    () => getGuideStepsForContext(profile, overlayMode),
    [profile, overlayMode]
  );

  useEffect(() => {
    setStepIndex(0);
  }, [profile.spaceId, overlayMode]);

  const currentStep: GuideStep | undefined = steps[stepIndex] ?? steps[0];

  const locateTag = useCallback((tag: string | undefined) => {
    if (typeof window === 'undefined' || !tag) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(`[data-guide-tag="${tag}"]`) as HTMLElement | null;
    if (!el) {
      setTargetRect(null);
      setRobotPos({
        top: Math.max(90, window.innerHeight - 360),
        left: Math.max(16, window.innerWidth - 400),
      });
      return;
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cardWidth = Math.min(360, vw - 24);
      const cardHeight = 290;

      // Position robot & bubble safely beside or below the target element
      let desiredLeft = rect.left + rect.width + 16;
      if (desiredLeft + cardWidth > vw - 12) {
        desiredLeft = Math.max(12, rect.left - cardWidth - 16);
      }
      if (desiredLeft + cardWidth > vw - 12) {
        desiredLeft = Math.max(12, vw - cardWidth - 16);
      }

      let desiredTop = rect.top + 8;
      if (desiredTop + cardHeight > vh - 16) {
        desiredTop = Math.max(72, vh - cardHeight - 20);
      }
      if (desiredTop < 72) desiredTop = 72;

      setIsWalking(true);
      setRobotPos({ top: desiredTop, left: desiredLeft });
      window.setTimeout(() => setIsWalking(false), 700);
    };

    window.setTimeout(measure, 180);
  }, []);

  useEffect(() => {
    if (!isOpen || !currentStep) {
      setTargetRect(null);
      return;
    }
    locateTag(currentStep.tag);
    const handleReposition = () => locateTag(currentStep.tag);
    window.addEventListener('resize', handleReposition);
    return () => window.removeEventListener('resize', handleReposition);
  }, [isOpen, currentStep, locateTag]);

  return (
    <>
      <style>{`
        @keyframes sigampBotFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes sigampBotWalk {
          0%, 100% { transform: translateY(0px) rotate(-3deg); }
          50% { transform: translateY(-8px) rotate(3deg); }
        }
        @keyframes sigampBotWave {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-18deg); }
        }
        @keyframes sigampBotBlink {
          0%, 92%, 100% { transform: scaleY(1); }
          96% { transform: scaleY(0.15); }
        }
      `}</style>

      {/* Halo doré autour du repère ciblé à l'écran */}
      {isOpen && targetRect && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[88] rounded-xl border-2 border-[#D4AF37] bg-[#D4AF37]/10 shadow-[0_0_0_4px_rgba(212,175,55,0.28)] transition-all duration-500"
          style={{
            top: Math.max(4, targetRect.top - 5),
            left: Math.max(4, targetRect.left - 5),
            width: Math.max(24, targetRect.width + 10),
            height: Math.max(24, targetRect.height + 10),
          }}
        />
      )}

      {/* Bouton de réveil discret en bas à droite quand le robot est réduit */}
      {!isOpen && (
        <div className="fixed bottom-5 right-5 z-[90] flex items-center gap-2">
          <a
            href="/docs/SIGAMP_CM_Manuel_Utilisateur_Complet.pdf"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#0A1F3D]/20 bg-white/95 px-3 py-2 text-xs font-bold text-[#0A1F3D] shadow-lg backdrop-blur hover:bg-slate-50"
            title="Télécharger le Manuel Utilisateur Complet en langage courant (PDF)"
          >
            <BookOpen className="h-3.5 w-3.5 text-[#D4AF37]" />
            Manuel PDF
          </a>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            data-guide-tag="robot-launcher-btn"
            className="group flex items-center gap-2.5 rounded-full border-2 border-[#D4AF37] bg-[#0A1F3D] py-2 pl-2.5 pr-4 text-xs font-bold text-white shadow-xl transition hover:scale-105"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#D4AF37]/20">
              <RobotAvatarSvg walking={false} compact />
            </span>
            <span className="flex flex-col text-left leading-tight">
              <span className="text-[#D4AF37]">Guide Robot SIGAMP</span>
              <span className="text-[10px] font-normal text-slate-200">
                Me guider pas à pas
              </span>
            </span>
          </button>
        </div>
      )}

      {/* Robot Humanoïde Animé qui se déplace vers le repère actif */}
      {isOpen && currentStep && (
        <div
          role="dialog"
          aria-label="Assistant robot guide SIGAMP-CM"
          className="fixed z-[95] flex max-w-[92vw] items-start gap-2.5 transition-all duration-700 ease-out"
          style={{
            top: robotPos.top,
            left: robotPos.left,
          }}
        >
          {/* Corps humanoïde SVG animé */}
          <div
            className="shrink-0 drop-shadow-xl"
            style={{
              animation: isWalking
                ? 'sigampBotWalk 0.35s ease-in-out infinite'
                : 'sigampBotFloat 2.8s ease-in-out infinite',
            }}
          >
            <RobotAvatarSvg walking={isWalking} />
          </div>

          {/* Bulle de dialogue claire en langage courant */}
          <div className="w-[330px] max-w-[74vw] rounded-2xl border-2 border-[#D4AF37] bg-white/98 p-3.5 text-xs text-slate-800 shadow-2xl backdrop-blur">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#0A1F3D]">
                  <Sparkles className="h-3 w-3 text-[#D4AF37]" />
                  SIGAMP-Bot · {profile.shortLabel}
                </div>
                <h4 className="mt-0.5 text-[13px] font-bold text-[#0A1F3D]">
                  {currentStep.title}
                </h4>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  title="Réduire le robot"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  title="Fermer"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <p className="mt-2 leading-relaxed text-slate-700">
              {currentStep.explanation}
            </p>

            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-950">
              <strong>Conseil pratique :</strong> {currentStep.actionTip}
            </div>

            {currentStep.glossary && currentStep.glossary.length > 0 && (
              <div className="mt-2 space-y-1">
                {currentStep.glossary.map((g) => (
                  <div
                    key={g.term}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="font-bold text-[#0A1F3D]">{g.term} :</span>{' '}
                    <span className="text-slate-600">{g.meaning}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Navigation des repères interactifs (tags) */}
            <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                <MapPin className="h-3 w-3 text-[#D4AF37]" />
                Repères ({stepIndex + 1}/{steps.length}) :
              </span>
              <div className="flex flex-wrap gap-1">
                {steps.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStepIndex(idx)}
                    className={`h-5 min-w-[20px] rounded px-1.5 text-[10px] font-bold transition ${
                      idx === stepIndex
                        ? 'bg-[#0A1F3D] text-[#D4AF37]'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    title={s.title}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-2">
              <a
                href="/docs/SIGAMP_CM_Manuel_Utilisateur_Complet.pdf"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-[#0A1F3D] hover:bg-slate-50"
              >
                <Download className="h-3 w-3 text-[#D4AF37]" />
                Manuel PDF
              </a>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={stepIndex === 0}
                  onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                  className="inline-flex items-center gap-0.5 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Préc.
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setStepIndex((i) => (i + 1 >= steps.length ? 0 : i + 1))
                  }
                  className="inline-flex items-center gap-0.5 rounded-lg bg-[#0A1F3D] px-2.5 py-1 text-[11px] font-bold text-[#D4AF37] hover:opacity-95"
                >
                  {stepIndex + 1 >= steps.length ? 'Recommencer' : 'Suivant'}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RobotAvatarSvg({
  walking,
  compact = false,
}: {
  walking: boolean;
  compact?: boolean;
}) {
  const size = compact ? 28 : 66;
  return (
    <svg
      width={size}
      height={compact ? 28 : 82}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Antenne dorée pulsante */}
      <line x1="40" y1="6" x2="40" y2="18" stroke="#D4AF37" strokeWidth="3" strokeLinecap="round" />
      <circle cx="40" cy="6" r="4.5" fill="#FBBF24">
        <animate attributeName="r" values="4;5.6;4" dur="1.4s" repeatCount="indefinite" />
      </circle>

      {/* Tête humanoïde */}
      <rect x="20" y="18" width="40" height="28" rx="10" fill="#0A1F3D" stroke="#D4AF37" strokeWidth="2.5" />
      {/* Visière */}
      <rect x="25" y="24" width="30" height="14" rx="6" fill="#0F172A" />
      {/* Yeux LED clignotants */}
      <g style={{ transformOrigin: '40px 31px', animation: 'sigampBotBlink 4s infinite' }}>
        <circle cx="33" cy="31" r="3.4" fill="#38BDF8" />
        <circle cx="47" cy="31" r="3.4" fill="#38BDF8" />
      </g>

      {/* Cou */}
      <rect x="35" y="46" width="10" height="5" fill="#94A3B8" />

      {/* Bras gauche (fait coucou) */}
      <g
        style={{
          transformOrigin: '20px 56px',
          animation: 'sigampBotWave 1.8s ease-in-out infinite',
        }}
      >
        <rect x="7" y="52" width="12" height="22" rx="6" fill="#1E3A8A" stroke="#D4AF37" strokeWidth="2" />
        <circle cx="13" cy="76" r="4" fill="#D4AF37" />
      </g>

      {/* Bras droit */}
      <g>
        <rect x="61" y="52" width="12" height="22" rx="6" fill="#1E3A8A" stroke="#D4AF37" strokeWidth="2" />
        <circle cx="67" cy="76" r="4" fill="#D4AF37" />
      </g>

      {/* Torse */}
      <rect x="20" y="50" width="40" height="28" rx="9" fill="#0A1F3D" stroke="#D4AF37" strokeWidth="2.5" />
      {/* Cœur d'énergie doré */}
      <circle cx="40" cy="64" r="6" fill="#D4AF37">
        <animate attributeName="opacity" values="0.7;1;0.7" dur="1.6s" repeatCount="indefinite" />
      </circle>

      {/* Jambes articulées */}
      <rect
        x="26"
        y="79"
        width="10"
        height={walking ? 14 : 13}
        rx="4"
        fill="#334155"
        stroke="#D4AF37"
        strokeWidth="1.5"
      />
      <rect
        x="44"
        y="79"
        width="10"
        height={walking ? 11 : 13}
        rx="4"
        fill="#334155"
        stroke="#D4AF37"
        strokeWidth="1.5"
      />
    </svg>
  );
}
