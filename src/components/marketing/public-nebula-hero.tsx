import { DemoSemanticNebulaCanvas } from "@/components/marketing/demo-semantic-nebula-canvas";
import type { Locale } from "@/i18n/config";
import type { getDictionary } from "@/i18n/dictionaries";

type Dictionary = ReturnType<typeof getDictionary>;

export function PublicNebulaHero({
  locale,
  hero,
  demo,
}: {
  locale: Locale;
  hero: Dictionary["homeHero"];
  demo: Dictionary["demoNebula"];
}) {
  return (
    <section
      aria-label={hero.title}
      className="relative h-full min-h-[620px] overflow-hidden bg-background"
    >
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,173,74,0.16)_0%,rgba(255,173,74,0.08)_14%,rgba(7,13,29,0)_42%),radial-gradient(circle_at_18%_26%,rgba(40,187,255,0.16)_0%,rgba(40,187,255,0)_34%),radial-gradient(circle_at_81%_30%,rgba(168,85,247,0.15)_0%,rgba(168,85,247,0)_30%),radial-gradient(circle_at_22%_78%,rgba(236,72,153,0.1)_0%,rgba(236,72,153,0)_28%),linear-gradient(180deg,#02040d_0%,#06111f_48%,#030614_100%)]" />
        <div className="absolute left-1/2 top-[48%] h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,205,112,0.35)_0%,rgba(255,168,49,0.16)_18%,rgba(255,168,49,0.04)_42%,transparent_70%)] blur-2xl" />
        <div className="absolute left-1/2 top-[48%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-100/10 bg-[radial-gradient(circle,rgba(255,255,255,0.95)_0%,rgba(255,220,142,0.78)_12%,rgba(255,167,56,0.5)_32%,rgba(255,167,56,0)_72%)] opacity-90 blur-[1px]" />
      </div>
      <DemoSemanticNebulaCanvas locale={locale} copy={demo} className="absolute inset-0 h-full min-h-full rounded-none" />
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_52%_46%,transparent_0%,transparent_54%,rgba(3,6,20,0.28)_100%),linear-gradient(180deg,rgba(3,6,20,0.18)_0%,transparent_30%,transparent_64%,rgba(3,6,20,0.6)_100%)]" />

      <div className="pointer-events-none absolute inset-x-0 top-[14%] z-20 flex flex-col items-center px-6 text-center">
        <span className="eyebrow rounded-full border border-border bg-background/30 px-3 py-1 text-dim backdrop-blur-sm">
          Cognition Intelligence Platform
        </span>
        <h1 className="text-aurora mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
          {hero.title}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-dim md:text-lg">{hero.subtitle}</p>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 mx-auto flex max-w-3xl flex-col items-center gap-2 px-6 text-center">
        <p className="max-w-xl text-xs leading-5 text-faint">{hero.microcopy}</p>
        <div className="rounded-full border border-[oklch(0.85_0.15_85/22%)] bg-background/30 px-3 py-1.5 text-[11px] font-medium text-[oklch(0.85_0.15_85)] backdrop-blur-sm">
          {hero.demoLabel}
        </div>
      </div>
    </section>
  );
}
