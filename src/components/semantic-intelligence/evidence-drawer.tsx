"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

type EvidenceSection = {
  label: string;
  items: string[];
};

type ScoreRow = {
  label: string;
  value: string | number;
};

export function EvidenceDrawer({
  open,
  onClose,
  title,
  subtitle,
  summary,
  scoreTitle,
  scores,
  sections,
  closeLabel,
  noEvidenceLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  summary?: string;
  scoreTitle: string;
  scores: ScoreRow[];
  sections: EvidenceSection[];
  closeLabel: string;
  noEvidenceLabel: string;
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  const hasSectionItems = sections.some((section) => section.items.length > 0);

  return (
    <div className="dark fixed inset-0 z-50 flex justify-end bg-[oklch(0.06_0.03_264/72%)] backdrop-blur-sm">
      <button type="button" className="absolute inset-0 cursor-default" aria-label={closeLabel} onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col border-l border-border bg-[oklch(0.12_0.03_264)] text-foreground shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5">
          <div className="min-w-0">
            <p className="eyebrow text-[oklch(0.82_0.13_205)]">{subtitle}</p>
            <h2 className="mt-2 text-xl font-semibold leading-tight">{title}</h2>
            {summary ? <p className="mt-3 text-sm leading-6 text-dim">{summary}</p> : null}
          </div>
          <Button type="button" variant="outline" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section className="panel p-4">
            <p className="eyebrow text-faint">{scoreTitle}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {scores.map((score) => (
                <div key={score.label} className="panel-inset p-3">
                  <p className="text-xs text-faint">{score.label}</p>
                  <p className="mt-2 font-mono text-lg font-semibold text-foreground">{score.value}</p>
                </div>
              ))}
            </div>
          </section>

          {hasSectionItems ? (
            sections.map((section) =>
              section.items.length > 0 ? (
                <section key={section.label} className="panel p-4">
                  <p className="eyebrow text-faint">{section.label}</p>
                  <div className="mt-3 space-y-2">
                    {section.items.map((item, index) => (
                      <div
                        key={`${section.label}-${index}`}
                        className="panel-inset px-3 py-3 text-sm leading-6 text-dim"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null,
            )
          ) : (
            <section className="rounded-lg border border-dashed border-border bg-card p-4 text-sm text-faint">
              {noEvidenceLabel}
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
