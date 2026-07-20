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

1. Open Catalyst QuickML in the same IN data-center organization as Garuda.
2. Open **Generative AI > LLM Serving > Models**.
3. Select **Qwen 2.5 - 14B Instruct**.
4. Open **Model Details > API Details**.
5. Copy the endpoint URL, endpoint key, model name, exact sample request, and exact sample response.
6. Create an OAuth client with scope `QuickML.deployment.READ` and obtain an access token.
7. Set these AppSail environment variables in the Catalyst Console:

```text
QUICKML_LLM_ENDPOINT=<API Details endpoint URL>
QUICKML_ENDPOINT_KEY=<API Details endpoint key>
QUICKML_ACCESS_TOKEN=<OAuth access token>
QUICKML_ORG_ID=<Catalyst organization ID>
QUICKML_MODEL=<model name from API Details>
```

Do not commit these values. OAuth access tokens expire; use the console's recommended refresh-token flow for production. For the hackathon demo, refresh the token shortly before judging.

The public documentation describes the fields but renders the exact request/response sample inside the authenticated Model Details panel. Compare that sample with `_quickml_plan_sync()` in `backend/main.py`. If the console uses a field other than `prompt`, update only the request body and `_extract_quickml_text()` response adapter.

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

QuickML may choose one of three actions:

- `search_cases`
- `show_hotspots`
- `investigate_network`

Pydantic rejects other actions, malformed time windows, invalid languages, and confidence outside 0-1. The model never receives credentials and cannot issue ZCQL. The backend applies filters to loaded records and labels every response with its source.
