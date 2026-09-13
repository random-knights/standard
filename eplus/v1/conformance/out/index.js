"use strict";
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
 * `meta.eplusVersion` requirement of section 7.1 item 1a, which is reported as
 * a WARNING by default and as a finding under `{ strict: true }`. See the
 * README beside this file for why.
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
 *     cancelled out by the same bug in the checker;
 *   - the arithmetic is re-implemented here from the published
 *     `meta.derivation.steps` rather than shared with any producer.
 *
 * Run it from the command line with `cli.ts` beside this file.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPublishedScoreDoc = verifyPublishedScoreDoc;
exports.formatConformanceReport = formatConformanceReport;
// Rounding, re-implemented rather than imported: half-up to 1 and 2 decimals.
function round1(x) {
    return Math.round(x * 10) / 10;
}
function round2(x) {
    return Math.round(x * 100) / 100;
}
// Compare two values that are both already rounded to the same precision.
function same(a, b) {
    return Math.abs(a - b) < 1e-9;
}
function num(v) {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v) {
    return typeof v === "string" ? v : null;
}
function bool(v) {
    return typeof v === "boolean" ? v : null;
}
function strList(v) {
    return Array.isArray(v)
        ? v.filter((x) => typeof x === "string")
        : null;
}
/** Semver, loosely: three dot-separated numbers with an optional suffix. */
const SEMVER = /^\d+\.\d+\.\d+(?:[-+].*)?$/;
/** The two rungs of the section 5.1 ladder that can carry a live claim. */
const LIVE_RUNGS = new Set(["measured", "vendor-published"]);
function readSubScores(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const s of raw) {
        const o = s;
        const layerId = str(o?.layerId);
        const normalized = num(o?.normalized);
        const weight = num(o?.weight);
        if (layerId === null || normalized === null || weight === null)
            continue;
        out.push({
            layerId,
            normalized,
            weight,
            provenance: str(o?.provenance),
            synthetic: bool(o?.synthetic),
        });
    }
    return out;
}
function readRegions(raw) {
    const regions = raw?.regions;
    if (regions === null || typeof regions !== "object")
        return [];
    const entries = Array.isArray(regions)
        ? regions.map((r) => [str(r?.regionId) ?? str(r?.id) ?? "", r])
        : Object.entries(regions);
    return entries.map(([id, value]) => {
        const r = value;
        const na = r?.notApplicableDomains;
        return {
            id,
            score: num(r?.score),
            confidence: num(r?.confidence),
            measuredCoverage: num(r?.measuredCoverage),
            exposure: num(r?.exposure),
            notApplicableDomains: Array.isArray(na)
                ? na.filter((d) => typeof d === "string")
                : null,
            subScores: readSubScores(r?.subScores),
        };
    });
}
function readDomainProvenance(raw) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw))
        return null;
    const out = new Map();
    for (const [domain, value] of Object.entries(raw)) {
        const o = (value ?? {});
        out.set(domain, {
            provenance: str(o.provenance),
            synthetic: bool(o.synthetic),
            available: bool(o.available),
            ageHours: num(o.ageHours),
            fresh: bool(o.fresh),
        });
    }
    return out;
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
function verifyPublishedScoreDoc(raw, options = {}) {
    const strict = options.strict === true;
    const doc = (raw ?? {});
    const meta = (doc.meta ?? {});
    const global = (doc.global ?? {});
    const findings = [];
    const warnings = [];
    let checked = 0;
    const fail = (path, published, recomputed, note) => {
        findings.push({ path, published, recomputed, note });
    };
    // A warning under the default mode, a finding under strict. One call site
    // decides both, so the two modes cannot drift apart.
    const warn = (path, published, recomputed, note) => {
        (strict ? findings : warnings).push({ path, published, recomputed, note });
    };
    const weights = (meta.weights ?? {});
    const declaredWeights = new Map();
    for (const [k, v] of Object.entries(weights)) {
        const w = num(v);
        if (w !== null)
            declaredWeights.set(k, w);
    }
    const rawWeightSum = [...declaredWeights.values()].reduce((a, w) => a + w, 0);
    const regions = readRegions(doc);
    // -- check 1a: the standard version stamp (section 7.1 item 1a, D4) --------
    // Reported before the early return below, so even an empty document says
    // which standard it claims to be written against.
    const eplusVersion = str(meta.eplusVersion);
    if (eplusVersion === null) {
        warn("meta.eplusVersion", null, "1.0.0", "the document does not name the E+ STANDARD version it conforms to " +
            "(section 7.1 item 1a). meta.methodologyVersion is the IMPLEMENTATION " +
            "version and is a different thing. A document without " +
            "meta.eplusVersion does not conform to 1.0.0. This is a warning by " +
            "default and a finding under strict mode.");
    }
    else if (!SEMVER.test(eplusVersion)) {
        warn("meta.eplusVersion", eplusVersion, null, "meta.eplusVersion is not a semver string (section 7.1 item 1a)");
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
            findings,
            warnings,
        };
    }
    if (declaredWeights.size === 0) {
        fail("meta.weights", null, null, "no declared weights published; per-region weights cannot be checked and " +
            "confidence has no denominator");
    }
    // -- steps 1 to 3: per region -----------------------------------------------
    for (const r of regions) {
        if (r.subScores.length === 0)
            continue;
        // step 1: every published weight must be the declared weight for its domain.
        for (const s of r.subScores) {
            const declared = declaredWeights.get(s.layerId);
            if (declared === undefined) {
                fail(`regions.${r.id}.subScores.${s.layerId}.weight`, s.weight, null, "domain is not in meta.weights");
                continue;
            }
            checked += 1;
            if (!same(declared, s.weight)) {
                fail(`regions.${r.id}.subScores.${s.layerId}.weight`, s.weight, declared, "published weight disagrees with meta.weights");
            }
        }
        // step 2: region score = round1(sum(normalized*weight)/sum(weight)).
        const availWeight = r.subScores.reduce((a, s) => a + s.weight, 0);
        const recomputedScore = availWeight > 0
            ? round1(r.subScores.reduce((a, s) => a + s.normalized * s.weight, 0) /
                availWeight)
            : 0;
        checked += 1;
        if (r.score === null) {
            fail(`regions.${r.id}.score`, null, recomputedScore, "score not published");
        }
        else if (!same(r.score, recomputedScore)) {
            fail(`regions.${r.id}.score`, r.score, recomputedScore, "region score is not the coverage-weighted mean of its published subScores");
        }
        // step 3: confidence = round2(availWeight / (rawWeightSum - notApplicable)).
        if (r.confidence !== null && declaredWeights.size > 0) {
            if (r.notApplicableDomains === null) {
                fail(`regions.${r.id}.confidence`, r.confidence, null, "confidence is not derivable: the document does not publish " +
                    "regions." +
                    r.id +
                    ".notApplicableDomains, so a not-applicable domain cannot be told " +
                    "from a missing one and the denominator is unknown (pre-v0.8 shape)");
            }
            else {
                const naWeight = r.notApplicableDomains.reduce((a, d) => a + (declaredWeights.get(d) ?? 0), 0);
                const applicable = rawWeightSum - naWeight;
                const recomputedConfidence = applicable > 0 ? round2(availWeight / applicable) : 0;
                checked += 1;
                if (!same(r.confidence, recomputedConfidence)) {
                    fail(`regions.${r.id}.confidence`, r.confidence, recomputedConfidence, "confidence is not availableWeight / applicableWeight");
                }
            }
        }
    }
    // -- step 4: the headline ---------------------------------------------------
    const scoredRegions = regions.filter((r) => r.subScores.length > 0 && r.score !== null && r.exposure !== null);
    const exposureTotal = scoredRegions.reduce((a, r) => a + (r.exposure ?? 0), 0);
    let headlineRecomputed = null;
    let headlineRecomputedExact = null;
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
    }
    else if (headlineRecomputed === null ||
        !same(headlinePublished, headlineRecomputed)) {
        fail("global.score", headlinePublished, headlineRecomputed, "THE HEADLINE IS NOT DERIVABLE FROM THIS DOCUMENT: it is not the " +
            "exposure-weighted mean of the regions published here (E+ consensus " +
            "finding C2). A document whose headline comes from region inputs it does " +
            "not publish cannot be checked by anyone who holds only the document.");
    }
    // global confidence + measuredCoverage: the same exposure-weighted mean.
    const confRegions = scoredRegions.filter((r) => r.confidence !== null);
    if (confRegions.length === scoredRegions.length && exposureTotal > 0) {
        const recomputed = round2(confRegions.reduce((a, r) => a + (r.confidence ?? 0) * (r.exposure ?? 0), 0) / exposureTotal);
        const published = num(global.confidence);
        if (published !== null) {
            checked += 1;
            if (!same(published, recomputed)) {
                fail("global.confidence", published, recomputed, "global confidence is not the exposure-weighted mean of the published " +
                    "region confidences");
            }
        }
    }
    const mcRegions = scoredRegions.filter((r) => r.measuredCoverage !== null);
    const publishedMc = num(global.measuredCoverage);
    if (publishedMc !== null &&
        mcRegions.length === scoredRegions.length &&
        exposureTotal > 0) {
        const recomputed = round2(mcRegions.reduce((a, r) => a + (r.measuredCoverage ?? 0) * (r.exposure ?? 0), 0) / exposureTotal);
        checked += 1;
        if (!same(publishedMc, recomputed)) {
            fail("global.measuredCoverage", publishedMc, recomputed, "global measuredCoverage is not the exposure-weighted mean of the " +
                "published region values");
        }
    }
    // -- step 5: the per-domain global rollup chips -----------------------------
    const byLayer = new Map();
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
            fail(`global.subScores.${s.layerId}.normalized`, s.normalized, null, "domain appears in the global rollup but in no published region");
            continue;
        }
        checked += 1;
        const recomputed = round1(acc.vsum / acc.wsum);
        if (!same(s.normalized, recomputed)) {
            fail(`global.subScores.${s.layerId}.normalized`, s.normalized, recomputed, "global domain chip is not the exposure-weighted mean of the published " +
                "region values for that domain");
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
    let isLiveRecomputed = null;
    const notLiveDomainsRecomputed = [];
    if (freshnessWindowHours === null) {
        fail("meta.freshnessWindowHours", null, null, "the freshness window is not published, so liveness is not computable " +
            "from this document alone (section 5.3). The checker will not assume a " +
            "value: assuming one would be importing a producer constant.");
    }
    if (domainProvenance === null) {
        fail("meta.domainProvenance", null, null, "no per-domain provenance block is published, so no liveness claim in " +
            "this document can be checked (sections 5.2 and 7.1 item 6)");
    }
    // The weight-carrying set. The published list is preferred; the fallback is
    // the domains that actually appear in the published region sub-scores, NOT
    // meta.weights, because a domain can carry a declared weight while being
    // excluded from scoring (the reference implementation does this with `fire`).
    let weightCarrying = strList(meta.weightCarryingDomains);
    if (weightCarrying === null) {
        fail("meta.weightCarryingDomains", null, null, "the document does not publish weightCarryingDomains (section 7.1 item " +
            "6). Liveness is still checked against the domains that appear in the " +
            "published region subScores with a weight above zero.");
        const derived = new Set();
        for (const r of regions) {
            for (const s of r.subScores)
                if (s.weight > 0)
                    derived.add(s.layerId);
        }
        weightCarrying = [...derived];
    }
    if (domainProvenance !== null && freshnessWindowHours !== null) {
        for (const domain of weightCarrying) {
            const p = domainProvenance.get(domain);
            if (p === undefined) {
                fail(`meta.domainProvenance.${domain}`, null, null, `${domain} is weight-carrying but has no entry in ` +
                    "meta.domainProvenance, so its liveness cannot be established " +
                    "(section 5.2)");
                notLiveDomainsRecomputed.push(domain);
                continue;
            }
            const synthetic = p.synthetic === true || p.provenance === "synthetic";
            const freshRecomputed = !synthetic &&
                p.ageHours !== null &&
                p.ageHours <= freshnessWindowHours &&
                p.ageHours >= -1;
            checked += 1;
            if (p.fresh !== null && p.fresh !== freshRecomputed) {
                fail(`meta.domainProvenance.${domain}.fresh`, p.fresh, freshRecomputed, "published freshness disagrees with the section 5.3 rule applied to " +
                    "this domain's own synthetic flag, ageHours and the published " +
                    `freshnessWindowHours of ${freshnessWindowHours}`);
            }
            const rung = p.provenance;
            const liveRecomputed = !synthetic &&
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
                    let reason;
                    if (synthetic) {
                        reason =
                            `its provenance rung is "${rung ?? "unknown"}" and it is flagged ` +
                                "synthetic: the producer KNOWS it generated this input";
                    }
                    else if (p.available !== true) {
                        reason = "the input is not available";
                    }
                    else if (rung === null || !LIVE_RUNGS.has(rung)) {
                        reason =
                            `its provenance rung is "${rung ?? "absent"}", which is not ` +
                                "measured or vendor-published";
                    }
                    else {
                        reason =
                            `it is carried forward past the freshness window: ageHours ` +
                                `${p.ageHours === null ? "absent" : p.ageHours} against a window ` +
                                `of ${freshnessWindowHours}`;
                    }
                    fail(`meta.domainProvenance.${domain}`, true, false, `THIS DOCUMENT CLAIMS meta.isLive TRUE WHILE THE WEIGHT-CARRYING ` +
                        `DOMAIN "${domain}" IS NOT LIVE: ${reason}. Section 5.3: a ` +
                        "document MUST NOT declare isLive true when any weight-carrying " +
                        "domain is synthetic, carried forward past the freshness window, " +
                        "or of rung class-estimated or unknown. An implementation on " +
                        "partial live data is conformant and honest when it declares " +
                        "isLive false with the reasons listed; it is the CLAIM that is " +
                        "rejected here, not the data.");
                }
            }
        }
        isLiveRecomputed =
            weightCarrying.length > 0 && notLiveDomainsRecomputed.length === 0;
        checked += 1;
        if (isLivePublished === null) {
            fail("meta.isLive", null, isLiveRecomputed, "meta.isLive is not published (section 7.1 item 6)");
        }
        else if (isLivePublished !== isLiveRecomputed) {
            fail("meta.isLive", isLivePublished, isLiveRecomputed, isLivePublished
                ? "the document asserts liveness that its own provenance block does " +
                    "not support; see the per-domain findings above"
                : "the document declares itself not live while every weight-carrying " +
                    "domain satisfies section 5.3. Understating is also a disagreement " +
                    "between the document and its own parts.");
        }
        const publishedNotLive = strList(meta.notLiveDomains);
        if (publishedNotLive !== null) {
            checked += 1;
            const a = [...publishedNotLive].sort().join(",");
            const b = [...notLiveDomainsRecomputed].sort().join(",");
            if (a !== b) {
                fail("meta.notLiveDomains", a === "" ? "(empty)" : a, b === "" ? "(empty)" : b, "the published not-live list is not the set section 5.3 produces " +
                    "from this document's own provenance block");
            }
        }
        // Section 5.2: every sub-score repeats provenance and synthetic, so a
        // reader of one number is not guessing. A sub-score that disagrees with
        // the provenance block is the hidden state consensus finding C4 named.
        const checkSub = (where, s) => {
            const p = domainProvenance.get(s.layerId);
            if (p === undefined)
                return;
            if (s.provenance === null || s.synthetic === null) {
                fail(`${where}.${s.layerId}`, s.provenance ?? "(absent)", p.provenance, "sub-score does not repeat both provenance and synthetic (section 5.2)");
                return;
            }
            checked += 1;
            if (s.provenance !== p.provenance) {
                fail(`${where}.${s.layerId}.provenance`, s.provenance, p.provenance, "sub-score provenance disagrees with meta.domainProvenance");
            }
            const metaSynthetic = p.synthetic === true || p.provenance === "synthetic";
            if (s.synthetic !== metaSynthetic) {
                fail(`${where}.${s.layerId}.synthetic`, s.synthetic, metaSynthetic, "sub-score synthetic flag disagrees with meta.domainProvenance, so a " +
                    "reader of this one number is told something the provenance block " +
                    "contradicts");
            }
        };
        for (const r of regions) {
            for (const s of r.subScores)
                checkSub(`regions.${r.id}.subScores`, s);
        }
        for (const s of globalSubScores)
            checkSub("global.subScores", s);
    }
    const ring = (meta.globalRingDiagnostic ?? null);
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
        findings,
        warnings,
    };
}
/** Published precision for a score, so 59 prints as 59.0. */
function fixed1(v) {
    return v === null ? "none" : v.toFixed(1);
}
function shown(v) {
    return v === null ? "none" : String(v);
}
/** Human-readable report, used by the CLI and by failing tests. */
function formatConformanceReport(result) {
    const lines = [];
    lines.push(`E+ conformance: ${result.ok ? "PASS" : "FAIL"} ` +
        `(schema ${result.schema ?? "?"}, E+ standard ` +
        `${result.eplusVersion ?? "unstated"}, implementation methodology ${result.methodologyVersion ?? "?"}, generatedAt ${result.generatedAt ?? "?"}` +
        `${result.strict ? ", strict mode" : ""})`);
    lines.push(`headline published ${fixed1(result.headlinePublished)}, recomputed from ` +
        `the published regions ${fixed1(result.headlineRecomputed)}` +
        (result.headlineRecomputedExact === null
            ? ""
            : ` (exact ${result.headlineRecomputedExact.toFixed(7)})`) +
        (result.globalRingDiagnostic === null
            ? ""
            : `, retained global-ring diagnostic ${fixed1(result.globalRingDiagnostic)}`));
    lines.push(`liveness published ${shown(result.isLivePublished)}, recomputed ` +
        `${shown(result.isLiveRecomputed)}` +
        (result.notLiveDomainsRecomputed.length === 0
            ? ""
            : ` (not live: ${result.notLiveDomainsRecomputed.join(", ")})`));
    lines.push(`${result.checked} published value(s) recomputed`);
    for (const f of result.findings) {
        lines.push(`  MISMATCH ${f.path}: published ${shown(f.published)}, recomputed ` +
            `${shown(f.recomputed)} - ${f.note}`);
    }
    for (const w of result.warnings) {
        lines.push(`  WARNING ${w.path}: ${w.note}`);
    }
    return lines.join("\n");
}
