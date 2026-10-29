# 05. Daily workflow

The loop for every change, big or small. It is the standard GitHub flow used in
most companies, with one extra gate for engine changes.

## 1. Start from an issue

Create or pick an issue (**Issues → New → Feature or task**). Write the definition of
done before writing code. **Why:** it keeps PRs small and gives the PR something to close.

## 2. Branch

```bash
git switch main && git pull
git switch -c feat/hint-mode        # feat/, fix/, perf/, docs/, ci/, test/, chore/
```

**Why branches:** `main` is protected and always deployable; work happens elsewhere.

## 3. Commit in small steps, with Conventional Commits

```bash
git add -p                          # review each hunk you stage
git commit -m "feat(web): show the principal variation as arrows on the board"
```

Format: `type(scope): summary` with type in `feat`, `fix`, `perf`, `refactor`, `test`,
`docs`, `ci`, `chore`. **Why:** a readable history, and the changelog can be generated
from it. In VS Code, the Source Control panel (Ctrl+Shift+G) does the same with a GUI.

## 4. Check locally

```bash
pnpm verify
```

## 5. Open a pull request

```bash
git push -u origin HEAD
gh pr create --fill                 # or the GitHub Pull Requests panel in VS Code
```

The template asks for what and why, the type, and a checklist. CI starts automatically.

## 6. Engine changes: the strength gate

If the PR touches `packages/engine/**`, `packages/bots/**` or `tools/openings/**`, the
`strength-gate` workflow plays the PR against the base branch and comments the result:

- **PASS (H1)**: not weaker (or, with `engine:gainer`, proven stronger). Merge away.
- **FAIL (H0)**: the change made the engine weaker. Fix it or drop it.
- **INCONCLUSIVE**: ran out of budget. Usually means the change is tiny. A maintainer
  can add `strength:override` after looking at the numbers.

Pure refactors finish in seconds because the games are identical.

## 7. Review and merge

Your partner reviews (or you review your own diff line by line if working solo).
**Squash and merge**: one commit per PR on `main`. The branch is deleted automatically.

## 8. Deploy happens by itself

`ci` passes on `main` → `deploy` builds and publishes the site → health check. To roll
back, re-run **Actions → deploy → Run workflow** on an earlier commit, or revert the PR.

## When results change

If a PR changes bot strength, regenerate and commit the numbers in the same PR:

```bash
pnpm roundrobin --pairs 40 && pnpm bench && pnpm ablation && pnpm readme:tables
```

CI's `readme:tables --check` fails if the README and `results/` disagree.

## Debug log

Every non-trivial bug gets an entry in `docs/debug-log.md`: symptom, cause, fix, test
added. **Why:** it is the best source of real answers to "tell me about a hard bug".
