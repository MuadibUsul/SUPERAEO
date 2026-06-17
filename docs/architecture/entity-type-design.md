# Entity-Type Design — Brand · Person · Website · Product

The four subject types answer fundamentally different questions about "how AI sees
you," so the whole pipeline (wizard → probes → metrics → nebula → opportunities →
report) must adapt per type instead of using one brand-shaped template.

## Core principle

A single **entity spec** per type becomes the source of truth and is consumed by
every stage. One object, many consumers:

```
EntityProfileSpec {
  type, primaryQuestion, wizardFields[], competitorKind,
  probeZoneWeights{}, zoneReframing{}, primaryMetrics[],
  nebulaEmphasis[], opportunityFraming, verdictTemplate, topRisk
}
```

## What each type is actually measuring

| Dimension | BRAND 品牌 | PERSON 人物 | WEBSITE 网站 | PRODUCT 产品 |
|---|---|---|---|---|
| Core question | How is the brand described & recommended in its category? | Does AI know who this person is, what they're known for, and is the bio accurate? | Is the site cited as a trusted source, and for which topics? | Is the product recommended for the right use-cases, with accurate features? |
| Primary metric | Recommendation share vs competitors | Recognition + **factual accuracy** + authority | **Citation / source inclusion** + topical authority | Use-case recommendation + **feature accuracy** + comparison win-rate |
| "Competitor" means | Direct competitor (`direct`) | Peer expert (`peer_expert`) | Alternative source (`alternative_source`) | Substitute product (`substitute_product`) |
| Top risk | Invisible in category recs / mis-categorized | **Hallucinated bio facts + identity confusion** | Not cited; a rival source owns your topics | Wrong specs; lost comparisons to substitutes |
| Audience frame | Buyers choosing in a category | People vetting an expert / hiring / citing | People seeking a trusted reference | Buyers evaluating fit-for-purpose |

## Per-type needs

### BRAND 品牌需求
- **Wizard:** brand name, category, target audience, competitors.
- **Probe emphasis:** implicit recommendation + competition heaviest; scenario fit, brand association, risk/quality, alternatives.
- **Nebula:** benefits, trust, scenarios, competitors, risks, missing — current palette fits.
- **Opportunities:** category questions where the brand is absent → "win the recommendation."
- **Verdict:** "AI sees you as a {category} known for {strengths}; {competitor} owns {question}."

### PERSON 人物需求
- **Wizard:** name, role/field, notable work or links (optional), what they want AI to understand. **Domain is optional** (people often have none).
- **Probe emphasis + zone reframing:** `competition` → **peer ranking** ("top experts in {field}"); `risk_boundary` → **factual accuracy / misattribution** ("is {claim about X} true", "is this the same X as {other}"); add `identity_disambiguation` and `authority/credibility` probes; "who is X / what are they known for."
- **Nebula:** known-for topics, credentials, affiliations, notable works, **misconceptions/errors**, peers.
- **Metrics:** recognition (does AI know them), **accuracy** (bio facts correct), authority (cited as expert), topic ownership, peer rank.
- **Opportunities:** topics they should own but don't; **correct factual errors**; get into "top experts" lists.
- **Verdict:** "AI knows you as {role} known for {topics}; it {correctly/incorrectly} states {fact}; {peer} is cited more for {topic}."
- **Distinct concern:** reputational accuracy + name-collision disambiguation are first-class, not edge cases.

### WEBSITE 网站需求
- **Wizard:** URL (**required**), site type (publisher/docs/ecommerce/SaaS/blog), target topics/questions, main content themes.
- **Probe emphasis + reframing:** lead with **citation/source** probes ("best resources for {topic}", "where to learn {topic}", "sources for {question}", "is {site} reliable"); topical authority; coverage gaps. `implicit_recommendation` → **source inclusion**.
- **Nebula:** topics cited-for, content themes, competing sources, missing topics, trust signals.
- **Metrics:** **citation rate / source inclusion** is primary (not "recommendation"); topical authority by theme; share of citations vs other sources; # of target questions cited for.
- **Opportunities:** high-intent questions where the site *should* be cited but isn't → content to publish; topics a rival source dominates.
- **Verdict:** "AI cites you as a source for {topics}; for {other topics} it cites {competitor source}; you're missing from {questions}."

### PRODUCT 产品需求
- **Wizard:** product name, category, platform/links (optional), purchase scenarios, core selling points.
- **Probe emphasis + reframing:** "best {category} for {use-case}", "{product} vs {substitute}", "is {product} worth it", **feature/spec probes**, "alternatives to {product}", price/value, buying-decision ("should I buy {product} for {need}"), pros/cons, target-user fit. `scenario_fit` → **use-case / job-to-be-done fit**.
- **Nebula:** use cases, features/benefits, substitutes, pros, **cons/risks**, target users, price perception.
- **Metrics:** use-case recommendation, **feature-association accuracy**, comparison win-rate vs substitutes, value sentiment, inclusion in "best X for Y" lists.
- **Opportunities:** "best X for {use-case}" where product absent; **correct wrong spec/feature claims**; comparison questions vs substitutes.
- **Verdict:** "AI recommends you for {use-cases}, associates you with {features}; for {use-case} it picks {substitute}; it misstates {spec}."

## Where this plugs in (refactor surface — NOT yet built)

1. `src/server/entity/entity-profiles.ts` — the spec objects (one per type) as the single source of truth.
2. **Wizard** (`project-form.tsx` / `getEntityContextConfig`) — already partly entity-aware; drive fields + required-ness from the spec (Person: domain optional; Website: URL required).
3. **Probe generation** (`probe-templates.ts`, `config.ts zoneQuotas`) — per-type zone weights + zone reframing/question templates; add Person `identity_disambiguation`/`accuracy` and Website `source_inclusion` framings.
4. **Metrics** (`cip-metrics.ts`) — surface the type's primary metrics first (Website→citation, Person→accuracy, Product→feature accuracy).
5. **Nebula labels** — per-type term-type emphasis & legend.
6. **Report** (`reports/page.tsx`) — verdict template + reorder sections by what matters per type (Website leads with citation; Person leads with accuracy/identity).

## Compatibility notes

- `getComparisonCategory()` already maps the four → `direct / peer_expert / alternative_source / substitute_product`. Build on it.
- Keep `BRAND` as the baseline; add per-type overrides so existing brand projects are unchanged.
- The probe `max1000` quotas stay; only the **zone reframing + per-type weights** change per type.
