# Backend integration: Phase 2 (datasets, analysis, reports)

The signed-in workspace now runs entirely on the backend. The bundled synthetic data and the local engine are used only by `/demo`.

## What changed

| Area | Before | Now |
| --- | --- | --- |
| Datasets | Two bundled synthetic datasets from `app/api/datasets` | `GET /datasets` and `GET /datasets/:id` for the signed-in organisation. Upload (`POST /datasets/upload`) and delete on the Datasets page |
| Analysis | Local keyword engine from `app/api/analyze` | `POST /analysis`. Z.ai picks the method and columns; the backend computes every number |
| Charts | `bar, histogram, line, hbar, scatter, box` | Backend `histogram`, `bar`, `groupSummary` (box plot), `heatmap` (counts table with column percentages) and `scatter` (with regression line) |
| Reports | Markdown compiled in the browser | `POST /reports` from the last analysis in the conversation, listed from `GET /reports`, PDF from `GET /reports/:id/download` |
| Starter questions | Fixed questions about the synthetic data | Built from the selected dataset's own columns |

`app/api/datasets` and `app/api/analyze` were removed. Tests fail if the live adapter or mapping imports the engine, the synthetic datasets or demo code.

## How a backend analysis is shown

`lib/workspace/live-mapping.js` turns the analysis record into the existing response layout:

- Headline: written from the computed results (means, counts, `pValueDisplay`, effect size). Never from the AI text, never the raw `pValue`.
- Explanation: the backend's `interpretation`. When it is `null`, a note says only the computed statistics are shown.
- Evidence: the chart for `visualizationData.type` and a row of key statistics.
- Technical details: method and AI rationale, all results, assumptions, limitations and the AI data disclosure (`methodology.aiDisclosure`).
- A `FAILED` analysis shows the backend's `errorMessage` with a Try again button.

Conversations stay in the browser, because the backend has no conversation resource. Each question is analysed on its own.

## Timeouts

`POST /analysis` can make two AI calls. The browser waits up to 190 s and the same-origin proxy up to 180 s. The workspace says an analysis can take up to a minute.

## Backend fix found during integration

Scatter `points` for correlation and regression had `x` and `y` swapped against their labels and `fitLine`. Fixed in `backend/src/analytics/engine.js`, with a unit test and a corrected contract example (contract changelog 0.2.1).

## Verified

Environment: PostgreSQL 16, backend and frontend on this branch, and a local stand-in for the Z.ai API that returns the documented response format. A real Z.ai key was not available, so method selection by the real model was not tested.

| Check | Result |
| --- | --- |
| Frontend unit tests (`npm test`) | 89 of 89 pass (25 new: mapping against every recorded backend example, adapter, client) |
| Backend unit tests | 49 of 49 pass |
| Existing browser suites (`npm run test:e2e`) | 20 of 20 and 3 of 3 pass |
| Phase 2 browser run: register, upload CSV, 5 analysis types, report PDF download, reload | All steps pass, no console or server errors |
| Personal-data column (`Patient Name`) | Detected, excluded from the variable list, not sent to the AI, refused if asked |
| `/demo` | Still answers on synthetic data and makes no `/api` calls |
| `next build` | Compiles |

## Still to do

- Test with a real Z.ai key: method choice for loosely worded questions and column names like `dm_status`.
- Dataset preview and the quality report (`/datasets/:id/preview`, `/quality`) are not shown yet.
- Retry uses a new `POST /analysis` rather than `POST /analysis/:id/retry`.
- Organisation member management is not in the workspace yet.
