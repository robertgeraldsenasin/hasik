#!/usr/bin/env bash
# One-time GitHub repository setup. Run it yourself, once, from the repo root in
# the VS Code terminal after the first push:   bash scripts/setup-github.sh
# Needs the GitHub CLI logged in as the repo owner (gh auth login).
# Every step is idempotent: re-running it is safe.
set -euo pipefail

REPO="${REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
echo "Configuring $REPO"

echo "1/4 Labels used by the strength gate and the PR workflow"
gh label create "engine:gainer"     --repo "$REPO" --color 0E8A16 --force --description "PR claims a strength gain: SPRT tests [0, 5] Elo"
gh label create "strength:override" --repo "$REPO" --color B60205 --force --description "Maintainer accepts an inconclusive SPRT result"
gh label create "engine"            --repo "$REPO" --color 5319E7 --force --description "Rules engine or search"
gh label create "web"               --repo "$REPO" --color 1D76DB --force --description "Web app"
gh label create "ci"                --repo "$REPO" --color FBCA04 --force --description "Workflows and tooling"

echo "2/4 Repository settings: squash merges only, delete merged branches"
gh repo edit "$REPO" --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false \
  --delete-branch-on-merge --enable-auto-merge \
  --description "Sungka (Filipino mancala) with AI that searches like a chess engine" \
  --add-topic sungka --add-topic mancala --add-topic game-ai --add-topic alpha-beta --add-topic mcts --add-topic typescript

echo "3/4 GitHub Pages: deploy from GitHub Actions"
gh api -X POST "repos/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 \
  || gh api -X PUT "repos/$REPO/pages" -f build_type=workflow >/dev/null

echo "4/4 Branch protection on main: PRs, green CI, linear history"
gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["lint", "typecheck", "test", "build", "e2e"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0, "dismiss_stale_reviews": true },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON
echo "Done. Note: the 'sprt' check only runs on engine PRs, so it is enforced by the"
echo "workflow failing rather than as an always-required check (see docs/guide/04-github-setup.md)."
