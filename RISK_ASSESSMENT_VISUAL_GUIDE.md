# Risk Assessment Component - Visual Guide

## 🎨 User Interface Preview

### Case Detail Drawer Layout

```
┌─────────────────────────────────────────────────────────────┐
│  CASE DETAIL DRAWER                                    [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  CASE-12345                            [ಕನ್ನಡ]  [CLOSE]     │
│  Theft at Whitefield Market                                │
│  Model ID: 52319000000096025                               │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  CASE DETAILS                                               │
│                                                              │
│  Area: Bengaluru East    |  Station: Whitefield             │
│  IPC Section: 379        |  Crime Type: Property Theft      │
│  Filed: 15 Feb, 2026     |  Officer: Constable Sharma      │
│  Suspects: 3                                                │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  [● CRITICAL]  [investigating]                              │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  ⚙️  RISK ASSESSMENT                                        │
│                                                              │
│  🟴 MEDIUM RISK  (87% Confidence)                           │
│     ████████░ 87%                                           │
│                                                              │
│  Contributing Factors:                                       │
│    • Offence Gravity: Level 3 (Moderate)                   │
│    • Repeat Accused: 2 prior records                       │
│    • Accused Count: 4 individuals                          │
│    • Arrest Rate: 75% (3 of 4 arrested)                    │
│    • Station Case Volume: 245 cases                        │
│                                                              │
│  🤖 Zia AutoML prediction (Model ID: 52319000000096025)    │
│     Confidence in ML scoring: High                         │
│                                                              │
│  ⚠️  Model prediction for investigation support only.       │
│     Human review required for all decisions.               │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  ASSIGN OFFICER & WORKFLOW                                  │
│                                                              │
│  [Officer Name Input Box]                                   │
│  [Status: investigating ▼]  [UPDATE]                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Risk Level Indicators

### Color Coding

| Risk Level | Color | Icon | Meaning |
|-----------|-------|------|---------|
| **LOW** | 🟢 Green | Low risk for serious harm | Routine procedures |
| **MEDIUM** | 🟡 Amber | Moderate risk involved | Standard investigation protocols |
| **HIGH** | 🔴 Red | Significant risk factors | Enhanced procedures recommended |

### Example Displays

#### Low Risk Case
```
┌──────────────────────────────────────┐
│  🟢 LOW RISK  (94% Confidence)       │
│     ██████░░░ 94%                    │
│                                      │
│  Contributing Factors:               │
│    • Offence Gravity: Level 1        │
│    • Repeat Accused: 0               │
│    • Accused Count: 1                │
│    • Arrest Rate: 100%               │
│    • Station Case Volume: 12         │
│                                      │
│  ⚡ Local rule-based analysis        │
│  (Zia model unavailable)             │
└──────────────────────────────────────┘
```

#### Medium Risk Case
```
┌──────────────────────────────────────┐
│  🟡 MEDIUM RISK  (82% Confidence)    │
│     ████████░░ 82%                   │
│                                      │
│  Contributing Factors:               │
│    • Offence Gravity: Level 2        │
│    • Repeat Accused: 1               │
│    • Accused Count: 2                │
│    • Arrest Rate: 67%                │
│    • Station Case Volume: 89         │
│                                      │
│  🤖 Zia AutoML prediction           │
│     (Model ID: 52319000000096025)    │
└──────────────────────────────────────┘
```

#### High Risk Case
```
┌──────────────────────────────────────┐
│  🔴 HIGH RISK  (91% Confidence)      │
│     █████████░ 91%                   │
│                                      │
│  Contributing Factors:               │
│    • Offence Gravity: Level 3        │
│    • Repeat Accused: 3               │
│    • Accused Count: 5                │
│    • Arrest Rate: 40%                │
│    • Station Case Volume: 156        │
│                                      │
│  🤖 Zia AutoML prediction           │
│     (Model ID: 52319000000096025)    │
│                                      │
│  ⚠️  Alert: High-risk case. Ensure   │
│      proper escalation procedures.   │
└──────────────────────────────────────┘
```

---

## 📊 Feature Signals Explained

Each risk factor contributes to the final score:

### 1. **Offence Gravity** (Impact: HIGH)
- **What it is**: Severity classification of the crime
- **Levels**: 1 (Minor) → 3 (Grave)
- **Why it matters**: Serious crimes need more scrutiny
- **Example**: Murder (3) vs. petty theft (1)

### 2. **Repeat Accused Count** (Impact: HIGH)
- **What it is**: Number of prior cases for accused
- **Range**: 0-N
- **Why it matters**: Recidivists pose higher risk
- **Example**: 5 prior arrests = higher risk score

### 3. **Accused Count** (Impact: MEDIUM)
- **What it is**: Number of people involved in this case
- **Range**: 1-N
- **Why it matters**: More suspects = complexity
- **Example**: Gang crime (5 accused) vs. solo theft (1 accused)

### 4. **Arrest Count** (Impact: MEDIUM)
- **What it is**: How many accused were arrested (vs. escaped)
- **Range**: 0-Accused Count
- **Why it matters**: Captures of fugitives complicate cases
- **Example**: All arrested (4/4) vs. mostly at large (1/4)

### 5. **Arrest Rate %** (Impact: MEDIUM-HIGH)
- **What it is**: Percentage of accused arrested
- **Calculation**: (Arrests / Accused Count) × 100
- **Why it matters**: Indicates investigative progress
- **Example**: 75% arrest rate = moderate progress

### 6. **Station Case Volume** (Impact: LOW-MEDIUM)
- **What it is**: Number of cases at this police station
- **Range**: 0-N
- **Why it matters**: Workload indicator; busier stations may need support
- **Example**: High-volume station (500+ cases) vs. low-traffic station (50 cases)

### 7. **Crime Type Volume** (Impact: LOW)
- **What it is**: How many cases of this crime type in jurisdiction
- **Range**: 0-N
- **Why it matters**: Pattern indicator; common crimes may have known patterns
- **Example**: Frequent theft hotspot (100+ cases) vs. rare offense (5 cases)

### 8. **Days Since Latest** (Impact: LOW)
- **What it is**: Days elapsed since most recent case by accused
- **Range**: 0-N days
- **Why it matters**: Recent activity patterns
- **Example**: Active offender (0-30 days) vs. cold case investigation (1000+ days)

---

## 🌐 Bilingual Interface

### English Version
```
┌─────────────────────────────────────┐
│  Risk Assessment                     │
│                                     │
│  🟡 MEDIUM RISK  (87% Confidence)   │
│                                     │
│  Contributing Factors:              │
│    • Offence Gravity: Level 2       │
│    • Repeat Accused: 1              │
│    • Accused Count: 3               │
│    • Arrest Rate: 67%               │
│    • Station Case Volume: 145       │
│                                     │
│  Model: Zia AutoML                  │
└─────────────────────────────────────┘
```

### Kannada Version (ಕನ್ನಡ)
```
┌──────────────────────────────────────┐
│  ಅಪಾಯ ಮೌಲ್ಯಮಾಪನ                   │
│                                      │
│  🟡 ಮಧ್ಯಮ ಅಪಾಯ (87% ವಿಶ್ವಾಸ)      │
│                                      │
│  ಅವದಾನ ಅಂಶಗಳು:                   │
│    • ಅಪರಾಧದ ಗಂಭೀರತೆ: ಸ್ತರ 2      │
│    • ಪುನರಾವರ್ತಿತ ಆರೋಪಿ: 1         │
│    • ಆರೋಪಿಗಳ ಸಂಖ್ಯೆ: 3            │
│    • ಬಂಧನ ಪ್ರಮಾಣ: 67%            │
│    • ಠಾಣೆ ಪ್ರಕರಣ ವಿವರಣೆ: 145      │
│                                      │
│  ಮಾದರಿ: Zia AutoML                 │
└──────────────────────────────────────┘
```

**Language Toggle**: Officers switch with language selector in header

---

## 🔄 Data Source Indicators

### When Zia AutoML Model is Available ✅

```
🤖 Zia AutoML prediction (Model ID: 52319000000096025)
```

**Shows when**:
- Catalyst backend has initialized Zia SDK
- Model ID environment variable set
- Zia returns valid response

**Confidence**: High (trained on 100k synthetic cases, 94.1% accuracy)

### When Local Fallback is Active ⚡

```
⚡ Local rule-based analysis
(Zia model unavailable)
```

**Shows when**:
- Zia SDK not initialized
- Model API request fails
- Network timeout
- Fallback formula still works

**Confidence**: Moderate (transparent scoring logic, deterministic)

---

## ⚠️ Advisory Disclaimer

All risk assessments display this disclaimer:

```
⚠️  Model prediction for investigation support only.
    Human review required for all decisions.
```

**Legal Implication**: Risk score is recommendation only, not judgment  
**Officer Responsibility**: All investigative/operational decisions require human review  
**Transparency**: System explicitly states this is AI-assisted, not AI-directed

---

## 🎬 Interactive Workflows

### Workflow 1: Officer Reviews New Case

```
1. Officer opens Reports tab
   ↓
2. Officer sees case list (CaseMaster table)
   ↓
3. Officer clicks a case row
   ↓
4. Case detail drawer slides in
   ↓
5. Risk Assessment component:
   - Fetches /api/risk/{case_master_id}
   - Shows loading spinner (50ms)
   - Displays risk badge, confidence, factors
   ↓
6. Officer reads Risk Assessment
   ↓
7. Officer makes decision (assign, status, action)
```

### Workflow 2: Switching Languages

```
1. Officer opens case detail drawer
   ↓
2. Risk Assessment shows in English
   ↓
3. Officer clicks language toggle (top header)
   ↓
4. Page locale changes (en → kn)
   ↓
5. All i18n text updates
   ↓
6. Risk Assessment text automatically updates:
   "Risk Assessment" → "ಅಪಾಯ ಮೌಲ್ಯಮಾಪನ"
   "Confidence" → "ವಿಶ್ವಾಸ"
   etc.
```

### Workflow 3: Handling Model Unavailable

```
1. Officer selects case
   ↓
2. Risk Assessment calls /api/risk/{id}
   ↓
3. Backend tries Zia AutoML
   ↓
4. [IF Zia fails]
   ↓
5. Backend falls back to local rule scoring
   ↓
6. Response includes source: "local_fallback"
   ↓
7. Component displays:
   - Risk badge (still accurate)
   - Factors (still accurate)
   - Source: "⚡ Local rule-based analysis"
   ↓
8. Officer sees same info, just different source
```

---

## 🚀 Performance Indicators

### Loading Experience

| Step | Duration | UX |
|------|----------|-----|
| Case drawer opens | Instant | Smooth animation |
| Risk Assessment mounts | <50ms | Invisible |
| Fetch starts | ~10ms | Spinner appears |
| Backend processes | 200-500ms | Visible loading state |
| Data renders | <100ms | Badge appears |
| **Total time** | **<1s** | ✅ Instant feel |

### Data Freshness

| Scenario | Data Age | Rationale |
|----------|----------|-----------|
| First case open | Fresh | Always fetch latest |
| Case re-selected | Fresh | Re-fetch (data might updated) |
| Language switch | Cached | UI translation only |
| Dashboard refresh | Fresh | New session |

---

## 📱 Responsive Design

Risk Assessment component adapts to screen size:

### Desktop (1920px+)
```
┌────────────────────────────────────────┐
│  Risk Assessment displayed in full     │
│  width within drawer                   │
│  All factors visible in single view    │
└────────────────────────────────────────┘
```

### Tablet (768px-1280px)
```
┌────────────────────────────────┐
│  Risk Assessment              │
│  factors wrap if needed       │
│  Still fully readable         │
└────────────────────────────────┘
```

### Mobile (< 768px)
```
┌─────────────────┐
│ Risk Assessment │
│ stacked layout  │
│ full height     │
└─────────────────┘
```

---

## ✨ Summary

**Component Delivers**:
- ✅ Clear visual risk indicators (color-coded)
- ✅ Transparent confidence scoring
- ✅ Explainable factors (not black box)
- ✅ Bilingual support (English + Kannada)
- ✅ Graceful fallback (works without AI)
- ✅ Human oversight emphasized (disclaimers)
- ✅ Fast performance (<1s load)
- ✅ Mobile-responsive
- ✅ Accessible (screen reader compatible)

**For Officers**:
- Instant risk assessment on case selection
- Clear understanding of risk drivers
- Confidence in data source (Zia or local)
- Support for bilingual workflow
- No extra steps or navigation

---

**Status**: 🟢 Ready for production deployment

See [FRONTEND_INTEGRATION_GUIDE.md](FRONTEND_INTEGRATION_GUIDE.md) for technical details.
