# Contributing to LectureLens AI

This file contains the detailed Git and review procedures. The task list, project status and team
allocation live in [`README.md`](README.md) — keep that file as the single source of truth for
*what* needs doing and *who* owns it. Every task has an ID (`P0-06`, `P1-07`, …) — reference that ID
in branches, commits, PRs and issues.

---

## 1. One-time setup

```bash
git clone https://github.com/HoneyWadwa/ClariNote.git
cd ClariNote

python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
npm ci --prefix frontend

cp .env.example .env        # then edit .env and add YOUR OpenAI key (optional — demo mode works without it)
```

`.env` is ignored by git. **Never** commit it, never paste a key into an issue, PR, README, log or
screenshot. `.env.example` (empty values) is the only env file that belongs in the repository.

Sanity check before you start:

```bash
.venv/bin/python -m pytest          # expect 63 passed
npm run build --prefix frontend     # expect a successful build
```

## 2. Branch naming

One branch per task, named after the task ID:

```
p0-11-initial-push
p1-07-tab-strip-overflow
p1-02-realworld-pdf-fixtures
docs-readme-status-table      # documentation-only work without an ID
```

Branch from an up-to-date `main`:

```bash
git switch main
git pull origin main
git switch -c p1-07-tab-strip-overflow
```

## 3. Commit rules

- **Small commits, one concern each.** A reviewer should understand a commit from its diff alone.
- **State the task ID and the reason**, not just the action:

  ```
  P1-07: keep the results tab strip scrollable at 390px

  The four tab labels clipped at the right edge on narrow viewports,
  hiding "Fact check". Added horizontal scrolling with visible focus.
  ```

- Stage explicit paths — never `git add -A`:

  ```bash
  git add frontend/src/views/ResultsShell.jsx frontend/src/styles.css
  git commit -m "P1-07: keep the results tab strip scrollable at 390px"
  ```

- Before every commit, confirm nothing unwanted is staged:

  ```bash
  git status
  git diff --cached --stat
  git ls-files --cached | grep -E '(^|/)(\.env$|\.venv/|node_modules/|dist/|__pycache__/)'
  # must print NOTHING
  ```

## 4. Running the checks

Run the checks that touch your change and paste the **actual output summary** into your PR
(README §7 records what each command should produce):

```bash
.venv/bin/python -m pytest                    # backend: 63 tests
npm run build --prefix frontend               # production build
npm run smoke --prefix frontend               # needs Flask on :5001
npm run test:dom --prefix frontend            # needs Flask on :5001 AND Vite on :3000
```

Start the servers first when needed:

```bash
PORT=5001 .venv/bin/python -m backend.app     # terminal 1
cd frontend && npm run dev                    # terminal 2 (port 3000)
```

If a check cannot run (missing key, port busy, no browser), say so **explicitly in the PR with the
blocker and the fix** — never mark a check as passed without running it.

## 5. Pull requests

1. Push your branch and open the PR against `main`.
2. Title: `<task ID>: <what changed>` — e.g. `P1-07: keep results tab strip scrollable at 390px`.
3. Description must contain:
   - What changed and why.
   - The task's acceptance criteria (from README §9) and whether each is met.
   - **Test evidence**: command + date + result (`pytest: 63 passed`, `smoke: 12/12`).
   - Any known gaps or follow-ups.
4. Link the issue: `Closes #12`.
5. Request review from the owner of the affected layer:
   - `frontend/**` → Person 2 (Teammate 1)
   - `backend/**` → Person 3 (Teammate 2)
   - Both, or README/process files → Person 1 (me)

### Review checklist (reviewer)

- [ ] Acceptance criteria from README §9 are met.
- [ ] Tests were run and the real results are in the PR description.
- [ ] No secrets, `.env`, `node_modules`, `.venv` or build output in the diff.
- [ ] Documentation updated if behaviour or commands changed.
- [ ] Nothing existing broke — §7 checks still pass.
- [ ] Grounding/honesty wording preserved (no claim of live AI success, no silent upgrades of
      `UNSUPPORTED` to `SUPPORTED`).

## 6. Merging

- Merge only when the review checklist passes and the checks are green.
- Prefer **squash merge** for task branches so `main` reads as one commit per task; use a regular
  merge when a branch contains a history you want preserved.
- Delete the branch after merging.
- Update the task's row in README §12 (status + PR link + testing evidence) in the same PR or
  immediately after.

## 7. Keep your work current

```bash
git switch main && git pull origin main        # before starting new work
```

On a feature branch that is behind:

```bash
git fetch origin
git rebase origin main          # on YOUR branch only
```

## 8. Resolving merge conflicts

```bash
git pull --rebase origin main        # or: git merge origin main
git status                           # lists files with "both modified"
```

Open each conflicted file and look for:

```
<<<<<<< HEAD
your team's lines
=======
your lines
>>>>>>> main
```

Decide deliberately — usually by keeping **both** changes, in the right place. Then:

```bash
git add <resolved-file>
git rebase --continue        # or: git commit   (when merging)
git push
```

**Never**

- never `git checkout --theirs -- <file>` / `--ours` to make the conflict disappear;
- never force-push (`git push --force`) to a shared branch;
- never resolve a conflict by discarding a teammate's change, even if it looks wrong — comment on
  the PR or issue instead;
- never commit conflict markers (`<<<<<<<`).

If a conflict is in code you do not understand, stop and ask the owner of that change.

## 9. Reporting bugs and gaps

Open an issue using the task ID when one exists, otherwise create one and add a row to README §9
and §12. Include: what you did, what you expected, what happened, the exact command/output, and
your environment (OS, Python, Node versions).

---

**Reminder:** AI-generated study material in this app requires human verification before academic
use — the same honesty applies to our process: no check is "done" until it has actually been run
and its result recorded (README §13, definition of done).
