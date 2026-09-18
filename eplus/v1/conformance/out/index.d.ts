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
 * It implements checks 1 to 8 of E+ methodology section 7.2, plus the
 * `meta.eplusVersion` requirement of section 7.1 item 1a and check 9, the
 * section 6 BREACH PANEL. Both of those are reported as a WARNING when the
 * document omits them entirely, and as findings under `{ strict: true }`; a
 * panel that IS published is checked as a finding in every mode. See the
 * README beside this file for why.
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
export declare function verifyPublishedScoreDoc(raw: unknown, options?: ConformanceOptions): ConformanceResult;
/** Human-readable report, used by the CLI and by failing tests. */
export declare function formatConformanceReport(result: ConformanceResult): string;
