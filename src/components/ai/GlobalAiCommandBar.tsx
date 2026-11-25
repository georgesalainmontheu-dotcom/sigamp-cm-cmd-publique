'use client';

import { Bot, Loader2, Mic, MicOff, Send, Sparkles, Terminal, Wrench, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { buildAuthenticatedJsonHeaders } from '../../lib/supabase/client';
import type { AgenticWorkflowResult, AiToolExecutionResult } from '../../types/ai';
import type { ActiveRoleProfile } from '../../lib/ui/demoProfiles';

interface GlobalAiCommandBarProps {
  profile: ActiveRoleProfile;
  isOnline: boolean;
  isOpen: boolean;
  onClose: () => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

export function GlobalAiCommandBar({
  profile,
  isOnline,
  isOpen,
  onClose,
}: GlobalAiCommandBarProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgenticWorkflowResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  const toggleVoiceDictation = () => {
    if (typeof window === 'undefined') return;
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRec = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SpeechRec) {
      setError('Dictée vocale Web Speech API non supportée sur ce navigateur.');
      return;
    }

    setError(null);
    const rec = new SpeechRec();
    rec.lang = 'fr-FR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      const transcript = ev.results[0]?.[0]?.transcript ?? '';
      if (transcript) {
        setPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const executePrompt = async (textToSend?: string) => {
    const query = (textToSend ?? prompt).trim();
    if (!query) return;

    setLoading(true);
    setError(null);
    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch('/api/ai/gateway', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'copilot',
          userPrompt: query,
          offlineMode: !isOnline,
          context: {
            entityId: profile.entityId,
            entityName: profile.entityName,
            entityType: profile.entityType,
            city: profile.city,
            fiscalYear: profile.fiscalYear,
            actorUserId: profile.userId,
            actorRole: profile.roleCode,
            actorName: profile.fullName,
            actorTitle: profile.title,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Erreur HTTP ${res.status}`);
      }
      setResult(data as AgenticWorkflowResult);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible d'atteindre la passerelle IA (vérifiez vos clés API gratuites ou Ollama local)."
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/65 px-4 pt-16 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Barre supérieure */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gov-navy px-5 py-3 text-white">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 text-gov-gold" />
            <span className="text-sm font-semibold">
              Copilote IA Commande Publique — {profile.shortLabel}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                isOnline ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'
              }`}
            >
              {isOnline ? 'Cloud Multi-API (Groq/Gemini/Mistral)' : 'Mode Hors-Ligne (Ollama)'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-300 hover:bg-white/10 hover:text-white"
            aria-label="Fermer la barre IA"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Formulaire commande */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void executePrompt();
          }}
          className="flex items-center gap-2 border-b border-slate-200 px-4 py-3"
        >
          <Terminal className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Posez une question juridique ou donnez un ordre (ex: Calculer pénalités avec 8j d’intempéries)..."
            className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={toggleVoiceDictation}
            className={`rounded-lg p-2 transition ${
              listening
                ? 'animate-pulse bg-rose-100 text-rose-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            title="Dictée vocale (fr-FR)"
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gov-navy px-4 py-2 text-xs font-semibold text-white hover:bg-gov-navyLight disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Exécuter
          </button>
        </form>

        {/* Suggestions rapides par rôle */}
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Actions rapides pour {profile.shortLabel}
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.quickAiPrompts.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setPrompt(s);
                  void executePrompt(s);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-left text-xs text-slate-700 transition hover:border-gov-navy hover:text-gov-navy"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Zone résultat */}
        <div className="max-h-[48vh] overflow-y-auto p-5">
          {error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
              <strong>Note passerelle IA :</strong> {error}
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5 font-medium text-gov-navy">
                  <Bot className="h-4 w-4 text-gov-emerald" />
                  Fournisseur : {result.providerUsed} ({result.modelUsed})
                </span>
                <span>
                  {result.iterations} itération(s) · {result.toolExecutions.length} outil(s) exécuté(s)
                </span>
              </div>

              {result.toolExecutions.length > 0 && (
                <div className="space-y-2">
                  {result.toolExecutions.map((tool: AiToolExecutionResult, idx: number) => (
                    <div
                      key={`${tool.toolName}-${idx}`}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
                    >
                      <div className="flex items-center gap-2 font-semibold text-gov-navy">
                        <Wrench className="h-3.5 w-3.5 text-gov-gold" />
                        <span>{tool.toolName}</span>
                        <span
                          className={`ml-auto rounded px-2 py-0.5 text-[10px] ${
                            tool.success
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {tool.success ? 'SUCCÈS' : 'ERREUR'}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-700">{tool.auditSummary}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800">
                {result.answer}
              </div>
            </div>
          )}

          {!error && !result && !loading && (
            <p className="text-center text-xs text-slate-400">
              Raccourci global : <kbd className="rounded border px-1.5 py-0.5">Ctrl+K</kbd> ou{' '}
              <kbd className="rounded border px-1.5 py-0.5">⌘K</kbd> · Tous les calculs financiers et
              juridiques sont validés par les moteurs déterministes CMP/CGI.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
