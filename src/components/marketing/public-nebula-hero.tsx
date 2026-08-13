import { CognitionUniverse } from "@/components/semantic-intelligence/cognition-universe";
import { demoUniverseNodes } from "@/components/semantic-intelligence/demo-universe";
import type { Locale } from "@/i18n/config";
import type { getDictionary } from "@/i18n/dictionaries";

type Dictionary = ReturnType<typeof getDictionary>;

export function PublicNebulaHero({
  locale,
  hero,
}: {
  locale: Locale;
  hero: Dictionary["homeHero"];
}) {
  return (
    <section
      aria-label={hero.title}
      className="relative h-full min-h-[620px] overflow-hidden bg-background"
    >
      {/* Near-black fallback shown only if the canvas fails to draw. */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(60,110,180,0.08)_0%,transparent_46%),linear-gradient(180deg,#020205_0%,#05070e_55%,#010103_100%)]" />
      <CognitionUniverse
        variant="ambient"
        nodes={demoUniverseNodes()}
        subjectName={locale === "zh-CN" ? "你的品牌" : "Your brand"}
        className="absolute inset-0 h-full w-full"
      />
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_52%_46%,transparent_0%,transparent_56%,rgba(1,1,3,0.34)_100%),linear-gradient(180deg,rgba(1,1,3,0.2)_0%,transparent_32%,transparent_66%,rgba(1,1,3,0.66)_100%)]" />

      <div className="pointer-events-none absolute inset-x-0 top-[14%] z-20 flex flex-col items-center px-6 text-center">
        <span className="eyebrow rounded-full border border-border bg-background/30 px-3 py-1 text-dim backdrop-blur-sm">
          Cognition Intelligence Platform
        </span>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-balance text-foreground md:text-6xl">
          {hero.title}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-dim md:text-lg">{hero.subtitle}</p>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 mx-auto flex max-w-3xl flex-col items-center gap-2 px-6 text-center">
        <p className="max-w-xl text-xs leading-5 text-faint">{hero.microcopy}</p>
        <div className="rounded-full border border-primary/30 bg-background/30 px-3 py-1.5 text-[11px] font-medium text-primary backdrop-blur-sm">
          {hero.demoLabel}
        </div>
      </div>
    </section>
  );
}
