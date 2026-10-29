# 04. GitHub setup

What was done (or needs doing once) on GitHub, and why. Everything after step 2 is
automated by `scripts/setup-github.sh`.

## 1. Create the repository (done)

`github.com/robertgeraldsenasin/hasik`, public, created **empty** (no README,
license or .gitignore).

**Why empty:** the local repository already had its first commit. If GitHub had
created a README commit, the two histories would have diverged and the first push
would have been rejected.

**Why public:** recruiters can read it; GitHub Pages and unlimited Actions minutes are
free for public repositories.

## 2. First push (from VS Code)

Commits are authored as you (`git config user.name` / `user.email`), so they show on
your profile. If you received the project as a git bundle:

```bash
git clone hasik.bundle hasik          # a bundle is a whole repository in one file
cd hasik
git remote set-url origin https://github.com/robertgeraldsenasin/hasik.git
git push -u origin main
code .
```

**Why a bundle instead of a zip:** a zip loses history; a bundle keeps every commit,
author and message, exactly as made.

## 3. Run the one-time setup script

```bash
gh auth login                # once per machine
bash scripts/setup-github.sh
```

It does four things:

| Step                        | What                                                                                                        | Why                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Labels                      | `engine:gainer`, `strength:override`, `engine`, `web`, `ci`                                                 | The strength gate reads the first two: gainer switches the SPRT to [0, 5] Elo; override lets a maintainer accept an inconclusive run |
| Repo settings               | Squash merge only, delete merged branches, auto-merge, topics                                               | One commit per PR on `main` = a readable history and clean release notes; topics make the repo discoverable                          |
| Pages                       | Source = GitHub Actions                                                                                     | `deploy.yml` publishes the built site; without this setting the deploy step fails                                                    |
| Branch protection on `main` | PRs required, checks `lint`, `typecheck`, `test`, `build`, `e2e` must pass, linear history, no force pushes | Nobody (including you) can break `main` by accident                                                                                  |

### Why "sprt" isn't a required check

Required checks must report on every PR, but the strength gate only runs when the
engine changes (`paths:` filter). Making it required would block every docs-only PR
forever. Instead, the gate **fails the PR** when it does run, and branch protection
blocks merging a PR with any failing check.

If the script can't set branch protection (e.g. the API changes), do it by hand:
**Settings → Branches → Add rule → `main`** with the same options.

## 4. Check the first CI run

**Actions** tab → `ci` should be green within ~5 minutes, then `deploy` runs and the
site appears at <https://robertgeraldsenasin.github.io/hasik/>.

If `deploy` fails with "Pages not enabled": **Settings → Pages → Source: GitHub
Actions**, then **Actions → deploy → Run workflow**.

## 5. Add your partner

**Settings → Collaborators → Add people** (Write access). They follow guide 01 on their
machine. CODEOWNERS requests your review on every PR automatically; edit
`.github/CODEOWNERS` to add them.

## Secrets

None needed for milestone 1. Milestone 2 will add `FLY_API_TOKEN` (or `RENDER_API_KEY`),
`DATABASE_URL` and `REDIS_URL` under **Settings → Secrets and variables → Actions**.
Never commit them; `.env.example` lists names only.

## Dependabot

`.github/dependabot.yml` opens grouped update PRs every Monday (npm and Actions). CI and,
for engine-adjacent packages, the strength gate decide whether they're safe to merge.
