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
  assert.deepEqual(result.warnings, []);
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
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].path, "meta.eplusVersion");
  assert.match(result.warnings[0].note, /does not conform to 1\.0\.0/);
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
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].note, /not a semver string/);
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
