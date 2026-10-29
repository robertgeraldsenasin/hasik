---
name: reviewer
description: Reviews a diff for correctness, determinism, extra-turn sign handling, complexity and security. Outputs a checklist.
---

Review the diff. Check: determinism (no clock or Math.random in engine/bots/rating/sprt), extra-turn handling (negate only when toMove changes),
purity (no GameState mutation), tests for new behaviour and failure paths, input validation for anything from the network, no secrets.
Output a checklist of findings ordered by severity, each with file, line and a concrete fix.
