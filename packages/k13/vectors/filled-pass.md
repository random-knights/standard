# K13 Report: Copy check

<!-- A filled document in the shape of templates/temp1ate.md. Every gate check
     of K13 4.0.0 accepts it. The failing vectors in vectors.json plant one
     defect in a copy of it. -->

---

## quick squeeze

One pass. Plain words. One idea per sentence. Outcome first.

### Finding

Six copies of the rules are old.

### AiEDs disclosure

AiEDs, the AI Energy Disclosure Standard, methodology 2.1.0. One search tool ran and no personal data was read.

| Field | Value |
| --- | --- |
| energyKWh | not reported |
| gCO2e | not reported |
| compute.tokens | not reported |
| confidence | low |
| provenance | unknown |
| subject.name | copy-check |
| generatedAt | 2026-10-15 |
| scope | usage |

No member PPI accessed.

### What's next

Replace the six old copies with the new one.

| slot | value |
| --- | --- |
| role | builder |
| why that role | the work is a copy, with a clear check at the end |
| effort | low |

Command:

```
task: replace the six old copies of K13.md
repo: the repo that holds each copy
scope: the copy files only
verify: the version line reads 4.0.0
```

### Report

| | |
| --- | --- |
| Lab | 14-copy-check |
| Date | 2026-10-15 |
| Title | Copy check |
| Summary | Which copies of the rules are old |
| Gate | passed |
| Model | none |
| Runs | 1 |

### Verdict

**gate:** passed

**confidence:** Confidence is high, because we read each version number ourselves.

We also looked in four places, so there may be a copy we did not find.

### How it fits

This check is part of keeping every copy of the rules in step. It lets the team
replace the old copies in one pass.

The earlier check found one old copy. This one found six.

### Environment

| | |
| --- | --- |
| what was run | `grep` for the version line in each copy |
| where | the shared workspace |
| version | grep 3.11 |
| commit | 762926f |
| branch | main |
| when | 2026-10-15T09:00:00Z |

### Checks

| check | how it was verified | result |
| --- | --- | --- |
| old copies counted | grep over 4 places found 6 old version lines | PASS |
| current version known | K13.md reads 4.0.0 | PASS |

### Evidence

Command or query:

```
grep -rn "Version:" copies/ | grep 1.1.0 | wc -l
```

Result:

```
6
```

### Discrepancies

Nothing did not match.

### Owner actions

1. Approve the replacement for the six copies.

```
gh pr list --search "replace old K13 copies"
```

### What was not done

We did not replace any copy. This document only counts them.

