// The E+ conformance test's own test suite.
//
// WHAT IT PROVES. Every check in methodology section 7.2 is exercised against a
// hand-built minimal document whose arithmetic is written out in full below, so
// nothing here shares a helper with the code under test. If the checker and
// these fixtures ever agree because they run the same function, the suite
// proves nothing; that is why the expected numbers are literals.
//
// THE DOCUMENT. Two regions, three domains, weights that sum to exactly 1, and
// no not-applicable domain, so that a provenance failure is never confused with
// an arithmetic one. Worked out by hand, once:
//
//   weights        air 0.5   ocean 0.3   land-cover 0.2   (rawWeightSum 1.0)
//   region "a"     exposure 40   air 80   ocean 60   land-cover 40
//                  score = (80*0.5 + 60*0.3 + 40*0.2) / 1.0 = 66.0
//                  confidence = 1.0 / (1.0 - 0) = 1
//   region "b"     exposure 60   air 50   ocean 70   land-cover 30
//                  score = (50*0.5 + 70*0.3 + 30*0.2) / 1.0 = 52.0
//                  confidence = 1
//   headline       (66*40 + 52*60) / 100 = 57.6
//   global air     (80*40 + 50*60) / 100 = 62.0
//   global ocean   (60*40 + 70*60) / 100 = 66.0
//   global l-cover (40*40 + 30*60) / 100 = 34.0
//
// The real fail-first fixtures (the byte-for-byte 2026-09-10 and 2026-09-11
// published documents) stay in the producer's repository, beside the producer,
// because they are evidence about that implementation. This suite is about the
// checker.
import assert from "node:assert/strict";
import test from "node:test";

import {
  formatConformanceReport,
  verifyPublishedScoreDoc,
} from "../out/index.js";

const WEIGHTS = { air: 0.5, ocean: 0.3, "land-cover": 0.2 };

function sub(layerId, normalized, provenance, synthetic) {
  return {
    layerId,
    normalized,
    direction: "burden",
    weight: WEIGHTS[layerId],
    provenance,
    synthetic,
  };
}

/** A live, fully conformant document. Every variant below starts from this. */
function baseDoc() {
  const prov = {
    air: {
      provenance: "vendor-published",
      synthetic: false,
      available: true,
      sourceLabel: "example air dataset",
      sourceKind: "live-particulates",
      sourceLicense: "example",
      vintage: "air-2026-09-13",
      asOf: "2026-09-13T00:00:00Z",
      ageHours: 12,
      fresh: true,
    },
    ocean: {
      provenance: "vendor-published",
      synthetic: false,
      available: true,
      sourceLabel: "example ocean dataset",
      sourceKind: "live-sst",
      sourceLicense: "example",
      vintage: "ocean-2026-09-13",
      asOf: "2026-09-13T00:00:00Z",
      ageHours: 6,
      fresh: true,
    },
    "land-cover": {
      provenance: "vendor-published",
      synthetic: false,
      available: true,
      sourceLabel: "example land cover dataset",
      sourceKind: "live-forest",
      sourceLicense: "example",
      vintage: "forest-2026-09-12",
      asOf: "2026-09-12T00:00:00Z",
      ageHours: 20,
      fresh: true,
    },
  };
  const subsFor = (air, ocean, land) => [
    sub("air", air, prov.air.provenance, prov.air.synthetic),
    sub("ocean", ocean, prov.ocean.provenance, prov.ocean.synthetic),
    sub(
      "land-cover",
      land,
      prov["land-cover"].provenance,
      prov["land-cover"].synthetic,
    ),
  ];
  return {
    meta: {
      schema: "earth.healthscore.v1",
      eplusVersion: "1.0.0",
      methodologyVersion: "0.8",
      generatedAt: "2026-09-13T00:00:00.000Z",
      weights: { ...WEIGHTS },
      isLive: true,
      freshnessWindowHours: 48,
      domainProvenance: prov,
      weightCarryingDomains: ["air", "ocean", "land-cover"],
      notLiveDomains: [],
      stale: false,
      staleDomains: [],
      derivation: { rawWeightSum: 1.0 },
    },
    regions: {
      a: {
        score: 66.0,
        confidence: 1,
        measuredCoverage: 1,
        exposure: 40,
        notApplicableDomains: [],
        subScores: subsFor(80, 60, 40),
      },
      b: {
        score: 52.0,
        confidence: 1,
        measuredCoverage: 1,
        exposure: 60,
        notApplicableDomains: [],
        subScores: subsFor(50, 70, 30),
      },
    },
    global: {
      score: 57.6,
      confidence: 1,
      measuredCoverage: 1,
      subScores: subsFor(62.0, 66.0, 34.0),
    },
  };
}

/** Deep copy, so one variant can never leak into another. */
function variant(mutate) {
  const doc = JSON.parse(JSON.stringify(baseDoc()));
  mutate(doc);
  return doc;
}

/** Rewrite one domain's provenance in meta AND in every sub-score that
 * repeats it, which is what a conforming producer would do. A variant that
 * changes only one of the two is testing section 5.2, not section 5.3. */
function setProvenance(doc, domain, patch) {
  Object.assign(doc.meta.domainProvenance[domain], patch);
  const p = doc.meta.domainProvenance[domain];
  for (const holder of [...Object.values(doc.regions), doc.global]) {
    for (const s of holder.subScores) {
      if (s.layerId !== domain) continue;
      s.provenance = p.provenance;
      s.synthetic = p.synthetic;
    }
  }
}

function paths(result) {
  return result.findings.map((f) => f.path);
}

function noteFor(result, path) {
  const f = result.findings.find((x) => x.path === path);
  assert.ok(f, `expected a finding at ${path}, got ${paths(result).join(", ")}`);
  return f.note;
}

// -- the baseline ------------------------------------------------------------

test("the hand-built document is conformant, and the arithmetic is checked", () => {
  const result = verifyPublishedScoreDoc(baseDoc());
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
  // ONE warning, and it is the honest one: this fixture publishes no section 6
  // breach panel, exactly like every document published before the panel
  // existed. Absence warns, it does not fail. See check 9 below.
  assert.deepEqual(
    result.warnings.map((w) => w.path),
    ["boundaries"],
  );
  assert.equal(result.headlinePublished, 57.6);
  assert.equal(result.headlineRecomputed, 57.6);
  assert.equal(result.isLivePublished, true);
  assert.equal(result.isLiveRecomputed, true);
  assert.deepEqual(result.notLiveDomainsRecomputed, []);
  assert.ok(result.checked > 20, `only ${result.checked} values were checked`);
  assert.match(formatConformanceReport(result), /E\+ conformance: PASS/);
});

// -- checks 1 to 6 and 8: the arithmetic ------------------------------------

test("check 1: a published weight that disagrees with meta.weights is rejected", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      d.regions.a.subScores[0].weight = 0.4;
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(paths(result).includes("regions.a.subScores.air.weight"));
});

test("check 2: a region score that does not follow from its subScores is rejected", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      d.regions.b.score = 57.0;
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(paths(result).includes("regions.b.score"));
});

test("check 3: a pre-0.8 document with no notApplicableDomains is not conformant", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      delete d.regions.a.notApplicableDomains;
    }),
  );
  assert.equal(result.ok, false);
  assert.match(noteFor(result, "regions.a.confidence"), /notApplicableDomains/);
});

test("check 4: an underivable headline is rejected and the message names it", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      d.global.score = 63.4;
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.headlineRecomputed, 57.6);
  assert.match(
    noteFor(result, "global.score"),
    /THE HEADLINE IS NOT DERIVABLE FROM THIS DOCUMENT/,
  );
});

test("check 5: global confidence and measuredCoverage are exposure weighted", () => {
  const conf = verifyPublishedScoreDoc(
    variant((d) => {
      d.global.confidence = 0.5;
    }),
  );
  assert.ok(paths(conf).includes("global.confidence"));
  const mc = verifyPublishedScoreDoc(
    variant((d) => {
      d.global.measuredCoverage = 0.5;
    }),
  );
  assert.ok(paths(mc).includes("global.measuredCoverage"));
});

test("check 6: a global domain chip that is not the exposure-weighted mean is rejected", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      d.global.subScores[0].normalized = 70.0;
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(paths(result).includes("global.subScores.air.normalized"));
});

test("check 8: a tampered document is rejected, wherever the tampering is", () => {
  // The headline nudged by one unit in the published precision.
  const headline = verifyPublishedScoreDoc(
    variant((d) => {
      d.global.score = 57.7;
    }),
  );
  assert.equal(headline.ok, false);
  assert.ok(paths(headline).includes("global.score"));

  // A region score that no longer follows from its own subScores.
  const region = verifyPublishedScoreDoc(
    variant((d) => {
      d.regions.a.score = 71.0;
    }),
  );
  assert.equal(region.ok, false);
  assert.ok(paths(region).includes("regions.a.score"));

  // A declared weight that disagrees with the weights the regions carry.
  const weight = verifyPublishedScoreDoc(
    variant((d) => {
      d.meta.weights["land-cover"] = 0.3;
    }),
  );
  assert.equal(weight.ok, false);
  assert.ok(
    paths(weight).some((p) => /subScores\.land-cover\.weight$/.test(p)),
  );
});

test("a document with no regions is rejected rather than silently passing", () => {
  const result = verifyPublishedScoreDoc({ meta: {}, regions: {}, global: {} });
  assert.equal(result.ok, false);
  assert.ok(paths(result).includes("regions"));
});

// -- check 7: the provenance rejection (section 5.3) ------------------------

test("check 7: isLive true with a SYNTHETIC weight-carrying domain is rejected", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      setProvenance(d, "land-cover", {
        provenance: "synthetic",
        synthetic: true,
        ageHours: null,
        fresh: false,
      });
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.isLiveRecomputed, false);
  assert.deepEqual(result.notLiveDomainsRecomputed, ["land-cover"]);
  const note = noteFor(result, "meta.domainProvenance.land-cover");
  assert.match(note, /CLAIMS meta\.isLive TRUE/);
  assert.match(note, /land-cover/);
  assert.match(note, /synthetic/);
  assert.ok(paths(result).includes("meta.isLive"));
});

test("check 7: isLive true with a CLASS-ESTIMATED rung is rejected", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      setProvenance(d, "ocean", {
        provenance: "class-estimated",
        synthetic: false,
      });
    }),
  );
  assert.equal(result.ok, false);
  assert.match(
    noteFor(result, "meta.domainProvenance.ocean"),
    /rung is "class-estimated", which is not measured or vendor-published/,
  );
});

test("check 7: isLive true with an UNKNOWN rung is rejected", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      setProvenance(d, "ocean", { provenance: "unknown", synthetic: false });
    }),
  );
  assert.equal(result.ok, false);
  assert.match(
    noteFor(result, "meta.domainProvenance.ocean"),
    /rung is "unknown"/,
  );
});

test("check 7: isLive true with a vendor-published domain past the freshness window is rejected", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      setProvenance(d, "ocean", { ageHours: 72, fresh: false });
    }),
  );
  assert.equal(result.ok, false);
  assert.match(
    noteFor(result, "meta.domainProvenance.ocean"),
    /carried forward past the freshness window: ageHours 72 against a window of 48/,
  );
});

test("check 7: isLive FALSE with synthetic domains and the reasons listed PASSES", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      setProvenance(d, "land-cover", {
        provenance: "synthetic",
        synthetic: true,
        ageHours: null,
        fresh: false,
      });
      d.meta.isLive = false;
      d.meta.notLiveDomains = ["land-cover"];
      d.meta.stale = true;
      d.meta.staleDomains = ["land-cover"];
    }),
  );
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
  assert.equal(result.isLiveRecomputed, false);
  assert.deepEqual(result.notLiveDomainsRecomputed, ["land-cover"]);
});

test("check 7: a notLiveDomains list that omits a not-live domain is rejected", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      setProvenance(d, "land-cover", {
        provenance: "synthetic",
        synthetic: true,
        ageHours: null,
        fresh: false,
      });
      d.meta.isLive = false;
      d.meta.notLiveDomains = [];
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(paths(result).includes("meta.notLiveDomains"));
});

test("check 7: understating liveness is a disagreement too", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      d.meta.isLive = false;
    }),
  );
  assert.equal(result.ok, false);
  assert.match(noteFor(result, "meta.isLive"), /declares itself not live/);
});

test("check 7: a published fresh flag that disagrees with the 5.3 rule is rejected", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      d.meta.domainProvenance.ocean.ageHours = 72;
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(paths(result).includes("meta.domainProvenance.ocean.fresh"));
});

test("check 7: a sub-score that hides a synthetic input is rejected (section 5.2)", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      // meta says synthetic; the sub-score a reader sees says otherwise.
      Object.assign(d.meta.domainProvenance["land-cover"], {
        provenance: "synthetic",
        synthetic: true,
        ageHours: null,
        fresh: false,
      });
      d.meta.isLive = false;
      d.meta.notLiveDomains = ["land-cover"];
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(
    paths(result).includes("regions.a.subScores.land-cover.synthetic"),
    paths(result).join(", "),
  );
  assert.ok(paths(result).includes("global.subScores.land-cover.provenance"));
});

test("check 7: a sub-score missing provenance entirely is rejected", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      delete d.regions.a.subScores[1].provenance;
      delete d.regions.a.subScores[1].synthetic;
    }),
  );
  assert.equal(result.ok, false);
  assert.match(
    noteFor(result, "regions.a.subScores.ocean"),
    /does not repeat both provenance and synthetic/,
  );
});

test("check 7: liveness is not guessed when the freshness window is missing", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      delete d.meta.freshnessWindowHours;
    }),
  );
  assert.equal(result.ok, false);
  assert.match(
    noteFor(result, "meta.freshnessWindowHours"),
    /will not assume a value/,
  );
  assert.equal(result.isLiveRecomputed, null);
});

test("check 7: a missing provenance block is rejected, not skipped", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      delete d.meta.domainProvenance;
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(paths(result).includes("meta.domainProvenance"));
});

test("check 7: a missing weightCarryingDomains list is reported AND worked around", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      delete d.meta.weightCarryingDomains;
      setProvenance(d, "land-cover", {
        provenance: "synthetic",
        synthetic: true,
        ageHours: null,
        fresh: false,
      });
    }),
  );
  assert.equal(result.ok, false);
  // Reported as missing...
  assert.ok(paths(result).includes("meta.weightCarryingDomains"));
  // ...and the live claim is still checked, from the published subScores.
  assert.ok(paths(result).includes("meta.domainProvenance.land-cover"));
  assert.deepEqual(result.notLiveDomainsRecomputed, ["land-cover"]);
});

test("check 7: a weight-carrying domain with no provenance entry is rejected", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      delete d.meta.domainProvenance.ocean;
    }),
  );
  assert.equal(result.ok, false);
  assert.match(
    noteFor(result, "meta.domainProvenance.ocean"),
    /weight-carrying but has no entry/,
  );
});

// -- check 1a: the standard version stamp (section 7.1 item 1a, D4) ---------

test("check 1a: a missing eplusVersion is a WARNING by default, and the run still passes", () => {
  const doc = variant((d) => {
    delete d.meta.eplusVersion;
  });
  const result = verifyPublishedScoreDoc(doc);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  const versionWarnings = result.warnings.filter(
    (w) => w.path === "meta.eplusVersion",
  );
  assert.equal(versionWarnings.length, 1);
  assert.match(versionWarnings[0].note, /does not conform to 1\.0\.0/);
  assert.match(formatConformanceReport(result), /WARNING meta\.eplusVersion/);
});

test("check 1a: under strict mode the same document is NOT conformant", () => {
  const doc = variant((d) => {
    delete d.meta.eplusVersion;
  });
  const result = verifyPublishedScoreDoc(doc, { strict: true });
  assert.equal(result.ok, false);
  assert.equal(result.strict, true);
  assert.deepEqual(result.warnings, []);
  assert.ok(paths(result).includes("meta.eplusVersion"));
  assert.match(formatConformanceReport(result), /strict mode/);
});

test("check 1a: a non-semver eplusVersion is reported", () => {
  const result = verifyPublishedScoreDoc(
    variant((d) => {
      d.meta.eplusVersion = "v1";
    }),
  );
  assert.equal(result.ok, true);
  const versionWarnings = result.warnings.filter(
    (w) => w.path === "meta.eplusVersion",
  );
  assert.equal(versionWarnings.length, 1);
  assert.match(versionWarnings[0].note, /not a semver string/);
});

test("the E+ standard version and the implementation version are reported apart", () => {
  const result = verifyPublishedScoreDoc(baseDoc());
  assert.equal(result.eplusVersion, "1.0.0");
  assert.equal(result.methodologyVersion, "0.8");
  const report = formatConformanceReport(result);
  assert.match(report, /E\+ standard 1\.0\.0/);
  assert.match(report, /implementation methodology 0\.8/);
});

// -- the checker reads only the document ------------------------------------

test("weights come from the document, so a whole different weighting still verifies", () => {
  // Nothing about 0.5/0.3/0.2 is known to the checker. A document that
  // declares different weights and is internally consistent with them passes.
  const doc = variant((d) => {
    d.meta.weights = { air: 1, ocean: 1, "land-cover": 1 };
    d.meta.derivation.rawWeightSum = 3;
    for (const holder of [...Object.values(d.regions), d.global]) {
      for (const s of holder.subScores) s.weight = 1;
    }
    // region a: (80 + 60 + 40) / 3 = 60.0 ; region b: (50 + 70 + 30) / 3 = 50.0
    d.regions.a.score = 60.0;
    d.regions.b.score = 50.0;
    // headline: (60*40 + 50*60) / 100 = 54.0
    d.global.score = 54.0;
  });
  const result = verifyPublishedScoreDoc(doc);
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
});

// -- check 9: the breach panel (section 6) -----------------------------------
//
// THE PANEL FIXTURE, worked out by hand once, same discipline as the document
// above: every expected state is written as a literal, so the suite and the
// checker never agree because they ran the same function.
//
//   ocean acidification   benefit, PB 2.86, high-risk 2.75, value 2.70
//                         2.70 < 2.75  ->  Beyond the boundary, transgressed
//   land-system change    benefit, PB 75, high-risk 54, value 62
//                         54 <= 62 < 75  ->  Zone of uncertainty, transgressed
//   climate change        burden,  PB 350, high-risk 450, value 423
//                         350 < 423 <= 450  ->  Zone of uncertainty, transgressed
//   the other six         value null, transgressed null  ->  unknown
//
//   breachCount 3, highRiskCount 1, evaluatedCount 3, unknownCount 6, total 9
//
// The thresholds are the Planetary Health Check 2025 executive summary's, so
// the fixture is a document a real producer could publish rather than a shape
// with invented numbers in it.
const CITE = "Planetary Health Check 2025 executive summary";

function evaluated(id, boundary, highRisk, direction, value, state, domainId) {
  return {
    id,
    name: id,
    controlVariable: "the accepted control variable for " + id,
    controlVariableCitation: CITE,
    threshold: {
      boundary,
      highRisk,
      units: "example",
      direction,
      citation: CITE,
    },
    value: {
      controlValue: value,
      units: "example",
      domainId,
      readFrom: "regions.global.subScores[" + domainId + "].controlValue",
      provenance: "synthetic",
      synthetic: true,
      sourceVintage: null,
      provisional: true,
    },
    state,
    transgressed: true,
    frameworkReportedState: "Beyond the boundary",
    evaluationNote: "worked by hand in the test fixture",
  };
}

function unknownEntry(id) {
  return {
    id,
    name: id,
    controlVariable: "the accepted control variable for " + id,
    controlVariableCitation: CITE,
    threshold: {
      boundary: null,
      highRisk: null,
      units: "example",
      direction: "burden",
      citation: CITE,
    },
    value: null,
    state: "unknown",
    transgressed: null,
    frameworkReportedState: "Beyond the boundary",
    evaluationNote: "this implementation does not measure this control variable",
  };
}

function panelDoc(mutate) {
  const doc = JSON.parse(JSON.stringify(baseDoc()));
  doc.boundaries = {
    schema: "earth.boundaries.v1",
    generatedAt: doc.meta.generatedAt,
    thresholdEdition: "planetary-health-check-2025",
    breachCount: 3,
    highRiskCount: 1,
    evaluatedCount: 3,
    unknownCount: 6,
    totalBoundaries: 9,
    breachedIds: [
      "ocean-acidification",
      "land-system-change",
      "climate-change",
    ],
    aggregationRule: "NOT averaged, NOT weighted, NOT offsettable.",
    evaluationRule: "State is computed from the published control VALUE.",
    framework: {
      name: "Planetary boundaries",
      edition: "Planetary Health Check 2025",
      reportedBreached: 7,
      reportedOf: 9,
      citation: CITE,
      note: "the framework's own count, never summed into breachCount",
    },
    panel: [
      evaluated(
        "climate-change",
        350,
        450,
        "burden",
        423,
        "Zone of uncertainty",
        "climate",
      ),
      unknownEntry("biosphere-integrity"),
      evaluated(
        "land-system-change",
        75,
        54,
        "benefit",
        62,
        "Zone of uncertainty",
        "land-cover",
      ),
      unknownEntry("freshwater-change"),
      unknownEntry("biogeochemical-flows"),
      evaluated(
        "ocean-acidification",
        2.86,
        2.75,
        "benefit",
        2.7,
        "Beyond the boundary",
        "ocean-acidification",
      ),
      unknownEntry("atmospheric-aerosol-loading"),
      unknownEntry("stratospheric-ozone-depletion"),
      unknownEntry("novel-entities"),
    ],
  };
  if (mutate) mutate(doc);
  return doc;
}

test("check 9: a conforming panel passes, and its counts are recomputed", () => {
  const result = verifyPublishedScoreDoc(panelDoc());
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.boundaryPanelSize, 9);
  assert.equal(result.breachCountPublished, 3);
  assert.equal(result.breachCountRecomputed, 3);
  assert.match(
    formatConformanceReport(result),
    /breach panel 9 entries, breaches published 3, recomputed 3/,
  );
});

test("check 9: a document with no panel warns, and fails under strict", () => {
  // FAIL-FIRST: this is the state of every document published before the panel
  // existed, including the live reference one, so it must warn and not fail.
  const lenient = verifyPublishedScoreDoc(baseDoc());
  assert.equal(lenient.ok, true);
  assert.equal(lenient.boundaryPanelSize, null);
  assert.equal(
    lenient.warnings.filter((w) => w.path === "boundaries").length,
    1,
  );
  const strict = verifyPublishedScoreDoc(baseDoc(), { strict: true });
  assert.equal(strict.ok, false);
  assert.ok(paths(strict).includes("boundaries"));
});

test("check 9: a panel that omits a boundary is rejected, by name", () => {
  const result = verifyPublishedScoreDoc(
    panelDoc((d) => {
      d.boundaries.panel = d.boundaries.panel.filter(
        (e) => e.id !== "novel-entities",
      );
      d.boundaries.unknownCount = 5;
      d.boundaries.totalBoundaries = 8;
    }),
  );
  assert.equal(result.ok, false);
  assert.match(noteFor(result, "boundaries.panel"), /novel-entities/);
  assert.match(noteFor(result, "boundaries.panel"), /never omitted/);
});

test("check 9: state derived from normalized health instead of the value is rejected", () => {
  // THE DECISIVE ONE (consensus finding C5). Ocean acidification's published
  // health is 94.5, which any band table reads as safe, while its own control
  // value 2.70 is past the 2.86 boundary and past the 2.75 high-risk line. A
  // producer that read the health publishes "Safe operating space" here.
  const result = verifyPublishedScoreDoc(
    panelDoc((d) => {
      const e = d.boundaries.panel.find((x) => x.id === "ocean-acidification");
      e.state = "Safe operating space";
      e.transgressed = false;
      d.boundaries.breachCount = 2;
      d.boundaries.highRiskCount = 0;
      d.boundaries.breachedIds = ["land-system-change", "climate-change"];
    }),
  );
  assert.equal(result.ok, false);
  const p = paths(result);
  assert.ok(p.includes("boundaries.panel[5].ocean-acidification.state"));
  assert.ok(p.includes("boundaries.panel[5].ocean-acidification.transgressed"));
  assert.match(
    noteFor(result, "boundaries.panel[5].ocean-acidification.state"),
    /never from a domain's normalized health/,
  );
});

test("check 9: a summed breachCount is rejected", () => {
  const result = verifyPublishedScoreDoc(
    panelDoc((d) => {
      d.boundaries.breachCount = 3 + d.boundaries.framework.reportedBreached;
    }),
  );
  assert.equal(result.ok, false);
  const f = result.findings.find((x) => x.path === "boundaries.breachCount");
  assert.equal(f.published, 10);
  assert.equal(f.recomputed, 3);
});

test("check 9: breachCount taken from the framework's own count is rejected", () => {
  const result = verifyPublishedScoreDoc(
    panelDoc((d) => {
      d.boundaries.breachCount = 7;
    }),
  );
  assert.equal(result.ok, false);
  assert.match(
    noteFor(result, "boundaries.breachCount"),
    /framework count is context/,
  );
});

test("check 9: unknown is unknown if and only if value and transgressed are absent", () => {
  const claimsSafeWithNoValue = verifyPublishedScoreDoc(
    panelDoc((d) => {
      const e = d.boundaries.panel.find((x) => x.id === "freshwater-change");
      e.state = "Safe operating space";
      d.boundaries.evaluatedCount = 4;
      d.boundaries.unknownCount = 5;
    }),
  );
  assert.equal(claimsSafeWithNoValue.ok, false);
  assert.match(
    noteFor(
      claimsSafeWithNoValue,
      "boundaries.panel[3].freshwater-change.state",
    ),
    /publishing neither/,
  );

  const unknownWithAValue = verifyPublishedScoreDoc(
    panelDoc((d) => {
      const e = d.boundaries.panel.find((x) => x.id === "land-system-change");
      e.state = "unknown";
      e.transgressed = null;
      d.boundaries.breachCount = 2;
      d.boundaries.breachedIds = ["ocean-acidification", "climate-change"];
      d.boundaries.evaluatedCount = 2;
      d.boundaries.unknownCount = 7;
    }),
  );
  assert.equal(unknownWithAValue.ok, false);
  assert.match(
    noteFor(unknownWithAValue, "boundaries.panel[2].land-system-change.state"),
    /unknown while publishing a value/,
  );
});

test("check 9: an unknown entry with no reason is rejected", () => {
  const result = verifyPublishedScoreDoc(
    panelDoc((d) => {
      d.boundaries.panel.find((x) => x.id === "novel-entities").evaluationNote =
        "";
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(
    paths(result).includes("boundaries.panel[8].novel-entities.evaluationNote"),
  );
});

test("check 9: an entry with no citation does not publish", () => {
  const noControlCite = verifyPublishedScoreDoc(
    panelDoc((d) => {
      d.boundaries.panel[0].controlVariableCitation = "";
    }),
  );
  assert.equal(noControlCite.ok, false);
  assert.ok(
    paths(noControlCite).includes(
      "boundaries.panel[0].climate-change.controlVariableCitation",
    ),
  );

  const noThresholdCite = verifyPublishedScoreDoc(
    panelDoc((d) => {
      d.boundaries.panel[0].threshold.citation = "";
    }),
  );
  assert.equal(noThresholdCite.ok, false);
  assert.ok(
    paths(noThresholdCite).includes(
      "boundaries.panel[0].climate-change.threshold.citation",
    ),
  );
});

test("check 9: a proxy domain may not evaluate a boundary", () => {
  const result = verifyPublishedScoreDoc(
    panelDoc((d) => {
      const e = d.boundaries.panel.find((x) => x.id === "climate-change");
      e.value.domainId = "ocean";
    }),
  );
  assert.equal(result.ok, false);
  assert.match(
    noteFor(result, "boundaries.panel[0].climate-change.value.domainId"),
    /proxy domains are excluded/,
  );
});

test("check 9: a synthetic input still produces a state, but must say provisional", () => {
  const result = verifyPublishedScoreDoc(
    panelDoc((d) => {
      d.boundaries.panel.find(
        (x) => x.id === "ocean-acidification",
      ).value.provisional = false;
    }),
  );
  assert.equal(result.ok, false);
  const note = noteFor(
    result,
    "boundaries.panel[5].ocean-acidification.value.provisional",
  );
  assert.match(note, /marked provisional/);
  assert.match(note, /forcing it to unknown would empty the panel/);

  // and a measured input is NOT forced to carry it
  const measured = verifyPublishedScoreDoc(
    panelDoc((d) => {
      const e = d.boundaries.panel.find((x) => x.id === "ocean-acidification");
      e.value.provenance = "measured";
      e.value.synthetic = false;
      e.value.provisional = false;
    }),
  );
  assert.deepEqual(measured.findings, []);
});

test("check 9: the counts must agree with the panel they describe", () => {
  const result = verifyPublishedScoreDoc(
    panelDoc((d) => {
      d.boundaries.unknownCount = 5;
      d.boundaries.evaluatedCount = 4;
      d.boundaries.totalBoundaries = 9;
    }),
  );
  assert.equal(result.ok, false);
  const p = paths(result);
  assert.ok(p.includes("boundaries.unknownCount"));
  assert.ok(p.includes("boundaries.evaluatedCount"));
});

test("check 9: breachedIds must be the transgressed entries", () => {
  const result = verifyPublishedScoreDoc(
    panelDoc((d) => {
      d.boundaries.breachedIds = ["ocean-acidification"];
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(paths(result).includes("boundaries.breachedIds"));
});

test("check 9: a threshold with no high-risk line reads as the zone of uncertainty", () => {
  // Novel entities is the real case: PHC 2025 prints a boundary of 0 percent
  // and prints no high-risk line, so a sourced absence must not become an
  // invented severity.
  const result = verifyPublishedScoreDoc(
    panelDoc((d) => {
      const e = d.boundaries.panel.find((x) => x.id === "novel-entities");
      e.threshold.boundary = 0;
      e.threshold.highRisk = null;
      e.threshold.direction = "burden";
      e.value = {
        controlValue: 12,
        units: "percent",
        domainId: "novel-entities-input",
        readFrom: "example",
        provenance: "measured",
        synthetic: false,
        sourceVintage: null,
        provisional: false,
      };
      e.state = "Zone of uncertainty";
      e.transgressed = true;
      e.evaluationNote = "past the boundary; the source prints no high-risk line";
      d.boundaries.breachCount = 4;
      d.boundaries.evaluatedCount = 4;
      d.boundaries.unknownCount = 5;
      d.boundaries.breachedIds.push("novel-entities");
    }),
  );
  assert.deepEqual(result.findings, []);
  assert.equal(result.breachCountRecomputed, 4);
});

// -- check 9, section 6.1 (R1): the two evaluation modes ---------------------
//
// The mode panel is the panel above with modes stated. Worked by hand:
//
//   climate change        live      423 vs PB 350 / HR 450  ->  transgressed
//   ocean acidification   live      2.70 vs PB 2.86 / HR 2.75 -> transgressed
//   land-system change    assessed  edition value 62 vs PB 75 / HR 54
//                                   ->  Zone of uncertainty, transgressed
//   the other six         unknown
//
//   liveBreachCount 2, assessedBreachCount 1, breachCount (the live count) 2.
//   A breachCount of 3 would be the forbidden sum.
function modePanelDoc(mutate) {
  return panelDoc((d) => {
    d.boundaries.schema = "earth.boundaries.v2";
    for (const e of d.boundaries.panel) {
      e.mode = e.state === "unknown" ? "unknown" : "live";
    }
    const land = d.boundaries.panel.find((x) => x.id === "land-system-change");
    land.mode = "assessed";
    land.value = null;
    land.assessment = {
      edition: "planetary-health-check-2025",
      year: 2025,
      citation: CITE,
      value: 62,
    };
    d.boundaries.liveBreachCount = 2;
    d.boundaries.assessedBreachCount = 1;
    d.boundaries.breachCount = 2;
    d.boundaries.breachedIds = ["climate-change", "ocean-acidification"];
    if (mutate) mutate(d);
  });
}

test("check 9 (6.1): a conforming mode panel passes, and each mode is counted apart", () => {
  const result = verifyPublishedScoreDoc(modePanelDoc());
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
  assert.equal(result.breachCountRecomputed, 2);
});

test("check 9 (6.1): a breachCount that sums the two modes is rejected", () => {
  const result = verifyPublishedScoreDoc(
    modePanelDoc((d) => {
      d.boundaries.breachCount = 3;
    }),
  );
  assert.equal(result.ok, false);
  assert.match(noteFor(result, "boundaries.breachCount"), /SUM of the live and the assessed/);
});

test("check 9 (6.1): a mode panel may omit breachCount but not the two mode counts", () => {
  const omitted = verifyPublishedScoreDoc(
    modePanelDoc((d) => {
      delete d.boundaries.breachCount;
      delete d.boundaries.breachedIds;
    }),
  );
  assert.deepEqual(omitted.findings, []);
  const result = verifyPublishedScoreDoc(
    modePanelDoc((d) => {
      delete d.boundaries.assessedBreachCount;
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(paths(result).includes("boundaries.assessedBreachCount"));
});

test("check 9 (6.1): a wrong mode count is rejected", () => {
  const result = verifyPublishedScoreDoc(
    modePanelDoc((d) => {
      d.boundaries.liveBreachCount = 3;
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(paths(result).includes("boundaries.liveBreachCount"));
});

test("check 9 (6.1): every entry states its mode, and unknown means unknown", () => {
  const missing = verifyPublishedScoreDoc(
    modePanelDoc((d) => {
      delete d.boundaries.panel[0].mode;
    }),
  );
  assert.ok(paths(missing).includes("boundaries.panel[0].climate-change.mode"));
  const wrong = verifyPublishedScoreDoc(
    modePanelDoc((d) => {
      d.boundaries.panel.find((x) => x.id === "novel-entities").mode = "assessed";
    }),
  );
  assert.ok(paths(wrong).includes("boundaries.panel[8].novel-entities.mode"));
});

test("check 9 (6.1): an assessed entry names its edition, year and citation", () => {
  const result = verifyPublishedScoreDoc(
    modePanelDoc((d) => {
      delete d.boundaries.panel.find((x) => x.id === "land-system-change")
        .assessment.year;
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(paths(result).includes("boundaries.panel[2].land-system-change.assessment"));
});

test("check 9 (6.1): an assessed state follows the edition's value, not a label", () => {
  const result = verifyPublishedScoreDoc(
    modePanelDoc((d) => {
      // 80 is inside the 75 boundary, so the entry is safe and not transgressed.
      d.boundaries.panel.find((x) => x.id === "land-system-change").assessment.value = 80;
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(paths(result).includes("boundaries.panel[2].land-system-change.state"));
});

// -- check 10, section 3.6 (R3): fire warm-up carries no weight --------------
//
// fire is added to meta.weights at 0.25, so rawWeightSum is 1.25. Worked by
// hand:
//   region a   fire in warm-up (12 of 30 days): its weight leaves the
//              denominator, confidence = 1.0 / (1.25 - 0.25) = 1
//   region b   no fire reading at all: confidence = 1.0 / 1.25 = 0.8
//   global confidence = (1 x 40 + 0.8 x 60) / 100 = 0.88
function warmUpDoc(mutate) {
  return variant((d) => {
    d.meta.weights.fire = 0.25;
    d.regions.a.warmUpDomains = ["fire"];
    d.regions.a.warmUpReadings = [
      {
        layerId: "fire",
        controlValue: 247,
        weight: 0,
        provenance: "synthetic",
        synthetic: true,
        baseline: { method: "midrank percentile", n: 12, warmUp: true, minDays: 30 },
      },
    ];
    d.regions.b.confidence = 0.8;
    d.global.confidence = 0.88;
    if (mutate) mutate(d);
  });
}

test("check 10: a visible warm-up reading carries no weight and leaves the denominator", () => {
  const result = verifyPublishedScoreDoc(warmUpDoc());
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
});

test("check 10: without warmUpDomains the same weight counts as missing", () => {
  const result = verifyPublishedScoreDoc(
    warmUpDoc((d) => {
      delete d.regions.a.warmUpDomains;
      delete d.regions.a.warmUpReadings;
    }),
  );
  assert.equal(result.ok, false);
  const f = result.findings.find((x) => x.path === "regions.a.confidence");
  assert.ok(f);
  assert.equal(f.recomputed, 0.8);
});

test("check 10: a warm-up fire sub-score that carries weight is rejected", () => {
  const result = verifyPublishedScoreDoc(
    warmUpDoc((d) => {
      d.regions.a.subScores.push({
        layerId: "fire",
        normalized: 50,
        direction: "burden",
        weight: 0.25,
        provenance: "vendor-published",
        synthetic: false,
        baseline: { n: 12, warmUp: true, minDays: 30 },
      });
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(paths(result).includes("regions.a.subScores.fire.baseline"));
  assert.ok(paths(result).includes("regions.a.warmUpDomains"));
});

test("check 10: a warm-up reading that is not declared synthetic is rejected", () => {
  const result = verifyPublishedScoreDoc(
    warmUpDoc((d) => {
      d.regions.a.warmUpReadings[0].provenance = "vendor-published";
      d.regions.a.warmUpReadings[0].synthetic = false;
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(paths(result).includes("regions.a.warmUpReadings[0].provenance"));
});

test("check 10: a warm-up reading with a full baseline is rejected", () => {
  const result = verifyPublishedScoreDoc(
    warmUpDoc((d) => {
      d.regions.a.warmUpReadings[0].baseline.n = 216;
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(paths(result).includes("regions.a.warmUpReadings[0].baseline.n"));
});

// -- check 11, section 3.8 (R6): a synthetic input never feeds the score -----

function syntheticLandCover(version) {
  return variant((d) => {
    d.meta.eplusVersion = version;
    setProvenance(d, "land-cover", {
      provenance: "synthetic",
      synthetic: true,
      ageHours: null,
      fresh: false,
    });
    d.meta.isLive = false;
    d.meta.notLiveDomains = ["land-cover"];
  });
}

test("check 11: a 1.2.0 document that scores a synthetic input is rejected, by domain", () => {
  const result = verifyPublishedScoreDoc(syntheticLandCover("1.2.0"));
  assert.equal(result.ok, false);
  assert.match(
    noteFor(result, "regions.a.subScores.land-cover"),
    /synthetic input never feeds the score/,
  );
});

test("check 11: a document written against an earlier draft warns, and fails under strict", () => {
  const lenient = verifyPublishedScoreDoc(syntheticLandCover("1.1.0"));
  assert.equal(lenient.ok, true);
  assert.ok(
    lenient.warnings.some((w) => w.path === "regions.a.subScores.land-cover"),
  );
  const strict = verifyPublishedScoreDoc(syntheticLandCover("1.1.0"), {
    strict: true,
  });
  assert.equal(strict.ok, false);
  assert.ok(paths(strict).includes("regions.a.subScores.land-cover"));
});

// -- check 7, section 5.3 (R7): freshness by source cadence ------------------
//
// ocean becomes a monthly source: cadence 744 h (31 days) plus a stated lag of
// 240 h (10 days) gives a window of 984 h. At ageHours 700 it is fresh and
// live, where the daily 48 h window would have called it stale.
function monthlyOcean(patch) {
  return variant((d) => {
    setProvenance(d, "ocean", {
      cadenceHours: 744,
      lagHours: 240,
      freshnessWindowHours: 984,
      ageHours: 700,
      fresh: true,
      ...patch,
    });
  });
}

test("check 7 (R7): a monthly source inside its own window is fresh and live", () => {
  const result = verifyPublishedScoreDoc(monthlyOcean({}));
  assert.deepEqual(result.findings, []);
  assert.equal(result.isLiveRecomputed, true);
});

test("check 7 (R7): a monthly source past its own window is stale", () => {
  const result = verifyPublishedScoreDoc(monthlyOcean({ ageHours: 1000 }));
  assert.equal(result.ok, false);
  assert.ok(paths(result).includes("meta.domainProvenance.ocean.fresh"));
  assert.match(
    noteFor(result, "meta.domainProvenance.ocean"),
    /against a window of 984/,
  );
});

test("check 7 (R7): a window wider than cadence plus lag is rejected", () => {
  const result = verifyPublishedScoreDoc(
    monthlyOcean({ freshnessWindowHours: 2000 }),
  );
  assert.equal(result.ok, false);
  const f = result.findings.find(
    (x) => x.path === "meta.domainProvenance.ocean.freshnessWindowHours",
  );
  assert.ok(f);
  assert.equal(f.recomputed, 984);
});
