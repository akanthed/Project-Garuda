# QuickML Generative AI Integration

Garuda uses QuickML LLM Serving as a constrained intent planner. The model does not query Data Store directly and does not make enforcement decisions. It returns a validated JSON plan; the FastAPI backend executes only approved analytical tools and returns source metadata to the UI.

## Why LLM Serving

- QuickML LLM Serving is documented as available in the US, IN, and EU data centers.
- Qwen 2.5 14B Instruct supports multilingual prompts and structured responses.
- Zia AutoML is not available in the IN data center and is predictive ML rather than generative AI.
- QuickML RAG is suitable for SOPs and policy documents later, but operational case filters remain backend tools.

Official references:

- https://docs.catalyst.zoho.com/en/quickml/help/generative-ai/llm-serving/
- https://docs.catalyst.zoho.com/en/quickml/help/generative-ai/rag/
- https://docs.catalyst.zoho.com/en/quickml/help/pipeline-endpoints/
- https://docs.catalyst.zoho.com/en/quickml/help/quickml-limitations/

## Optional Intent-Classification Dataset

`backend/data/quickml_training.csv` contains 10,000 balanced English/Kannada examples for the three approved actions: `search_cases`, `show_hotspots`, and `investigate_network`. Recreate it at any time with:

```powershell
backend\.venv-gen\Scripts\python.exe backend\generate_quickml_training.py
```

The default output columns are `example_id`, `query`, `action`, `crime_type`, `area`, `time_window`, and `language`. For a QuickML classification pipeline, use `query` as the text input and `action` as the target. The other columns support evaluation and future entity-extraction experiments.

This dataset is optional for the current Qwen LLM Serving adapter. LLM Serving uses the pre-trained model and does not train on this CSV.

### Legacy Zia AutoML Wizard

Do not upload `quickml_training.csv` on **Zia > AutoML > Create Model**. Its natural-language `query` column is a String, and Zia AutoML does not allow String columns as training inputs or targets.

The earlier `Garuda Intent Classifier` experiment should not be used. Zia produced near-random accuracy with all inputs and rejected the term-only retraining because it considered those columns insufficiently contributive. AutoML is not the right component for natural-language intent routing.

For a meaningful Zia AutoML integration, upload:

```text
backend/data/zia_risk_training.csv
```

Regenerate it with:

```powershell
backend\.venv-gen\Scripts\python.exe backend\generate_zia_risk_training.py
```

The dataset contains 100,000 balanced synthetic case records and relational features derived from cases, accused, arrests, station volume, and recency. It is ASCII, has no BOM or missing values, and contains numeric/categorical features only. In the wizard:

1. Use model name `Garuda Case Risk Classifier`.
2. Select `risk_class` as the target.
3. Confirm the model type is **Multi-Class Classification**.
4. Select all 13 remaining columns as inputs. If Catalyst limits the selection, prioritize `gravity_level`, `repeat_accused_count`, `accused_count`, `arrest_count`, `arrest_rate_percent`, `station_case_volume`, `crime_type_volume`, and `days_since_latest`.
5. Train and retain the model only if its held-out evaluation is materially above the 33.3% random baseline.

This model estimates a synthetic case-priority class for supervisor review. It must be described as prototype decision support, not validated crime prediction or an automated enforcement decision.

For reference, the deprecated compatibility file used these settings:

1. Select `action_class` as the target.
2. Confirm the model type is **Multi-Class Classification**.
3. Select `crime_type_id`, `area_id`, `time_window_id`, `language_id`, `has_case_terms`, `has_hotspot_terms`, and `has_network_terms` as inputs.
4. Do not integrate that model or use its score in the presentation.

Zoho documents Zia AutoML as unavailable in the IN data center. If `zia_automl_training.csv` still produces **Invalid Input: You cannot perform this action**, the blocker is regional/service entitlement rather than CSV formatting. Continue with QuickML LLM Serving, which Zoho documents as available in IN.

## Console Setup

**Verified live 2026-08-21 against this project's actual Console** (models offered can change over time —
`Qwen 2.5 - 14B Instruct` from the original plan is no longer listed; `GLM-4.7-Flash` and
`Qwen 3.6 - 35B Vision Language` are the two current options). `GLM-4.7-Flash` was chosen: it's
explicitly documented as optimized for "agent workflows" and is the lighter/cheaper of the two,
which fits a simple JSON-intent-classification task better than a 35B vision-language model.

1. Open Catalyst QuickML in the same IN data-center organization as Garuda (`#/quickml` → **LLM Serving**).
2. Select the model card (currently `GLM-4.7-Flash`).
3. Open **Model Details** for the endpoint URL, OAuth scope, and headers; open **Sample Request and
   Response** for the exact request/response body shape — the two tabs are separate, don't assume
   Model Details alone has everything.
4. **Preferred: set up Catalyst Connections instead of a static token** (does this automatically,
   see below) — avoids the manual OAuth token exchange and the "token expires before judging" risk
   entirely. If Connections isn't available, fall back to steps 5-7 below (a static access token).

### Preferred: Catalyst Connections (auto-refreshed, no manual token management)

Console → Cloud Scale → Connections → Create Connection → **Default Services** tab → search
"Catalyst by Zoho" (this exact pre-built connector covers all internal Catalyst OAuth scopes,
including `QuickML.deployment.READ` — no need for the "Custom Services" tab or a manually-created
OAuth client). Give it a name and a Connection Link Name (e.g. `garudaquickml`), check
`QuickML.deployment.READ` under scopes, click **Create and Connect**, then click **Connect** on the
resulting connection page. No client ID/secret step is needed — Catalyst manages the underlying
first-party OAuth client for its own services. Status should read **Connected**.

Then set only these two AppSail environment variables (no `QUICKML_ACCESS_TOKEN`/`QUICKML_ORG_ID`
needed for this path):

```text
QUICKML_LLM_ENDPOINT=https://api.catalyst.zoho.in/quickml/v1/project/<project_id>/glm/chat
QUICKML_MODEL=<model field from the Sample Request, e.g. crm-di-glm47b_30b_it>
QUICKML_CONNECTION_LINK_NAME=garudaquickml   # optional, this is the default
```

At request time, `backend/main.py`'s `_quickml_connection_headers(capp)` calls
`capp.connections().get_connection_credentials(QUICKML_CONNECTION_LINK_NAME)`. Catalyst SDK
versions return either direct `{"headers": {...}, "parameters": {...}}` details or the same details
under a `connections` key. Garuda normalizes both forms and also supports credentials supplied in
`parameters`; the AppSail-provided `X_ZOHO_CATALYST_ORG_ID` supplies `CATALYST-ORG` when the
connection response omits it. This requires `capp` (a real per-request Catalyst app instance, per
the standing per-request-initialize pattern in this repo), so it only activates when actually
running on Catalyst AppSail; local/non-Catalyst dev falls through to the static-token path below.

### Fallback: static access token (manual refresh required)

Only needed if Connections isn't set up. Create an OAuth client with scope
`QuickML.deployment.READ` and obtain an access token, then set these AppSail environment variables:

```text
QUICKML_LLM_ENDPOINT=https://api.catalyst.zoho.in/quickml/v1/project/<project_id>/glm/chat
QUICKML_ACCESS_TOKEN=<OAuth access token>
QUICKML_ORG_ID=<Catalyst organization ID, e.g. from CATALYST-ORG header shown in Model Details>
QUICKML_MODEL=<model field from the Sample Request, e.g. crm-di-glm47b_30b_it>
```

`QUICKML_ENDPOINT_KEY` is **not required** for this model — the live Model Details panel only lists
`CATALYST-ORG` and `Authorization: Zoho-oauthtoken <token>` as headers, no separate endpoint key. The
code still supports it as an optional header (only sent if the env var is set) in case a future model
requires one — don't assume it's needed by default.

Do not commit these values. **This token expires in ~1 hour with no auto-refresh** — this is exactly
why Connections (above) is the preferred path; only use this fallback if Connections is unavailable,
and refresh the token shortly before judging if you do.

**Request/response contract is an OpenAI-style chat completion, not a flat `prompt` field** — confirmed
directly from the Console's "Sample Request and Response" tab:

```json
{
  "model": "crm-di-glm47b_30b_it",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "max_tokens": 300,
  "temperature": 0.1,
  "stream": false
}
```

Response: standard `choices[0].message.content` chat-completion shape. `_quickml_plan_sync()` in
`backend/main.py` sends this exact request shape; `_extract_quickml_text()` already recursively finds
`content` inside `choices[0].message` without any change needed — it was written generically enough to
handle this response shape by coincidence, but that was verified, not assumed.

## Verification

1. Deploy AppSail with the environment variables.
2. Sign in to Garuda.
3. Ask: `High-risk theft areas in Whitefield this month`.
4. Ask the equivalent Kannada prompt: `ಈ ತಿಂಗಳ ವೈಟ್‌ಫೀಲ್ಡ್ ಹೆಚ್ಚಿನ ಅಪಾಯದ ಕಳ್ಳತನ ಪ್ರದೇಶಗಳು`.
5. Confirm the response badge says **QuickML AI**, not **Local fallback**.
6. Confirm the tool row reports `Analyzed hotspot evidence` and the result routes to the map.
7. Capture the browser and Network-tab evidence for the presentation.

Only claim active QuickML generative AI after step 5 succeeds in the deployed app.

## Safety Boundary

QuickML may choose one of eight allowlisted actions:

- `search_cases`
- `show_hotspots`
- `investigate_network`
- `compare_districts`
- `summarize_trends`
- `find_connection`
- `rank_offenders`
- `explain_correlations`

Pydantic rejects other actions, malformed time windows, invalid languages, invalid `district_ids`
(silently dropped by a `field_validator` rather than trusted), and confidence outside 0-1. The model
never receives credentials and cannot issue ZCQL. The backend applies filters to loaded records and
labels every response with its source. Every `/api/ask` call also returns a `trace` array (interpret →
execute → observe → answer), so the plan the model chose and the tool that actually ran are both
inspectable, not just the final answer.
