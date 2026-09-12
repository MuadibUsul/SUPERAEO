"use client";

import { useRef } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type EvidenceSection = { label: string; items: string[] };
type ScoreRow = { label: string; value: string | number };

export function EvidenceDrawer({ open, onClose, title, subtitle, summary, scoreTitle, scores, sections, closeLabel, noEvidenceLabel }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; summary?: string;
  scoreTitle: string; scores: ScoreRow[]; sections: EvidenceSection[]; closeLabel: string; noEvidenceLabel: string;
}) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const hasSectionItems = sections.some(section => section.items.length > 0);
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/25 backdrop-blur-[2px]" />
      <Dialog.Content
        onOpenAutoFocus={() => { previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
        onCloseAutoFocus={event => { event.preventDefault(); previousFocus.current?.focus(); }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-card text-foreground shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-6">
          <div className="min-w-0">
            {subtitle ? <p className="text-xs font-medium text-primary">{subtitle}</p> : null}
            <Dialog.Title className="mt-2 text-xl font-semibold leading-snug tracking-tight">{title}</Dialog.Title>
            <Dialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">{summary ?? subtitle ?? noEvidenceLabel}</Dialog.Description>
          </div>
          <Dialog.Close asChild><Button type="button" variant="ghost" size="icon" aria-label={closeLabel}><X className="size-4" /></Button></Dialog.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {hasSectionItems ? sections.filter(section => section.items.length > 0).map((section, index) => <section key={section.label} className="mb-7">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><span className="font-mono text-[10px] text-primary">{String(index + 1).padStart(2, "0")}</span>{section.label}</h3>
            <ul className="mt-3 space-y-2">{section.items.map((item, itemIndex) => <li key={itemIndex} className="break-words rounded-lg bg-muted/60 px-4 py-3 text-sm leading-6 text-muted-foreground">{item}</li>)}</ul>
          </section>) : <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">{noEvidenceLabel}</p>}
          {scores.length > 0 ? <details className="border-t border-border pt-5"><summary className="cursor-pointer text-sm font-medium">{scoreTitle}</summary><dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4">{scores.map(score => <div key={score.label} className="border-b border-border pb-3"><dt className="text-xs text-muted-foreground">{score.label}</dt><dd className="mt-1 font-mono text-base">{score.value}</dd></div>)}</dl></details> : null}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
