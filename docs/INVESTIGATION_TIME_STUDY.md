# Investigation-Time Study Protocol — Phase 6

**Purpose:** measure how much investigation time Garuda saves versus manual case-file review, for the KSP Datathon 2026 problem statement's "reduced investigation time" claim. This document is the protocol; `backend/investigation_time_study.py` is the instrumented Garuda-side timer; `backend/data/manual_baseline_minutes.json` is where real human timings go.

**Honesty rule:** this repository does not contain fabricated participant data. `backend/data/investigation_time_study_report.json` will show `manual_baseline_minutes: null` and `estimated_time_reduction_percent: null` for every task until a real session has been run. Do not fill in numbers you did not personally time.

---

## What is measured, and what is not

- **Garuda side** (automated, in this repo): wall-clock time for the real API call that answers each task, averaged over 5 repeats against a running backend. This measures *system response time* — a lower bound on the real "time to answer using Garuda," which also includes a few seconds of an officer reading the screen and clicking through.
- **Manual side** (requires real people, not automated here): time for a participant to answer the same question using a CSV/spreadsheet export of the same dataset, with a stopwatch, starting from "task read aloud" to "participant states the answer."

## Running the study (needs 3+ participants, ~45–60 minutes total)

1. Export the dataset participants will use manually: `backend/data/CaseMaster.csv`, `Accused.csv`, `ArrestSurrender.csv` (already exist from the data generator — this is the same data Garuda itself uses, so the comparison is apples-to-apples).
2. Recruit 3+ participants unfamiliar with the specific answers (ideally: someone who hasn't used Garuda, someone with basic Excel skills, one investigator if available).
3. For each task below, in a random order per participant (to avoid learning-effect bias):
   - Read the task prompt aloud, start a stopwatch.
   - Participant works only with Excel/Sheets/grep on the CSV exports — no Garuda.
   - Stop the watch when they state an answer (correct or not — record both time and correctness).
4. Record each participant's time (minutes, to one decimal place) in `backend/data/manual_baseline_minutes.json` under the matching task id. Use the **median** across participants as `manual_minutes`.
5. Run `python backend/investigation_time_study.py --base-url http://localhost:8000` (or your deployed AppSail URL) with the backend already running — this fills in the Garuda side and computes the reduction percentage automatically.
6. Report the resulting `backend/data/investigation_time_study_report.json` as-is, including the method disclosure it contains. Do not round away the "manual baseline" caveats.

## The 5 tasks (mirrors the challenge brief's own examples)

| id | Task given to the manual participant | Garuda equivalent (automated by the script) |
|---|---|---|
| `T1_repeat_offender_cases` | "Using the CSVs, find every case linked to the most-repeated accused name in the dataset." | `GET /api/network/kingpins?limit=1` |
| `T2_most_connected_suspect` | "Find the group of 3+ co-accused with the most shared cases, and name its most central member." | `GET /api/network/communities?limit=5&max_size=30` |
| `T3_suspect_connection` | "Given two named suspects, determine whether — and how — they are connected through shared cases." | `GET /api/network/path?source=...&target=...` |
| `T4_district_escalation` | "Across all 9 districts, find the station whose case count this month is a statistical outlier versus its own history." | `GET /api/anomalies` |
| `T5_district_comparison` | "Compare two named districts' total cases, high-risk case share, and arrest rate." | `GET /api/districts/{id}/summary` |

## Known limitations of this study design (state these alongside any result)

- Small sample size (3+ participants) is directional evidence, not a statistically powered study.
- Manual participants work from the same CSVs Garuda was built from — a real KSP investigator's manual baseline today likely involves multiple disconnected systems (CCTNS, physical registers, phone calls), which would make the *real* manual baseline slower than this study's floor, not faster.
- Garuda's measured time is server response time, not full human interaction time in the UI — the true UI-inclusive time is a few seconds higher per task.
- This is a same-team, same-day study, not an independent audit. Report it as such.
