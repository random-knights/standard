/**
 * index.ts - THE EARTH HEALTH SCORE (E+) CONFORMANCE TEST.
 *
 * THIS IS THE CANONICAL COPY. Owner decision D6 (2026-09-13) published this
 * checker from the standard repository and forbade mirroring it. The producer
 * (the private ruok repository) CONSUMES this package pinned to a commit of
 * this repository; it does not keep a second copy. Two copies of one rule is
 * the drift condition the E+ audits kept finding, so if you are about to copy
 * this file somewhere, that is the thing the decision exists to stop.
 *
 * WHAT THIS IS. Given ONE published `earth.healthscore.v1` document and NOTHING
 * ELSE - no private inputs, no source grids, no access to any producer's
 * constants - this recomputes every number the document publishes, recomputes
 * every liveness claim the document makes, and reports any disagreement at
 * published precision:
 *
 *   - every region's `score`      (coverage-weighted mean of its subScores)
 *   - every region's `confidence` (available weight / applicable weight)
 *   - the headline `global.score` (exposure-weighted mean of the regions)
 *   - `global.confidence`, `global.measuredCoverage`
 *   - every `global.subScores[].normalized` (per-domain exposure rollup)
 *   - every `subScores[].weight` against the published `meta.weights`
 *   - `meta.isLive` and `meta.notLiveDomains` against the per-domain
 *     provenance block, by the rules of methodology section 5.3
 *
 * It implements checks 1 to 11 of E+ methodology section 7.2 (standard
 * 1.2.0), plus the `meta.eplusVersion` requirement of section 7.1 item 1a.
 * Check 9 is the section 6 BREACH PANEL, including the two evaluation modes of
 * section 6.1. Check 10 is the fire warm-up rule of section 3.6 (R3). Check 11
 * is R6, section 3.8: a synthetic input never feeds the score. Check 7 applies
 * each domain's own freshness window (R7, section 5.3). A missing version
 * stamp and a missing panel are reported as a WARNING, and as findings under
 * `{ strict: true }`; a panel that IS published is checked as a finding in
 * every mode. Check 11 is a finding for a document that claims standard 1.2.0
 * or later and a warning for one that claims an earlier draft. See the README
 * beside this file for why.
 *
 * Check 9 is the one that makes the panel worth publishing. Section 6 requires
 * that an entry's state be computed from the published control VALUE against
 * the published THRESHOLD and never from a domain's normalized health, so this
 * recomputes the state and the transgressed flag from the value and the
 * threshold in the document. A producer that read a domain's health instead
 * passes every other check here and fails this one: that is consensus finding
 * C5 (ocean acidification publishing health 94.5 while its own control value
 * 2.7 is past every published version of its boundary) turned into arithmetic
 * a third party can run.
 *
 * WHY IT EXISTS. Four independent audits (2026-09-10, consensus finding C2)
 * showed the published headline could not be derived from the published
 * document: exposure-weighting the ten published regions gave 58.95 against a
 * published 63.4, because the headline was rolled up from a second, unmasked
 * region set the document never carried. A separate finding (C4) showed about
 * 64 percent of delivered weight was generated while the document asserted
 * `isLive: true` unconditionally. Owner decision D1 made the headline the
 * rollup of the published regions and required this script; section 5.3 made
 * liveness computed rather than asserted, and check 7 here is what enforces it.
 *
 * An implementation claims E+ conformance when `verifyPublishedScoreDoc`
 * returns `ok: true` for the document it publishes. This file is written to
 * that contract deliberately:
 *
 *   - it reads ONLY the document (weights come from `meta.weights`, never from
 *     any producer constant), so it can be run against any implementation;
 *   - it imports nothing at all, from anywhere, so a producer bug cannot be
 *     canceled out by the same bug in the checker;
 *   - the arithmetic is re-implemented here from the published
 *     `meta.derivation.steps` rather than shared with any producer.
 *
 * Run it from the command line with `cli.ts` beside this file.
 */

/** One disagreement between a published value and the recomputed one. */
export interface ConformanceFinding {
  /** JSON path of the value that disagrees, e.g. `regions.europe.score`. */
  path: string;
  published: number | string | boolean | null;
  recomputed: number | string | boolean | null;
  note: string;
}

/**
 * A requirement of the standard that this document does not meet, but which
 * does not fail the run by default. Today there is exactly one: section 7.1
 * item 1a, `meta.eplusVersion`. Warnings become findings under
 * `{ strict: true }`.
 */
export type ConformanceWarning = ConformanceFinding;

export interface ConformanceOptions {
  /**
   * Promote every warning to a finding, so a document missing anything the
   * standard requires is not conformant. This is the gate to run once the
   * producer emits `meta.eplusVersion`.
   */
  strict?: boolean;
}

export interface ConformanceResult {
  ok: boolean;
  strict: boolean;
  schema: string | null;
  /** The E+ STANDARD version the document claims (section 7.1 item 1a). */
  eplusVersion: string | null;
  /** The IMPLEMENTATION version, a different thing (section 7.1 item 1a). */
  methodologyVersion: string | null;
  generatedAt: string | null;
  /** Number of published values recomputed and compared. */
  checked: number;
  headlinePublished: number | null;
  headlineRecomputed: number | null;
  /** The rollup BEFORE round1, so a reader can see the full-precision value
   * (58.9504741 on the 2026-09-10 audited document). */
  headlineRecomputedExact: number | null;
  /** The v0.5-to-v0.7 unmasked ring, when the document retains it (v0.8+). */
  globalRingDiagnostic: number | null;
  /** What `meta.isLive` says, and what section 5.3 says it should say. */
  isLivePublished: boolean | null;
  isLiveRecomputed: boolean | null;
  /** The not-live weight-carrying domains, recomputed from the document. */
  notLiveDomainsRecomputed: string[];
  /**
   * Section 6, the breach panel. `null` when the document publishes no
   * `boundaries` block at all, which is reported as a warning rather than a
   * finding: see check 9.
   */
  boundaryPanelSize: number | null;
  breachCountPublished: number | null;
  /** The count of panel entries with `transgressed: true`, recomputed here. */
  breachCountRecomputed: number | null;
  findings: ConformanceFinding[];
  warnings: ConformanceWarning[];
}

// Rounding, re-implemented rather than imported: half-up to 1 and 2 decimals.
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
// Compare two values that are both already rounded to the same precision.
function same(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function strList(v: unknown): string[] | null {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : null;
}

/** Semver, loosely: three dot-separated numbers with an optional suffix. */
const SEMVER = /^\d+\.\d+\.\d+(?:[-+].*)?$/;

/**
 * True when [version] names standard 1.2.0 or later, the first ratified
 * version and the first to forbid a synthetic input in the score (R6). A
 * missing or unreadable version is not 1.2.0.
 */
function atLeast120(version: string | null): boolean {
  if (version === null) return false;
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return false;
  const [major, minor] = [Number(m[1]), Number(m[2])];
  return major > 1 || (major === 1 && minor >= 2);
}

/** Section 3.6: the fewest baseline days a weight-carrying fire reading has. */
const FIRE_MIN_BASELINE_DAYS = 30;

/** The two rungs of the section 5.1 ladder that can carry a live claim. */
const LIVE_RUNGS = new Set(["measured", "vendor-published"]);

interface PublishedSub {
  layerId: string;
  normalized: number;
  weight: number;
  /** Section 5.2 requires these on every sub-score; null means absent. */
  provenance: string | null;
  synthetic: boolean | null;
  /** Section 3.6: the fire `baseline` block, when the sub-score carries one. */
  baselineN: number | null;
  baselineWarmUp: boolean | null;
}

/** Section 3.6: a warm-up reading, published visible and carrying no weight. */
interface WarmUpReading {
  layerId: string | null;
  provenance: string | null;
  synthetic: boolean | null;
  weight: number | null;
  baselineN: number | null;
  baselineWarmUp: boolean | null;
}

interface PublishedRegion {
  id: string;
  score: number | null;
  confidence: number | null;
  measuredCoverage: number | null;
  exposure: number | null;
  notApplicableDomains: string[] | null;
  /** Section 4.2 (1.2.0): domains in warm-up; their weight leaves confidence. */
  warmUpDomains: string[];
  warmUpReadings: WarmUpReading[];
  subScores: PublishedSub[];
}

interface DomainProvenance {
  provenance: string | null;
  synthetic: boolean | null;
  available: boolean | null;
  ageHours: number | null;
  fresh: boolean | null;
  /** Section 5.3 (R7): a non-daily source's own window and its two parts. */
  freshnessWindowHours: number | null;
  cadenceHours: number | null;
  lagHours: number | null;
}

/** Reads the `baseline` block of section 3.6 off a sub-score or reading. */
function readBaseline(o: Record<string, unknown> | undefined): {
  baselineN: number | null;
  baselineWarmUp: boolean | null;
} {
  const b = o?.baseline;
  if (b === null || typeof b !== "object" || Array.isArray(b)) {
    return { baselineN: null, baselineWarmUp: null };
  }
  const r = b as Record<string, unknown>;
  return { baselineN: num(r.n), baselineWarmUp: bool(r.warmUp) };
}

function readSubScores(raw: unknown): PublishedSub[] {
  if (!Array.isArray(raw)) return [];
  const out: PublishedSub[] = [];
  for (const s of raw) {
    const o = s as Record<string, unknown>;
    const layerId = str(o?.layerId);
    const normalized = num(o?.normalized);
    const weight = num(o?.weight);
    if (layerId === null || normalized === null || weight === null) continue;
    out.push({
      layerId,
      normalized,
      weight,
      provenance: str(o?.provenance),
      synthetic: bool(o?.synthetic),
      ...readBaseline(o),
    });
  }
  return out;
}

function readWarmUpReadings(raw: unknown): WarmUpReading[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    return {
      layerId: str(o.layerId),
      provenance: str(o.provenance),
      synthetic: bool(o.synthetic),
      weight: num(o.weight),
      ...readBaseline(o),
    };
  });
}

function readRegions(raw: unknown): PublishedRegion[] {
  const regions = (raw as { regions?: unknown } | null)?.regions;
  if (regions === null || typeof regions !== "object") return [];
  const entries = Array.isArray(regions)
    ? (regions as Record<string, unknown>[]).map(
        (r) => [str(r?.regionId) ?? str(r?.id) ?? "", r] as const,
      )
    : Object.entries(regions as Record<string, unknown>);
  return entries.map(([id, value]) => {
    const r = value as Record<string, unknown>;
    const na = r?.notApplicableDomains;
    return {
      id,
      score: num(r?.score),
      confidence: num(r?.confidence),
      measuredCoverage: num(r?.measuredCoverage),
      exposure: num(r?.exposure),
      notApplicableDomains: Array.isArray(na)
        ? na.filter((d): d is string => typeof d === "string")
        : null,
      warmUpDomains: strList(r?.warmUpDomains) ?? [],
      warmUpReadings: readWarmUpReadings(r?.warmUpReadings),
      subScores: readSubScores(r?.subScores),
    };
  });
}

function readDomainProvenance(
  raw: unknown,
): Map<string, DomainProvenance> | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = new Map<string, DomainProvenance>();
  for (const [domain, value] of Object.entries(raw as Record<string, unknown>)) {
    const o = (value ?? {}) as Record<string, unknown>;
    out.set(domain, {
      provenance: str(o.provenance),
      synthetic: bool(o.synthetic),
      available: bool(o.available),
      ageHours: num(o.ageHours),
      fresh: bool(o.fresh),
      freshnessWindowHours: num(o.freshnessWindowHours),
      cadenceHours: num(o.cadenceHours),
      lagHours: num(o.lagHours),
    });
  }
  return out;
}

/**
 * Section 6: the nine planetary boundaries, in the order the methodology lists
 * them. A conforming panel carries all nine on every refresh, so this list is
 * the membership test as well as the count. Framework names, not producer
 * domain ids: the panel is a list of BOUNDARIES, not a list of anyone's
 * domains.
 */
const NINE_BOUNDARY_IDS: readonly string[] = [
  "climate-change",
  "biosphere-integrity",
  "land-system-change",
  "freshwater-change",
  "biogeochemical-flows",
  "ocean-acidification",
  "atmospheric-aerosol-loading",
  "stratospheric-ozone-depletion",
  "novel-entities",
];

/** The four states of section 6. Nothing else is a state. */
const SAFE = "Safe operating space";
const UNCERTAIN = "Zone of uncertainty";
const BEYOND = "Beyond the boundary";
const UNKNOWN = "unknown";
const PANEL_STATES: readonly string[] = [SAFE, UNCERTAIN, BEYOND, UNKNOWN];

/**
 * Section 6, condition 3: the domains whose indicator is NOT the accepted
 * control variable of the boundary they have been read against, so no panel
 * entry may take its value from one of them. `air`, `ocean` and `biodiversity`
 * are named in the methodology; the four contextual proxies are excluded by
 * the same rule.
 */
const NON_CONTROL_DOMAINS = new Set([
  "air",
  "ocean",
  "biodiversity",
  "fire",
  "cryosphere",
  "conservation",
  "human",
]);

/** The two provenance rungs that do not force `provisional` (section 6). */
const NON_PROVISIONAL_RUNGS = new Set(["measured", "vendor-published"]);

interface PanelEntry {
  index: number;
  id: string | null;
  state: string | null;
  transgressed: boolean | null;
  hasTransgressedKey: boolean;
  controlVariableCitation: string | null;
  thresholdBoundary: number | null;
  thresholdHighRisk: number | null;
  thresholdDirection: string | null;
  thresholdCitation: string | null;
  hasValue: boolean;
  controlValue: number | null;
  valueDomainId: string | null;
  valueProvenance: string | null;
  provisional: boolean | null;
  evaluationNote: string | null;
  /** Section 6.1 (R1): the evaluation mode, and the assessed edition's data. */
  mode: string | null;
  hasAssessment: boolean;
  assessmentEdition: string | null;
  assessmentYear: number | string | null;
  assessmentCitation: string | null;
  assessmentValue: number | null;
}

/** Section 6.1: the three modes. Nothing else is a mode. */
const PANEL_MODES: readonly string[] = ["live", "assessed", "unknown"];

function readPanel(raw: unknown): PanelEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e, index) => {
    const o = (e ?? {}) as Record<string, unknown>;
    const threshold = (o.threshold ?? {}) as Record<string, unknown>;
    const valueRaw = o.value;
    const hasValue =
      valueRaw !== null && valueRaw !== undefined && typeof valueRaw === "object";
    const value = (hasValue ? valueRaw : {}) as Record<string, unknown>;
    const assessmentRaw = o.assessment;
    const hasAssessment =
      assessmentRaw !== null &&
      assessmentRaw !== undefined &&
      typeof assessmentRaw === "object" &&
      !Array.isArray(assessmentRaw);
    const assessment = (hasAssessment ? assessmentRaw : {}) as Record<
      string,
      unknown
    >;
    const year = assessment.year;
    return {
      index,
      id: str(o.id),
      state: str(o.state),
      transgressed: bool(o.transgressed),
      hasTransgressedKey:
        o.transgressed !== null && o.transgressed !== undefined,
      controlVariableCitation: str(o.controlVariableCitation),
      thresholdBoundary: num(threshold.boundary),
      thresholdHighRisk: num(threshold.highRisk),
      thresholdDirection: str(threshold.direction),
      thresholdCitation: str(threshold.citation),
      hasValue,
      controlValue: hasValue ? num(value.controlValue) : null,
      valueDomainId: hasValue ? str(value.domainId) : null,
      valueProvenance: hasValue ? str(value.provenance) : null,
      provisional: hasValue ? bool(value.provisional) : null,
      evaluationNote: str(o.evaluationNote),
      mode: str(o.mode),
      hasAssessment,
      assessmentEdition: str(assessment.edition),
      assessmentYear:
        typeof year === "number" && Number.isFinite(year)
          ? year
          : typeof year === "string" && year !== ""
            ? year
            : null,
      assessmentCitation: str(assessment.citation),
      assessmentValue: num(assessment.value),
    };
  });
}

/**
 * Section 6: the state a conforming panel entry must publish, computed from
 * the control VALUE against the published THRESHOLD and from nothing else.
 *
 * `benefit` means higher is safer (aragonite saturation, forest remaining), so
 * the high-risk line sits BELOW the boundary. `burden` means higher is riskier
 * (CO2 ppm, phosphorus applied), so it sits above. Being exactly ON the
 * boundary value is not past it.
 *
 * A threshold with no high-risk line cannot place a value BEYOND one, so a
 * transgression there reads as the zone of uncertainty. That is the
 * conservative reading and it keeps a sourced absence from becoming an
 * invented severity.
 */
function stateFromValue(
  value: number,
  boundary: number,
  highRisk: number | null,
  direction: string | null,
): { state: string; transgressed: boolean } | null {
  if (direction !== "benefit" && direction !== "burden") return null;
  const past =
    direction === "benefit" ? value < boundary : value > boundary;
  if (!past) return { state: SAFE, transgressed: false };
  if (highRisk === null) return { state: UNCERTAIN, transgressed: true };
  const beyond =
    direction === "benefit" ? value < highRisk : value > highRisk;
  return { state: beyond ? BEYOND : UNCERTAIN, transgressed: true };
}

/**
 * Recompute every published number and every liveness claim in [raw] from
 * [raw] alone.
 *
 * `ok` is true only when every recomputed value matches the published one at
 * the precision the document publishes it to. A document that omits what a
 * value needs (for example a pre-v0.8 document with no per-region
 * `notApplicableDomains`) is NOT conformant: the finding says what is missing,
 * because a number a reader cannot check is the defect this test exists for.
 */
export function verifyPublishedScoreDoc(
  raw: unknown,
  options: ConformanceOptions = {},
): ConformanceResult {
  const strict = options.strict === true;
  const doc = (raw ?? {}) as Record<string, unknown>;
  const meta = (doc.meta ?? {}) as Record<string, unknown>;
  const global = (doc.global ?? {}) as Record<string, unknown>;
  const findings: ConformanceFinding[] = [];
  const warnings: ConformanceWarning[] = [];
  let checked = 0;
  const fail = (
    path: string,
    published: number | string | boolean | null,
    recomputed: number | string | boolean | null,
    note: string,
  ): void => {
    findings.push({ path, published, recomputed, note });
  };
  // A warning under the default mode, a finding under strict. One call site
  // decides both, so the two modes cannot drift apart.
  const warn = (
    path: string,
    published: number | string | boolean | null,
    recomputed: number | string | boolean | null,
    note: string,
  ): void => {
    (strict ? findings : warnings).push({ path, published, recomputed, note });
  };

  const weights = (meta.weights ?? {}) as Record<string, unknown>;
  const declaredWeights = new Map<string, number>();
  for (const [k, v] of Object.entries(weights)) {
    const w = num(v);
    if (w !== null) declaredWeights.set(k, w);
  }
  const rawWeightSum = [...declaredWeights.values()].reduce((a, w) => a + w, 0);
  const regions = readRegions(doc);

  // -- check 1a: the standard version stamp (section 7.1 item 1a, D4) --------
  // Reported before the early return below, so even an empty document says
  // which standard it claims to be written against.
  const eplusVersion = str(meta.eplusVersion);
  if (eplusVersion === null) {
    warn(
      "meta.eplusVersion",
      null,
      "1.0.0",
      "the document does not name the E+ STANDARD version it conforms to " +
        "(section 7.1 item 1a). meta.methodologyVersion is the IMPLEMENTATION " +
        "version and is a different thing. A document without " +
        "meta.eplusVersion does not conform to 1.0.0. This is a warning by " +
        "default and a finding under strict mode.",
    );
  } else if (!SEMVER.test(eplusVersion)) {
    warn(
      "meta.eplusVersion",
      eplusVersion,
      null,
      "meta.eplusVersion is not a semver string (section 7.1 item 1a)",
    );
  }

  if (regions.length === 0) {
    fail("regions", null, null, "no regions published; nothing is derivable");
    return {
      ok: false,
      strict,
      schema: str(meta.schema),
      eplusVersion,
      methodologyVersion: str(meta.methodologyVersion),
      generatedAt: str(meta.generatedAt),
      checked,
      headlinePublished: num(global.score),
      headlineRecomputed: null,
      headlineRecomputedExact: null,
      globalRingDiagnostic: null,
      isLivePublished: bool(meta.isLive),
      isLiveRecomputed: null,
      notLiveDomainsRecomputed: [],
      boundaryPanelSize: null,
      breachCountPublished: null,
      breachCountRecomputed: null,
      findings,
      warnings,
    };
  }
  if (declaredWeights.size === 0) {
    fail(
      "meta.weights",
      null,
      null,
      "no declared weights published; per-region weights cannot be checked and " +
        "confidence has no denominator",
    );
  }

  // -- steps 1 to 3: per region -----------------------------------------------
  for (const r of regions) {
    if (r.subScores.length === 0) continue;

    // step 1: every published weight must be the declared weight for its domain.
    for (const s of r.subScores) {
      const declared = declaredWeights.get(s.layerId);
      if (declared === undefined) {
        fail(
          `regions.${r.id}.subScores.${s.layerId}.weight`,
          s.weight,
          null,
          "domain is not in meta.weights",
        );
        continue;
      }
      checked += 1;
      if (!same(declared, s.weight)) {
        fail(
          `regions.${r.id}.subScores.${s.layerId}.weight`,
          s.weight,
          declared,
          "published weight disagrees with meta.weights",
        );
      }
    }

    // step 2: region score = round1(sum(normalized*weight)/sum(weight)).
    const availWeight = r.subScores.reduce((a, s) => a + s.weight, 0);
    const recomputedScore =
      availWeight > 0
        ? round1(
            r.subScores.reduce((a, s) => a + s.normalized * s.weight, 0) /
              availWeight,
          )
        : 0;
    checked += 1;
    if (r.score === null) {
      fail(`regions.${r.id}.score`, null, recomputedScore, "score not published");
    } else if (!same(r.score, recomputedScore)) {
      fail(
        `regions.${r.id}.score`,
        r.score,
        recomputedScore,
        "region score is not the coverage-weighted mean of its published subScores",
      );
    }

    // step 3: confidence = round2(availWeight / (rawWeightSum - notApplicable
    // - warmUp)). Standard 1.2.0 (section 4.2): a domain in warm-up is
    // published visible but carries no weight, and its weight leaves the
    // denominator so a baseline still building does not depress confidence.
    if (r.confidence !== null && declaredWeights.size > 0) {
      if (r.notApplicableDomains === null) {
        fail(
          `regions.${r.id}.confidence`,
          r.confidence,
          null,
          "confidence is not derivable: the document does not publish " +
            "regions." +
            r.id +
            ".notApplicableDomains, so a not-applicable domain cannot be told " +
            "from a missing one and the denominator is unknown (pre-v0.8 shape)",
        );
      } else {
        const naWeight = r.notApplicableDomains.reduce(
          (a, d) => a + (declaredWeights.get(d) ?? 0),
          0,
        );
        const warmUpWeight = r.warmUpDomains
          .filter((d) => !r.notApplicableDomains?.includes(d))
          .reduce((a, d) => a + (declaredWeights.get(d) ?? 0), 0);
        const applicable = rawWeightSum - naWeight - warmUpWeight;
        const recomputedConfidence =
          applicable > 0 ? round2(availWeight / applicable) : 0;
        checked += 1;
        if (!same(r.confidence, recomputedConfidence)) {
          fail(
            `regions.${r.id}.confidence`,
            r.confidence,
            recomputedConfidence,
            "confidence is not availableWeight / applicableWeight",
          );
        }
      }
    }

    // -- check 10: warm-up carries no weight (section 3.6, R3) ---------------
    // A percentile over fewer than 30 baseline days is too coarse to rank a
    // day against its own season, so it never carries weight. Two outputs
    // conform: nothing, or a visible reading in warmUpReadings (never in
    // subScores) that is declared synthetic and whose weight has left the
    // confidence denominator above.
    for (const s of r.subScores) {
      if (s.layerId !== "fire") continue;
      if (s.baselineN === null && s.baselineWarmUp === null) continue;
      checked += 1;
      if (
        s.baselineWarmUp === true ||
        (s.baselineN !== null && s.baselineN < FIRE_MIN_BASELINE_DAYS)
      ) {
        fail(
          `regions.${r.id}.subScores.fire.baseline`,
          s.baselineN,
          FIRE_MIN_BASELINE_DAYS,
          "a fire sub-score in warm-up carries weight. With fewer than " +
            `${FIRE_MIN_BASELINE_DAYS} baseline days the region publishes no ` +
            "weight-carrying fire sub-score; a visible reading goes in " +
            "warmUpReadings, not in subScores (section 3.6, R3)",
        );
      }
    }
    const scoredIds = new Set(r.subScores.map((s) => s.layerId));
    for (const d of r.warmUpDomains) {
      if (scoredIds.has(d)) {
        fail(
          `regions.${r.id}.warmUpDomains`,
          d,
          null,
          `${d} is listed in warm-up and also carries weight in subScores; a ` +
            "warm-up domain carries no weight (sections 3.6 and 4.2)",
        );
      }
      if (r.notApplicableDomains?.includes(d)) {
        fail(
          `regions.${r.id}.warmUpDomains`,
          d,
          null,
          `${d} is both not applicable and in warm-up; a domain is never in ` +
            "both lists (section 4.2)",
        );
      }
    }
    r.warmUpReadings.forEach((w, i) => {
      const where = `regions.${r.id}.warmUpReadings[${i}]`;
      checked += 1;
      if (w.layerId === null || !r.warmUpDomains.includes(w.layerId)) {
        fail(
          `${where}.layerId`,
          w.layerId,
          "a domain listed in warmUpDomains",
          "a warm-up reading names a domain the region lists in warmUpDomains, " +
            "so its weight is visibly out of the confidence denominator " +
            "(section 4.2)",
        );
      }
      if (w.synthetic !== true || w.provenance !== "synthetic") {
        fail(
          `${where}.provenance`,
          w.provenance,
          "synthetic",
          "a warm-up reading is declared synthetic, because the baseline it " +
            "needs does not exist yet (section 3.6)",
        );
      }
      if (w.weight !== null && w.weight !== 0) {
        fail(
          `${where}.weight`,
          w.weight,
          0,
          "a warm-up reading carries no weight (section 3.6)",
        );
      }
      if (
        w.layerId === "fire" &&
        (w.baselineN === null || w.baselineN >= FIRE_MIN_BASELINE_DAYS)
      ) {
        fail(
          `${where}.baseline.n`,
          w.baselineN,
          `under ${FIRE_MIN_BASELINE_DAYS}`,
          "a fire warm-up reading publishes its baseline block with n under " +
            `${FIRE_MIN_BASELINE_DAYS}; at ${FIRE_MIN_BASELINE_DAYS} or more ` +
            "days the reading carries its weight (section 3.6)",
        );
      }
    });
  }

  // -- check 11: a synthetic input never feeds the score (section 3.8, R6) ---
  // Standard 1.2.0 forbids it. A document written against an earlier draft
  // was allowed to, so for such a document this is a warning (a finding under
  // strict), and for a 1.2.0 document it is a finding.
  const r6Binding = atLeast120(str(meta.eplusVersion));
  for (const r of regions) {
    for (const s of r.subScores) {
      if (s.synthetic !== true && s.provenance !== "synthetic") continue;
      (r6Binding ? fail : warn)(
        `regions.${r.id}.subScores.${s.layerId}`,
        s.provenance ?? "synthetic",
        "no sub-score",
        `${s.layerId} is scored from a synthetic input. Under E+ 1.2.0 a ` +
          "synthetic input never feeds the score: the domain publishes no " +
          "sub-score and its weight counts as missing in confidence " +
          "(section 3.8, R6)." +
          (r6Binding
            ? ""
            : " This document claims an earlier draft, so this is a warning " +
              "by default and a finding under strict mode."),
      );
    }
  }

  // -- step 4: the headline ---------------------------------------------------
  const scoredRegions = regions.filter(
    (r) => r.subScores.length > 0 && r.score !== null && r.exposure !== null,
  );
  const exposureTotal = scoredRegions.reduce((a, r) => a + (r.exposure ?? 0), 0);
  let headlineRecomputed: number | null = null;
  let headlineRecomputedExact: number | null = null;
  if (scoredRegions.length > 0 && exposureTotal > 0) {
    headlineRecomputedExact =
      scoredRegions.reduce((a, r) => a + (r.score ?? 0) * (r.exposure ?? 0), 0) /
      exposureTotal;
    headlineRecomputed = round1(headlineRecomputedExact);
  }
  const headlinePublished = num(global.score);
  checked += 1;
  if (headlinePublished === null) {
    fail("global.score", null, headlineRecomputed, "headline not published");
  } else if (
    headlineRecomputed === null ||
    !same(headlinePublished, headlineRecomputed)
  ) {
    fail(
      "global.score",
      headlinePublished,
      headlineRecomputed,
      "THE HEADLINE IS NOT DERIVABLE FROM THIS DOCUMENT: it is not the " +
        "exposure-weighted mean of the regions published here (E+ consensus " +
        "finding C2). A document whose headline comes from region inputs it does " +
        "not publish cannot be checked by anyone who holds only the document.",
    );
  }

  // global confidence + measuredCoverage: the same exposure-weighted mean.
  const confRegions = scoredRegions.filter((r) => r.confidence !== null);
  if (confRegions.length === scoredRegions.length && exposureTotal > 0) {
    const recomputed = round2(
      confRegions.reduce(
        (a, r) => a + (r.confidence ?? 0) * (r.exposure ?? 0),
        0,
      ) / exposureTotal,
    );
    const published = num(global.confidence);
    if (published !== null) {
      checked += 1;
      if (!same(published, recomputed)) {
        fail(
          "global.confidence",
          published,
          recomputed,
          "global confidence is not the exposure-weighted mean of the published " +
            "region confidences",
        );
      }
    }
  }
  const mcRegions = scoredRegions.filter((r) => r.measuredCoverage !== null);
  const publishedMc = num(global.measuredCoverage);
  if (
    publishedMc !== null &&
    mcRegions.length === scoredRegions.length &&
    exposureTotal > 0
  ) {
    const recomputed = round2(
      mcRegions.reduce(
        (a, r) => a + (r.measuredCoverage ?? 0) * (r.exposure ?? 0),
        0,
      ) / exposureTotal,
    );
    checked += 1;
    if (!same(publishedMc, recomputed)) {
      fail(
        "global.measuredCoverage",
        publishedMc,
        recomputed,
        "global measuredCoverage is not the exposure-weighted mean of the " +
          "published region values",
      );
    }
  }

  // -- step 5: the per-domain global rollup chips -----------------------------
  const byLayer = new Map<string, { wsum: number; vsum: number }>();
  for (const r of scoredRegions) {
    for (const s of r.subScores) {
      const acc = byLayer.get(s.layerId) ?? { wsum: 0, vsum: 0 };
      acc.wsum += r.exposure ?? 0;
      acc.vsum += s.normalized * (r.exposure ?? 0);
      byLayer.set(s.layerId, acc);
    }
  }
  const globalSubScores = readSubScores(global.subScores);
  for (const s of globalSubScores) {
    const acc = byLayer.get(s.layerId);
    if (acc === undefined || acc.wsum <= 0) {
      fail(
        `global.subScores.${s.layerId}.normalized`,
        s.normalized,
        null,
        "domain appears in the global rollup but in no published region",
      );
      continue;
    }
    checked += 1;
    const recomputed = round1(acc.vsum / acc.wsum);
    if (!same(s.normalized, recomputed)) {
      fail(
        `global.subScores.${s.layerId}.normalized`,
        s.normalized,
        recomputed,
        "global domain chip is not the exposure-weighted mean of the published " +
          "region values for that domain",
      );
    }
  }

  // -- check 7: liveness is computed, never asserted (section 5.3) ------------
  //
  // THE RULES, verbatim from methodology section 5.3:
  //   fresh(domain) = not synthetic AND ageHours <= freshnessWindowHours
  //                   AND ageHours >= -1
  //   live(domain)  = not synthetic AND available AND rung in
  //                   {measured, vendor-published} AND fresh
  //   meta.isLive   = every weight-carrying domain is live
  //
  // Nothing here is imported or assumed: the freshness window is the
  // document's own disclosed policy constant, and guessing a default would be
  // importing a producer constant, which section 7.2 forbids.
  const isLivePublished = bool(meta.isLive);
  const freshnessWindowHours = num(meta.freshnessWindowHours);
  const domainProvenance = readDomainProvenance(meta.domainProvenance);
  let isLiveRecomputed: boolean | null = null;
  const notLiveDomainsRecomputed: string[] = [];

  if (freshnessWindowHours === null) {
    fail(
      "meta.freshnessWindowHours",
      null,
      null,
      "the freshness window is not published, so liveness is not computable " +
        "from this document alone (section 5.3). The checker will not assume a " +
        "value: assuming one would be importing a producer constant.",
    );
  }
  if (domainProvenance === null) {
    fail(
      "meta.domainProvenance",
      null,
      null,
      "no per-domain provenance block is published, so no liveness claim in " +
        "this document can be checked (sections 5.2 and 7.1 item 6)",
    );
  }

  // The weight-carrying set. The published list is preferred; the fallback is
  // the domains that actually appear in the published region sub-scores, NOT
  // meta.weights, because a domain can carry a declared weight while being
  // excluded from scoring (the reference implementation does this with `fire`).
  let weightCarrying = strList(meta.weightCarryingDomains);
  if (weightCarrying === null) {
    fail(
      "meta.weightCarryingDomains",
      null,
      null,
      "the document does not publish weightCarryingDomains (section 7.1 item " +
        "6). Liveness is still checked against the domains that appear in the " +
        "published region subScores with a weight above zero.",
    );
    const derived = new Set<string>();
    for (const r of regions) {
      for (const s of r.subScores) if (s.weight > 0) derived.add(s.layerId);
    }
    weightCarrying = [...derived];
  }

  if (domainProvenance !== null && freshnessWindowHours !== null) {
    for (const domain of weightCarrying) {
      const p = domainProvenance.get(domain);
      if (p === undefined) {
        fail(
          `meta.domainProvenance.${domain}`,
          null,
          null,
          `${domain} is weight-carrying but has no entry in ` +
            "meta.domainProvenance, so its liveness cannot be established " +
            "(section 5.2)",
        );
        notLiveDomainsRecomputed.push(domain);
        continue;
      }
      const synthetic = p.synthetic === true || p.provenance === "synthetic";
      // R7 (section 5.3): a non-daily source is fresh within its own
      // publication interval plus its stated lag, published on its own entry;
      // every other source uses the document's daily window.
      const window = p.freshnessWindowHours ?? freshnessWindowHours;
      if (p.freshnessWindowHours !== null) {
        checked += 1;
        if (p.freshnessWindowHours <= 0) {
          fail(
            `meta.domainProvenance.${domain}.freshnessWindowHours`,
            p.freshnessWindowHours,
            null,
            "a per-domain freshness window is a positive number of hours " +
              "(section 5.3)",
          );
        }
        if (
          p.cadenceHours !== null &&
          p.lagHours !== null &&
          !same(p.freshnessWindowHours, p.cadenceHours + p.lagHours)
        ) {
          fail(
            `meta.domainProvenance.${domain}.freshnessWindowHours`,
            p.freshnessWindowHours,
            p.cadenceHours + p.lagHours,
            "a source's freshness window is its publication interval plus its " +
              "stated lag and nothing more (section 5.3, R7)",
          );
        }
      }
      const freshRecomputed =
        !synthetic &&
        p.ageHours !== null &&
        p.ageHours <= window &&
        p.ageHours >= -1;
      checked += 1;
      if (p.fresh !== null && p.fresh !== freshRecomputed) {
        fail(
          `meta.domainProvenance.${domain}.fresh`,
          p.fresh,
          freshRecomputed,
          "published freshness disagrees with the section 5.3 rule applied to " +
            "this domain's own synthetic flag, ageHours and its freshness " +
            `window of ${window} hours`,
        );
      }
      const rung = p.provenance;
      const liveRecomputed =
        !synthetic &&
        p.available === true &&
        rung !== null &&
        LIVE_RUNGS.has(rung) &&
        freshRecomputed;
      if (!liveRecomputed) {
        notLiveDomainsRecomputed.push(domain);
        // The bold sentence of section 5.3, one finding per offending domain,
        // and only when the document actually claims to be live. Naming the
        // clause matters: "not live" without a reason is what C4 found.
        if (isLivePublished === true) {
          let reason: string;
          if (synthetic) {
            reason =
              `its provenance rung is "${rung ?? "unknown"}" and it is flagged ` +
              "synthetic: the producer KNOWS it generated this input";
          } else if (p.available !== true) {
            reason = "the input is not available";
          } else if (rung === null || !LIVE_RUNGS.has(rung)) {
            reason =
              `its provenance rung is "${rung ?? "absent"}", which is not ` +
              "measured or vendor-published";
          } else {
            reason =
              `it is carried forward past the freshness window: ageHours ` +
              `${p.ageHours === null ? "absent" : p.ageHours} against a window ` +
              `of ${window}`;
          }
          fail(
            `meta.domainProvenance.${domain}`,
            true,
            false,
            `THIS DOCUMENT CLAIMS meta.isLive TRUE WHILE THE WEIGHT-CARRYING ` +
              `DOMAIN "${domain}" IS NOT LIVE: ${reason}. Section 5.3: a ` +
              "document MUST NOT declare isLive true when any weight-carrying " +
              "domain is synthetic, carried forward past the freshness window, " +
              "or of rung class-estimated or unknown. An implementation on " +
              "partial live data is conformant and honest when it declares " +
              "isLive false with the reasons listed; it is the CLAIM that is " +
              "rejected here, not the data.",
          );
        }
      }
    }
    isLiveRecomputed =
      weightCarrying.length > 0 && notLiveDomainsRecomputed.length === 0;

    checked += 1;
    if (isLivePublished === null) {
      fail(
        "meta.isLive",
        null,
        isLiveRecomputed,
        "meta.isLive is not published (section 7.1 item 6)",
      );
    } else if (isLivePublished !== isLiveRecomputed) {
      fail(
        "meta.isLive",
        isLivePublished,
        isLiveRecomputed,
        isLivePublished
          ? "the document asserts liveness that its own provenance block does " +
            "not support; see the per-domain findings above"
          : "the document declares itself not live while every weight-carrying " +
            "domain satisfies section 5.3. Understating is also a disagreement " +
            "between the document and its own parts.",
      );
    }

    const publishedNotLive = strList(meta.notLiveDomains);
    if (publishedNotLive !== null) {
      checked += 1;
      const a = [...publishedNotLive].sort().join(",");
      const b = [...notLiveDomainsRecomputed].sort().join(",");
      if (a !== b) {
        fail(
          "meta.notLiveDomains",
          a === "" ? "(empty)" : a,
          b === "" ? "(empty)" : b,
          "the published not-live list is not the set section 5.3 produces " +
            "from this document's own provenance block",
        );
      }
    }

    // Section 5.2: every sub-score repeats provenance and synthetic, so a
    // reader of one number is not guessing. A sub-score that disagrees with
    // the provenance block is the hidden state consensus finding C4 named.
    const checkSub = (where: string, s: PublishedSub): void => {
      const p = domainProvenance.get(s.layerId);
      if (p === undefined) return;
      if (s.provenance === null || s.synthetic === null) {
        fail(
          `${where}.${s.layerId}`,
          s.provenance ?? "(absent)",
          p.provenance,
          "sub-score does not repeat both provenance and synthetic (section 5.2)",
        );
        return;
      }
      checked += 1;
      if (s.provenance !== p.provenance) {
        fail(
          `${where}.${s.layerId}.provenance`,
          s.provenance,
          p.provenance,
          "sub-score provenance disagrees with meta.domainProvenance",
        );
      }
      const metaSynthetic = p.synthetic === true || p.provenance === "synthetic";
      if (s.synthetic !== metaSynthetic) {
        fail(
          `${where}.${s.layerId}.synthetic`,
          s.synthetic,
          metaSynthetic,
          "sub-score synthetic flag disagrees with meta.domainProvenance, so a " +
            "reader of this one number is told something the provenance block " +
            "contradicts",
        );
      }
    };
    for (const r of regions) {
      for (const s of r.subScores) checkSub(`regions.${r.id}.subScores`, s);
    }
    for (const s of globalSubScores) checkSub("global.subScores", s);
  }

  // -- check 9: the breach panel (section 6) ---------------------------------
  // The panel is normative, and no reference document published it before this
  // check existed, so its ABSENCE is a warning (like section 7.1 item 1a) and
  // everything about a panel that IS published is a finding. A document cannot
  // publish a panel and then be graded leniently on it.
  //
  // The headline is not checked against the panel here, and deliberately: check
  // 4 already recomputes `global.score` as the exposure-weighted mean of the
  // published regions, so a `breachCount` that had leaked into the headline
  // would fail check 4. That is what "enters no average" means in a document.
  const boundariesRaw = (doc.boundaries ?? null) as Record<
    string,
    unknown
  > | null;
  let boundaryPanelSize: number | null = null;
  let breachCountPublished: number | null = null;
  let breachCountRecomputed: number | null = null;
  if (boundariesRaw === null) {
    warn(
      "boundaries",
      null,
      "an earth.boundaries.v1 panel",
      "the document publishes no breach panel (section 6). The headline is a " +
        "compensatory mean, so without the panel a transgressed boundary can " +
        "be offset by domains that are not transgressed and the document says " +
        "nothing about it. This is a warning by default and a finding under " +
        "strict mode.",
    );
  } else {
    const panel = readPanel(boundariesRaw.panel);
    boundaryPanelSize = panel.length;
    breachCountPublished = num(boundariesRaw.breachCount);

    // 9a: all nine boundaries, every refresh. Condition 4: a missing boundary
    // and a safe boundary must not look alike, so absence is the failure.
    const published = new Set(
      panel.map((e) => e.id).filter((id): id is string => id !== null),
    );
    const missing = NINE_BOUNDARY_IDS.filter((id) => !published.has(id));
    if (panel.length !== NINE_BOUNDARY_IDS.length || missing.length > 0) {
      fail(
        "boundaries.panel",
        panel.length,
        NINE_BOUNDARY_IDS.length,
        missing.length === 0
          ? "the panel does not carry exactly the nine planetary boundaries " +
              "(section 6, derived requirement 1)"
          : "the panel omits " +
              missing.join(", ") +
              ". A boundary that cannot be evaluated is published with state " +
              "unknown, never omitted (section 6, condition 4)",
      );
    }
    checked += 1;

    let recomputedBreaches = 0;
    let recomputedUnknown = 0;
    const recomputedBreachedIds: string[] = [];
    // Section 6.1 (R1): a panel is read with modes when any entry states one
    // or when it publishes either mode count. Then each count is recomputed
    // over its own mode, and breachCount keeps its 1.0.0 meaning: this
    // product's own (live) measurement, never the sum of the two.
    const modesInEffect =
      panel.some((e) => e.mode !== null) ||
      boundariesRaw.liveBreachCount !== undefined ||
      boundariesRaw.assessedBreachCount !== undefined;
    let liveBreaches = 0;
    let assessedBreaches = 0;
    const liveBreachedIds: string[] = [];
    for (const e of panel) {
      const where = `boundaries.panel[${e.index}]${
        e.id === null ? "" : "." + e.id
      }`;
      if (e.id === null) {
        fail(where, null, null, "panel entry has no id (section 6)");
        continue;
      }

      // 9b: every entry cites its control variable, and any entry carrying a
      // numeric boundary cites that too (section 6, condition 2).
      if (e.controlVariableCitation === null || e.controlVariableCitation === "") {
        fail(
          `${where}.controlVariableCitation`,
          "(absent)",
          "a citation",
          "no boundary appears in the panel without a citation for its " +
            "control variable (section 6, condition 2)",
        );
      }
      if (
        e.thresholdBoundary !== null &&
        (e.thresholdCitation === null || e.thresholdCitation === "")
      ) {
        fail(
          `${where}.threshold.citation`,
          "(absent)",
          "a citation",
          "an entry publishing a numeric threshold cites the source for it " +
            "(section 6, condition 2)",
        );
      }
      checked += 1;

      // 9i: every entry states its mode, and an assessed entry names its
      // edition, year and citation on the entry itself (section 6.1).
      if (modesInEffect) {
        checked += 1;
        if (e.mode === null || !PANEL_MODES.includes(e.mode)) {
          fail(
            `${where}.mode`,
            e.mode,
            PANEL_MODES.join(" | "),
            "every entry states which evaluation mode produced it (section 6.1)",
          );
        } else if ((e.mode === "unknown") !== (e.state === UNKNOWN)) {
          fail(
            `${where}.mode`,
            e.mode,
            e.state === UNKNOWN ? "unknown" : "live | assessed",
            "mode is unknown exactly when the state is unknown (section 6.1)",
          );
        }
        if (e.mode === "assessed") {
          if (
            !e.hasAssessment ||
            e.assessmentEdition === null ||
            e.assessmentEdition === "" ||
            e.assessmentYear === null ||
            e.assessmentCitation === null ||
            e.assessmentCitation === ""
          ) {
            fail(
              `${where}.assessment`,
              "(incomplete)",
              "edition, year and citation",
              "an assessed entry carries a non-empty edition, the year its " +
                "value is for and a non-empty citation on the entry itself, " +
                "so a quotation is never mistaken for a measurement (section " +
                "6.1)",
            );
          }
          // State from the edition's value against the published threshold,
          // the same rule as a live entry (section 6.1).
          if (e.assessmentValue !== null && e.thresholdBoundary !== null) {
            const expect = stateFromValue(
              e.assessmentValue,
              e.thresholdBoundary,
              e.thresholdHighRisk,
              e.thresholdDirection,
            );
            if (expect !== null) {
              checked += 2;
              if (e.state !== expect.state) {
                fail(
                  `${where}.state`,
                  e.state,
                  expect.state,
                  "an assessed entry's state is computed from the edition's " +
                    "value against the published threshold (section 6.1)",
                );
              }
              if (e.transgressed !== expect.transgressed) {
                fail(
                  `${where}.transgressed`,
                  e.transgressed,
                  expect.transgressed,
                  "transgressed does not follow from the edition's value and " +
                    "the published threshold (section 6.1)",
                );
              }
            }
          }
        }
        if (e.transgressed === true) {
          if (e.mode === "assessed") assessedBreaches += 1;
          else if (e.mode === "live") {
            liveBreaches += 1;
            liveBreachedIds.push(e.id);
          }
        }
      }

      // 9c: the state vocabulary is closed.
      if (e.state === null || !PANEL_STATES.includes(e.state)) {
        fail(
          `${where}.state`,
          e.state,
          PANEL_STATES.join(" | "),
          "state is not one of the four states of section 6",
        );
      }

      // 9d: unknown if and only if the value and transgressed are both absent.
      const valueAbsent = !e.hasValue || e.controlValue === null;
      const transgressedAbsent = !e.hasTransgressedKey || e.transgressed === null;
      const unknownByData = valueAbsent && transgressedAbsent;
      if ((e.state === UNKNOWN) !== unknownByData) {
        fail(
          `${where}.state`,
          e.state,
          unknownByData ? UNKNOWN : "a computed state",
          "state is unknown if and only if the value and transgressed are " +
            "both absent (section 6, derived requirement 4). This entry says " +
            (e.state === UNKNOWN
              ? "unknown while publishing a value or a transgressed flag"
              : "it evaluated the boundary while publishing neither"),
        );
      }
      if (e.state === UNKNOWN) {
        recomputedUnknown += 1;
        if (e.evaluationNote === null || e.evaluationNote === "") {
          fail(
            `${where}.evaluationNote`,
            "(absent)",
            "a reason",
            "an unknown entry says why it could not be evaluated, so that an " +
              "unknown boundary is not read as a safe one (section 6, " +
              "condition 4)",
          );
        }
        continue;
      }

      // 9e: no entry takes its value from a domain whose indicator is not the
      // accepted control variable (section 6, condition 3).
      if (e.valueDomainId !== null && NON_CONTROL_DOMAINS.has(e.valueDomainId)) {
        fail(
          `${where}.value.domainId`,
          e.valueDomainId,
          "a domain whose indicator IS this boundary's control variable",
          "only a domain whose indicator is the accepted control variable may " +
            "evaluate a boundary; proxy domains are excluded and say so " +
            "(section 6, condition 3)",
        );
      }

      // 9f: THE ONE THAT MATTERS. State is recomputed from the published
      // control value against the published threshold. A producer that derived
      // the state from a domain's normalized health passes every other check
      // here and fails this one, which is consensus finding C5 as arithmetic.
      if (e.controlValue !== null && e.thresholdBoundary !== null) {
        const expect = stateFromValue(
          e.controlValue,
          e.thresholdBoundary,
          e.thresholdHighRisk,
          e.thresholdDirection,
        );
        if (expect === null) {
          fail(
            `${where}.threshold.direction`,
            e.thresholdDirection,
            "benefit | burden",
            "the threshold does not say which side of the boundary is safer, " +
              "so the state cannot be recomputed from the value",
          );
        } else {
          checked += 2;
          if (e.state !== expect.state) {
            fail(
              `${where}.state`,
              e.state,
              expect.state,
              "state is computed from the published control VALUE against the " +
                "published THRESHOLD, never from a domain's normalized health " +
                "(section 6, derived requirement 2)",
            );
          }
          if (e.transgressed !== expect.transgressed) {
            fail(
              `${where}.transgressed`,
              e.transgressed,
              expect.transgressed,
              "transgressed does not follow from the published value and " +
                "threshold (section 6, derived requirement 2)",
            );
          }
        }
      }

      // 9g: a provisional input still produces a state, and says it is one
      // (section 6, the provenance and provisional requirement).
      if (e.hasValue && e.controlValue !== null) {
        if (e.valueProvenance === null || e.valueProvenance === "") {
          fail(
            `${where}.value.provenance`,
            "(absent)",
            "a provenance rung",
            "an evaluated entry carries the provenance of the input it was " +
              "evaluated from (section 6)",
          );
        } else if (!NON_PROVISIONAL_RUNGS.has(e.valueProvenance)) {
          if (e.provisional !== true) {
            fail(
              `${where}.value.provisional`,
              e.provisional,
              true,
              "an entry evaluated from a " +
                e.valueProvenance +
                " input is marked provisional (section 6). It still produces " +
                "a state; forcing it to unknown would empty the panel",
            );
          }
        }
      }

      if (e.transgressed === true) {
        recomputedBreaches += 1;
        recomputedBreachedIds.push(e.id);
      }
    }
    // With modes, breachCount (when published) is the live count, and each
    // mode count is its own mode's transgressed entries (section 6.1).
    const expectedBreachCount = modesInEffect ? liveBreaches : recomputedBreaches;
    const expectedBreachedIds = modesInEffect
      ? liveBreachedIds
      : recomputedBreachedIds;
    breachCountRecomputed = expectedBreachCount;
    if (modesInEffect) {
      const pairs: [string, number][] = [
        ["liveBreachCount", liveBreaches],
        ["assessedBreachCount", assessedBreaches],
      ];
      for (const [key, recomputed] of pairs) {
        const published = num(boundariesRaw[key]);
        checked += 1;
        if (published === null) {
          fail(
            `boundaries.${key}`,
            null,
            recomputed,
            "a panel with modes publishes liveBreachCount and " +
              "assessedBreachCount as two separate fields (section 6.1)",
          );
        } else if (!same(published, recomputed)) {
          fail(
            `boundaries.${key}`,
            published,
            recomputed,
            `${key} is the count of transgressed entries of its own mode and ` +
              "nothing else (section 6.1)",
          );
        }
      }
    }

    // 9h: the counts. breachCount is the count of transgressed entries and
    // nothing else, and the denominator is published beside it so the number
    // cannot read as a claim about the whole framework.
    if (breachCountPublished === null) {
      if (!modesInEffect) {
        fail(
          "boundaries.breachCount",
          null,
          recomputedBreaches,
          "the panel publishes no breachCount (section 6)",
        );
      }
    } else if (
      modesInEffect &&
      assessedBreaches > 0 &&
      same(breachCountPublished, liveBreaches + assessedBreaches) &&
      !same(breachCountPublished, liveBreaches)
    ) {
      fail(
        "boundaries.breachCount",
        breachCountPublished,
        liveBreaches,
        "breachCount is the SUM of the live and the assessed counts. The two " +
          "are never summed: one is this product's measurement and the other " +
          "a published assessment it quotes (section 6.1)",
      );
    } else {
      checked += 1;
      if (!same(breachCountPublished, expectedBreachCount)) {
        // The framework's own count is context published in its own object and
        // is never our measurement, so a breachCount that IS that number gets
        // the specific message rather than the general one.
        const framework = (boundariesRaw.framework ?? null) as Record<
          string,
          unknown
        > | null;
        const reportedBreached =
          framework === null ? null : num(framework.reportedBreached);
        const tookTheFrameworkCount =
          reportedBreached !== null &&
          same(breachCountPublished, reportedBreached);
        fail(
          "boundaries.breachCount",
          breachCountPublished,
          expectedBreachCount,
          tookTheFrameworkCount
            ? "breachCount equals the framework's own reported count rather " +
                "than the count of this document's transgressed entries. The " +
                "framework count is context published in its own object and " +
                "is never summed into ours (section 6)"
            : "breachCount is the count of panel entries with transgressed " +
                "true, and nothing else is ever added to it: not a weighted " +
                "sum, not a mean, and not the framework's own count of " +
                "transgressed boundaries worldwide (section 6, derived " +
                "requirement 3)",
        );
      }
    }
    const unknownCount = num(boundariesRaw.unknownCount);
    const evaluatedCount = num(boundariesRaw.evaluatedCount);
    const totalBoundaries = num(boundariesRaw.totalBoundaries);
    if (unknownCount !== null && !same(unknownCount, recomputedUnknown)) {
      fail(
        "boundaries.unknownCount",
        unknownCount,
        recomputedUnknown,
        "unknownCount is the count of entries with state unknown",
      );
    }
    if (
      evaluatedCount !== null &&
      !same(evaluatedCount, panel.length - recomputedUnknown)
    ) {
      fail(
        "boundaries.evaluatedCount",
        evaluatedCount,
        panel.length - recomputedUnknown,
        "evaluatedCount is the count of entries that are not unknown, which " +
          "is the honest denominator of breachCount",
      );
    }
    if (
      totalBoundaries !== null &&
      evaluatedCount !== null &&
      unknownCount !== null &&
      !same(evaluatedCount + unknownCount, totalBoundaries)
    ) {
      fail(
        "boundaries.totalBoundaries",
        totalBoundaries,
        evaluatedCount + unknownCount,
        "evaluatedCount plus unknownCount equals totalBoundaries, or a " +
          "boundary has gone missing from the panel (section 6, condition 4)",
      );
    }
    const breachedIds = strList(boundariesRaw.breachedIds);
    if (breachedIds !== null) {
      const a = [...breachedIds].sort().join(",");
      const b = [...expectedBreachedIds].sort().join(",");
      if (a !== b) {
        fail(
          "boundaries.breachedIds",
          a === "" ? "(empty)" : a,
          b === "" ? "(empty)" : b,
          "breachedIds is not the set of entries with transgressed true",
        );
      }
    }
  }

  const ring = (meta.globalRingDiagnostic ?? null) as Record<
    string,
    unknown
  > | null;

  return {
    ok: findings.length === 0,
    strict,
    schema: str(meta.schema),
    eplusVersion,
    methodologyVersion: str(meta.methodologyVersion),
    generatedAt: str(meta.generatedAt),
    checked,
    headlinePublished,
    headlineRecomputed,
    headlineRecomputedExact,
    globalRingDiagnostic: ring === null ? null : num(ring.score),
    isLivePublished,
    isLiveRecomputed,
    notLiveDomainsRecomputed,
    boundaryPanelSize,
    breachCountPublished,
    breachCountRecomputed,
    findings,
    warnings,
  };
}

/** Published precision for a score, so 59 prints as 59.0. */
function fixed1(v: number | null): string {
  return v === null ? "none" : v.toFixed(1);
}

function shown(v: number | string | boolean | null): string {
  return v === null ? "none" : String(v);
}

/** Human-readable report, used by the CLI and by failing tests. */
export function formatConformanceReport(result: ConformanceResult): string {
  const lines: string[] = [];
  lines.push(
    `E+ conformance: ${result.ok ? "PASS" : "FAIL"} ` +
      `(schema ${result.schema ?? "?"}, E+ standard ` +
      `${result.eplusVersion ?? "unstated"}, implementation methodology ${
        result.methodologyVersion ?? "?"
      }, generatedAt ${result.generatedAt ?? "?"}` +
      `${result.strict ? ", strict mode" : ""})`,
  );
  lines.push(
    `headline published ${fixed1(result.headlinePublished)}, recomputed from ` +
      `the published regions ${fixed1(result.headlineRecomputed)}` +
      (result.headlineRecomputedExact === null
        ? ""
        : ` (exact ${result.headlineRecomputedExact.toFixed(7)})`) +
      (result.globalRingDiagnostic === null
        ? ""
        : `, retained global-ring diagnostic ${fixed1(
            result.globalRingDiagnostic,
          )}`),
  );
  lines.push(
    `liveness published ${shown(result.isLivePublished)}, recomputed ` +
      `${shown(result.isLiveRecomputed)}` +
      (result.notLiveDomainsRecomputed.length === 0
        ? ""
        : ` (not live: ${result.notLiveDomainsRecomputed.join(", ")})`),
  );
  lines.push(
    result.boundaryPanelSize === null
      ? "breach panel not published (section 6)"
      : `breach panel ${result.boundaryPanelSize} entries, breaches published ` +
          `${shown(result.breachCountPublished)}, recomputed ` +
          `${shown(result.breachCountRecomputed)}`,
  );
  lines.push(`${result.checked} published value(s) recomputed`);
  for (const f of result.findings) {
    lines.push(
      `  MISMATCH ${f.path}: published ${shown(f.published)}, recomputed ` +
        `${shown(f.recomputed)} - ${f.note}`,
    );
  }
  for (const w of result.warnings) {
    lines.push(`  WARNING ${w.path}: ${w.note}`);
  }
  return lines.join("\n");
}
