// Loader for the canonical factor table.
//
// There is exactly one copy of every AiEDs coefficient and it lives in
// `spec/v2/aieds-factors.json`. This module reads it. It does not restate any
// value, because a second copy is how the table drifts: the 22 kg Mature
// Reference Tree survived a month in published documents precisely because
// every consumer kept its own transcription.
//
// The path is resolved from `import.meta.url`, so it works the same from
// `src/` under a loader and from `dist/` after `tsc`: both sit one level below
// the package root, and the spec directory is one level above that.
import { readFileSync } from "node:fs";
/**
 * The provenance rungs the PUBLISHED SCHEMA enumerates today. This is a strict
 * subset of the methodology 2.1.0 ladder: `spec/aieds.schema.json` has a closed
 * enum without `synthetic`, so a record stamping it is rejected by any
 * validator. Adding it is the 2.2.0 schema proposal written up in PR 37.
 *
 * The schema is not edited from this package, and this library never emits a
 * value the published schema would reject.
 */
export const SCHEMA_PROVENANCE_VALUES = [
    "measured",
    "vendor-published",
    "class-estimated",
    "unknown",
];
/**
 * Narrows a methodology 2.1.0 provenance rung to one the published schema
 * accepts.
 *
 * `synthetic` maps to `unknown`. That loses information, and it is the honest
 * loss: the alternative is emitting a value every validator rejects. Methodology
 * 2.1.0 says as much in section 5.1, and tells a producer with a generated input
 * to stamp the nearest rung the schema carries and say in prose that the input
 * was generated. When the 2.2.0 schema adds `synthetic` (proposal in PR 37),
 * this function becomes the identity and the mapping goes.
 */
export function provenanceForSchema(provenance) {
    return provenance === "synthetic" ? "unknown" : provenance;
}
const FACTORS_URL = new URL("../../spec/v2/aieds-factors.json", import.meta.url);
function load() {
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(FACTORS_URL, "utf8"));
    }
    catch (cause) {
        throw new Error(`AiEDs factor table not readable at ${FACTORS_URL.pathname}. This ` +
            `package reads spec/v2/aieds-factors.json; it does not carry its own ` +
            `copy of the coefficients.`, { cause });
    }
    // Fail loudly on a malformed table rather than quietly producing NaN. A
    // disclosure built from NaN is worse than no disclosure.
    const profiles = parsed?.responseSurface?.profiles;
    if (!Array.isArray(profiles) || profiles.length === 0) {
        throw new Error("AiEDs factor table has no response-surface profiles.");
    }
    for (const p of [...profiles, parsed.responseSurface.unknownProfile]) {
        if (!Number.isFinite(p?.whPer1kIn) ||
            !Number.isFinite(p?.whPer1kOut) ||
            !Number.isFinite(p?.pue) ||
            typeof p?.citation !== "string" ||
            p.citation.length === 0) {
            throw new Error(`AiEDs factor table entry is incomplete: ${JSON.stringify(p?.matchPrefixes)}`);
        }
    }
    return parsed;
}
export const FACTORS = load();
/** Methodology snapshot these constants belong to. */
export const METHODOLOGY_VERSION = FACTORS.methodologyVersion;
/**
 * Impact-model version stamped on every disclosure and usage row so mixed-model
 * aggregates can refuse to blend incomparable numbers (methodology.md 2.4).
 */
export const AIEDS_IMPACT_MODEL_VERSION = FACTORS.impactModelVersion;
/**
 * Modeled global-average grid carbon intensity for the RESPONSE-SURFACE path
 * (methodology.md 2.4). Deliberately distinct from the compute-path table's
 * `global_average`; see {@link TABLE_GLOBAL_AVERAGE_GRAMS_PER_KWH}. This one is
 * a project modeled constant and carries no external citation.
 */
export const MODELED_GRID_INTENSITY_GRAMS_PER_KWH = FACTORS.gridIntensity.responseSurfacePinned.value;
/**
 * Cited global-average grid intensity for the COMPUTE paths (methodology.md 3,
 * Table 3) when the region is unknown. Not interchangeable with the pinned
 * response-surface value above: they apply to different derivations.
 */
export const TABLE_GLOBAL_AVERAGE_GRAMS_PER_KWH = FACTORS.gridIntensity.tableGlobalAverage.value;
/**
 * One Mature Reference Tree (MRT) sequesters ~21 kg CO2e/year (common forestry
 * heuristic; the AiEDs 2.0.0 tree-time basis). 1.x used 22 kg.
 */
export const MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR = FACTORS.constants.matureReferenceTreeCo2eGramsPerYear.value;
export const MINUTES_PER_YEAR = FACTORS.constants.minutesPerYear.value;
export const PHONE_CHARGE_WH = FACTORS.humanEquivalencies.phoneChargeWh;
export const LED_BULB_WATTS = FACTORS.humanEquivalencies.ledBulbWatts;
export const LAPTOP_WATTS = FACTORS.humanEquivalencies.laptopWatts;
export const CAR_DRIVING_GRAMS_CO2E_PER_KM = FACTORS.humanEquivalencies.carDrivingGramsCo2ePerKm;
/** The coefficient table, as published. */
export const MODEL_ENERGY_PROFILES = FACTORS.responseSurface.profiles;
/**
 * Fallback for models matching no prefix: the frontier-class estimate, labeled
 * unknown (never silently confident).
 */
export const UNKNOWN_MODEL_PROFILE = FACTORS.responseSurface.unknownProfile;
/** Profile lookup by model id (case-insensitive prefix match). */
export function energyProfileForModel(modelId) {
    const id = (modelId ?? "").trim().toLowerCase();
    if (id.length > 0) {
        for (const profile of MODEL_ENERGY_PROFILES) {
            for (const prefix of profile.matchPrefixes) {
                if (id.startsWith(prefix))
                    return profile;
            }
        }
    }
    return UNKNOWN_MODEL_PROFILE;
}
// -- Measured devices (methodology 2.3.1/2.3.2, Table 4 / Table 4b) --------
//
// THE SCOPE FENCE, enforced by construction and not just by prose: nothing in
// this section is reachable from energyProfileForModel, disclosureFromResponse
// or any other hosted-path function in this package. A measured entry is
// looked up by its own `id` (a device+runtime+model+quantization string, never
// a hosted provider model id) and is returned as its own type, which
// ModelEnergyProfile has no field to receive. There is no code path here that
// takes a hosted `model` string and returns a measured coefficient.
/**
 * Every published measured-device entry (Table 4 / Table 4b), exactly as
 * `spec/v2/aieds-factors.json` carries it. Empty if this build of the table
 * predates measuredDevices (defensive; every 2.2.0+ table carries it).
 */
export const MEASURED_DEVICES = FACTORS.measuredDevices?.entries ?? [];
/** Looks up a measured-device entry by its published Table 4 / 4b `id`. */
export function measuredDeviceById(deviceId) {
    const id = (deviceId ?? "").trim();
    if (id.length === 0)
        return undefined;
    return MEASURED_DEVICES.find((e) => e.id === id);
}
/**
 * Selects a measured PREFILL band by prompt token count (methodology 2.3.2).
 * Band boundaries are read from the device's OWN published bands (inclusive
 * on the lower end), never restated here, so this function cannot drift from
 * Table 4b by carrying a second copy of 256 or 2048.
 *
 * Returns `null`, never a guess, when:
 *  - `deviceId` does not name a published measured device (this is also how
 *    a hosted provider model id is refused: it is never a published device
 *    id, so it can never reach a band);
 *  - that device's prefill phase is not `published-by-band` (still
 *    `unresolved`, or a future device whose affine fit is not mis-specified
 *    and so is `published` as a two-term coefficient instead); or
 *  - `promptTokens` is not a finite count, or falls outside every published
 *    band (should not happen: the published bands are contiguous and
 *    unbounded above, but a caller must not assume that of every future
 *    table and this function will not paper over it).
 */
export function measuredPrefillBandFor(deviceId, promptTokens) {
    const entry = measuredDeviceById(deviceId);
    if (!entry)
        return null;
    const phase = entry.phases.prefill;
    if (phase.status !== "published-by-band" || !phase.bands)
        return null;
    if (!Number.isFinite(promptTokens) || promptTokens < 0)
        return null;
    for (const b of phase.bands) {
        if (promptTokens >= b.lowerBoundTokens &&
            (b.upperBoundTokens === null || promptTokens < b.upperBoundTokens)) {
            return b;
        }
    }
    return null;
}
