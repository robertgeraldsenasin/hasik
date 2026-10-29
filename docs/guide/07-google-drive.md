# 07. Google Drive

GitHub holds the code and the engineering docs that change with the code. Drive
holds everything else the team works on together.

## The split, and why

| Lives in GitHub                                             | Lives in Drive                                        |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| Code, tests, CI                                             | Planning docs, playbooks, meeting notes               |
| ADRs and this guide (versioned with the code they describe) | The original spec pack and source documents           |
| `results/` (generated, reproducible)                        | Demo video, GIFs, screenshots, raw recordings         |
| README                                                      | Resume bullets, interview prep notes, LinkedIn drafts |

**Why:** anything that must match a specific commit belongs in Git. Large binaries
(video), drafts and documents edited by non-developers belong in Drive, where they are
easy to comment on and don't bloat the repository.

## Folder structure

```
Hasik/
├─ 00 Project Hub        (Google Doc: links, phase plan, who owns what, decisions log)
├─ 01 Spec & Playbooks   (original spec pack, the two playbooks)
├─ 02 Guides             (Google Doc copy of the build guide, for reading on a phone)
├─ 03 Media              (demo video, GIFs, screenshots, logo exports)
├─ 04 Meetings & Devlog  (one doc per week: done, next, blockers)
└─ 05 Career             (resume bullets, interview prep, post drafts)
```

## Conventions

- Name files `YYYY-MM-DD topic` so they sort by date.
- Link Drive items from GitHub issues when relevant (e.g. the demo video in the release notes).
- Share the folder with your partner as **Editor**; keep it private unless a file is
  meant to be public (then share that one file, view-only).
- When a Drive doc turns into a real decision, record it as an ADR in the repo so the
  code and the reason live together.
