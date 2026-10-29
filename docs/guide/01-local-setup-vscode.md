# 01. Local setup in VS Code

Goal: from a fresh laptop to playing the game locally and seeing every test pass,
in about 15 minutes. Both partners follow the same steps so "works on my machine"
problems don't happen.

## 1. Install Node.js 22 (LTS)

Download from <https://nodejs.org> (LTS), or use a version manager (`nvm install 22`
on macOS/Linux, `nvm-windows` or `fnm` on Windows).

**Why 22:** the repo pins it in `.nvmrc`, and CI reads the same file. Same Node
version locally and in CI means a test that passes on your laptop passes in CI.

Check: `node --version` prints `v22.x`.

## 2. Turn on pnpm with Corepack

```bash
corepack enable
```

**Why:** Corepack ships with Node and installs exactly the pnpm version written in
`package.json` (`"packageManager": "pnpm@10.28.0"`). Nobody installs pnpm by hand,
so nobody ends up with a different version that rewrites the lockfile.

**Why pnpm, not npm:** pnpm's strict `node_modules` means a package can only import
what it declares, which keeps the module boundaries honest (ADR-0007).

## 3. Install Git and the GitHub CLI

- Git: <https://git-scm.com>. Then set your identity once, so commits are yours:

  ```bash
  git config --global user.name "Robert Gerald Senasin"
  git config --global user.email "robertgeraldsenasin@gmail.com"
  ```

  Use an email that is verified on your GitHub account; that is how GitHub links
  commits to your profile.

- GitHub CLI: <https://cli.github.com>, then `gh auth login` (choose GitHub.com,
  HTTPS, log in with a browser). **Why:** `scripts/setup-github.sh` and everyday PR
  work (`gh pr create`) use it.

## 4. Clone and open in VS Code

```bash
git clone https://github.com/robertgeraldsenasin/hasik.git
cd hasik
code .
```

When VS Code asks **"Do you want to install the recommended extensions?"**, click
Install. They are listed in `.vscode/extensions.json`:

| Extension                                          | Why                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| ESLint                                             | Shows lint errors as you type, including the `Math.random` ban in the engine |
| Prettier                                           | Formats on save, so formatting never shows up in code review                 |
| Vitest                                             | A Testing panel to run or debug any single test with one click               |
| Playwright                                         | Run the end-to-end test in a visible browser                                 |
| GitHub Actions                                     | See CI runs and workflow errors inside VS Code                               |
| GitHub Pull Requests                               | Review and merge PRs without leaving the editor                              |
| EditorConfig, Pretty TS Errors, Code Spell Checker | Consistent whitespace, readable type errors, fewer typos                     |

If VS Code asks **"Use workspace TypeScript version?"**, click Allow. **Why:** the
editor then uses the repo's TypeScript 6.0, the same compiler CI uses.

## 5. Install dependencies

Terminal → New Terminal, then:

```bash
pnpm install
```

**Why `--frozen-lockfile` in CI but not here:** locally you may add packages; CI
must install exactly what the lockfile says.

## 6. Run everything CI runs

```bash
pnpm verify
```

That is lint, Prettier check, typecheck, dependency boundaries and all tests. You
can also press **Ctrl+Shift+P → Tasks: Run Test Task**, which runs the same thing.

## 7. Play locally

```bash
pnpm dev
```

Open <http://localhost:5173>. Edits to the web app reload instantly.

## 8. Debugging

Open **Run and Debug** (Ctrl+Shift+D). The configurations in `.vscode/launch.json`:

- **Web: debug in Chrome**: start the `dev: web app` task first, then breakpoints in
  `apps/web/src` and the engine work in the browser.
- **Tests: debug current test file**: open any `*.test.ts`, press F5.
- **Arena: debug a short match**: step through two bots playing.
- **Perft: debug**: step through move generation.

## 9. End-to-end test (optional locally)

```bash
pnpm --filter @hasik/web exec playwright install chromium   # once
pnpm --filter @hasik/web build && pnpm e2e
```

## Alternative: Dev Container / Codespaces

With Docker and the Dev Containers extension, **Ctrl+Shift+P → Dev Containers:
Reopen in Container** builds the same environment from `.devcontainer/devcontainer.json`.
On GitHub, **Code → Codespaces → Create** does the same in the cloud. **Why:** a
partner on a different OS gets an identical toolchain with zero setup.
