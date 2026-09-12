# K13 Report: [Lab Name]

<!-- K13 v2.0.0 template for offline viewing.
     Six levels, all six NORMATIVE under K13 2.0.0. Same structure as
     temp1ate.html but rendered as markdown.
     Licence: this template is Apache 2.0, a reference implementation you may
     fork without attribution friction. The REQUIREMENT it renders, the
     ordered section list in K13.md under "The report template", is
     specification text and is CC BY 4.0. Fork the markup; cite the standard.
     Rules:
       - No em dashes (U+2014). Gate fails on one.
       - No en dashes (U+2013), and no double hyphen used as a dash. Use a comma, a
         colon, or a new sentence.
       - Levels are "levels," never "reading levels."
       - Lead with the outcome at every level.
       - Every level states the same facts and the same figures. More figures
         at a higher level is a detail ladder and fails K13 step 13.
       - All claims must be verified. No plausible defaults. -->

**Lab:** NN-lab-slug
**Date:** YYYY-MM-DD
**Gate:** <!-- passed / failed / raise / blocked -->
**Model:** <!-- claude-sonnet-5 or model used -->
**Scope:** <!-- one-line description -->

---

## juice box (K-5) &#x1F9C3;

**Finding:** FILL: one plain sentence. What happened, not how.

**Gate result:** FILL: what the gate means in plain language, no jargon.

FILL: What the system does, in everyday terms. One idea per sentence. No jargon.

FILL: What went wrong or right, and why it matters to the people involved.

**What happens next:**
1. FILL: First action in plain words. Name who does it.
2. FILL: Second action.

---

## soda pop (6-8) &#x1F964;

**Finding:** FILL: same outcome at middle-school specificity. Introduce one term, explain it.

**Gate result:** FILL: gate explanation with one or two technical terms, each explained inline.

FILL: What the system does, with terms introduced and explained as they appear.

FILL: What the finding means for the people or organizations affected.

**What happens next:**
1. FILL: First action. Name the exact role who takes it.
2. FILL: Second action.

---

## energy drink (9-12) &#x1F9CB;

**Finding:** FILL: outcome with technical terms used correctly, defined on first use.

**Gate result:** FILL: gate result with full technical framing.

FILL: Technical narrative. Real system names, metric values. Claims verified.

FILL: What the finding implies for the system. Any caveats or scope limits.

**Check results (if applicable):**

| Check | Result | Notes |
| --- | --- | --- |
| FILL | PASS / FAIL | FILL |

**Next steps:**
1. FILL: Exact action, exact owner.
2. FILL: Second action.

---

## black coffee (College) &#9749;

**Finding:** FILL: precise claim. All specifics present. No softening.

**Gate result:** FILL: gate result with full precision and measured scope.

FILL: Full technical account. Exact table names, column names, query shapes, row counts. Every figure verified.

FILL: Methodology. What was checked, how, and what was explicitly out of scope.

```sql
-- Verification query (if applicable)
SELECT ...
FROM ...
WHERE ...;
```

**Recommended actions:**
1. FILL: Precise action. Exact system, exact parameter, exact owner.
2. FILL: Second action.

---

## loose leaf (Masters) &#x1FAD6;

**Finding:** FILL: architecture-level claim. Cross-system scope if applicable.

**Gate result:** FILL: gate verdict with architectural framing.

FILL: Architectural and methodological account. Assumptions, edge cases, confidence bounds.

FILL: Relationship to other findings, other labs, or other systems. Cross-cutting concerns.

**Recommended actions:**
1. FILL: Systemic action with architectural rationale.
2. FILL: Second action.

---

## yerba mate (Doctorate) &#x1F9C9;

**Finding:** FILL: research-grade claim with explicit confidence scope.

**Gate result:** FILL: formal gate result with scope, confidence, and known limits.

FILL: Formal account. Methodology, sample, confidence interval, generalizability.

FILL: Open questions this lab raises but does not close. Hypotheses for follow-on work.

FILL: Known limitations of this inspection. What would change the conclusion.

**Open questions and recommended actions:**
1. FILL: Research action or verification step with hypothesis.
2. FILL: Second item.

---

## AiEDs disclosure

AiEDs, the AI Energy Disclosure Standard, methodology 2.1.0. FILL: one sentence on model usage and data access.

| Field | Value |
| --- | --- |
| energyKWh | FILL |
| gCO2e | FILL |
| compute.tokens | FILL: total tokens, input plus output |
| confidence | FILL: low / med / high, or a number 0 to 1. Any token proxy is low. |
| provenance | FILL: measured / vendor-published / class-estimated / synthetic / unknown |
| subject.name | FILL: lab-slug |
| generatedAt | FILL: YYYY-MM-DD |
| scope | FILL: device / usage / inference / training |

`synthetic` is a methodology 2.1.0 prose rung: the producer KNOWS it generated
the input. The published schema enum does not carry it yet (a 2.2.0 proposal),
so a machine-validated record stamps the nearest rung it does carry and says
plainly in prose that the input was generated.

FILL: PPI statement. Example: "No member PPI accessed." Or specify what was used and how it was protected.
