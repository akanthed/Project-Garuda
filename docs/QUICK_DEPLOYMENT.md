# 🚀 Quick Deployment Guide - Garuda

**Time to Deploy**: ~5 minutes  
**Status**: ✅ Deployed to Catalyst Development

---

## What Was Done (Today)

✅ Created `RiskAssessment.tsx` component  
✅ Added bilingual translations (EN + KN)  
✅ Integrated into ReportsView drawer  
✅ Fixed all TypeScript errors  
✅ **Frontend builds clean** (no errors)

The backend serves QuickML risk, forecast, anomaly, voice, translation, role-scoped reports,
Command comparisons, and patrol recommendations.

---

## 1️⃣ Test Locally (Optional)

```bash
# Start dev server
npm run dev

# Open http://localhost:5173
# Login → Reports tab
# Click any case
# Should see Risk Assessment box below severity badge
```

---

## 2️⃣ Build for Production

```bash
# Build optimized version
npm run build

# Output: dist/ folder (ready to deploy)
```

✅ Build succeeds with no errors

---

## 3️⃣ Deploy to Zoho Catalyst

```powershell
npm run build
catalyst deploy --only client
```

Do not use an undocumented `npm run deploy` or `catalyst hosting push` command.

### Backend Deployment Warning

`catalyst deploy --only appsail` replaces the complete AppSail environment with
`backend/app-config.json`. The tracked file intentionally excludes `SESSION_SECRET`, `SEED_TOKEN`,
all three QuickML endpoint keys, `JOB_SCHEDULER_TOKEN`, and `SIGNALS_WEBHOOK_TOKEN`. Use the guarded
prompt/inject/deploy/restore process described in [DEPLOY.md](DEPLOY.md); never commit those values.

---

## 4️⃣ Verify in Production

### Test 1: Component Shows
1. Sign in as SI, ACP, or DGP.
2. Open Reports and select a case.
3. Confirm QuickML Risk Assessment appears and reports its source/model ID.
4. Sign in as Constable and confirm station-only reports omit risk, suspect, FIR, and workflow controls.

### Test 2: Data Displays
Look for:
- 🎯 Risk badge (LOW/MEDIUM/HIGH)
- 📊 Confidence % with bar
- 🔍 Contributing factors list
- 🤖 Source indicator (QuickML pipeline or local fallback)

### Test 3: Bilingual
1. Click language toggle (top header)
2. Switch English ↔ Kannada
3. ✅ Risk Assessment text should translate

### Test 4: Fallback Works
1. (Temporarily stop backend)
2. Click case
3. ✅ Should show "⚡ Local rule-based analysis"
4. (Restart backend)

---

## 📋 What's Different Now?

### Before
- Officer opened case
- Saw: ID, title, severity, workflow options
- Didn't know: Is this case high-risk?

### After ✨
- Officer opens case
- **NEW**: Sees instant risk assessment
  - Risk level with color
  - Confidence score
  - Why it's risky (factors)
  - Trust indicator (which model predicted it)

---

## 🔧 Files Modified

```
src/
├── components/dashboard/
│   ├── RiskAssessment.tsx              ✨ NEW (130 lines)
│   └── ReportsView.tsx                 📝 MODIFIED (added import + component)
└── lib/
    └── i18n.ts                         📝 MODIFIED (added 13 translation keys)
```

---

## 🎯 Result

When officer opens a case, they now see:

```
┌─────────────────────────────────┐
│ 🟡 MEDIUM RISK (87% Confidence) │
│    ████████░ 87%                │
│                                 │
│ Contributing Factors:           │
│ • Offence Gravity: Level 2      │
│ • Repeat Accused: 1             │
│ • Accused Count: 3              │
│ • Arrest Rate: 67%              │
│ • Station Case Volume: 145      │
│                                 │
│ 🤖 QuickML trained model        │
│                                 │
│ ⚠️  Human review still required │
└─────────────────────────────────┘
```

---

## ✨ Bilingual Support

| Label | English | Kannada |
|-------|---------|---------|
| Title | Risk Assessment | ಅಪಾಯ ಮೌಲ್ಯಮಾಪನ |
| Confidence | Confidence | ವಿಶ್ವಾಸ |
| Factors | Contributing Factors | ಅವದಾನ ಅಂಶಗಳು |
| Source (AI) | QuickML trained model | QuickML ತರಬೇತಿ ಪಡೆದ ಮಾದರಿ |
| Source (Local) | Local rule-based analysis | ಸ್ಥಳೀಯ ನಿಯಮ-ಆಧಾರಿತ ವಿಶ್ಲೇಷಣೆ |

---

## 🐛 Troubleshooting

### Q: Risk Assessment doesn't show after deploy
**A**: Check backend is running
```bash
curl -H "Authorization: Bearer <token>" \
     https://your-backend/api/risk/1
```

### Q: Showing "unavailable" instead of risk level
**A**: Backend is falling back to local scoring (this is fine, still works)

### Q: Text shows as ???? in Kannada
**A**: Your system needs Kannada fonts; try refreshing page

### Q: Getting 404 error
**A**: Make sure you're logged in as valid officer (needs session)

---

## 📞 Next Steps

1. **Deploy** (`npm run build` + upload `dist/`)
2. **Test** (Click a case, see Risk Assessment)
3. **Share** (Tell team officers about new feature)
4. **Celebrate** 🎉 (Risk-aware case management!)

---

## 📚 Documentation

For detailed info:
- **Integration Details**: [FRONTEND_INTEGRATION_GUIDE.md](FRONTEND_INTEGRATION_GUIDE.md)
- **Deployment Status**: [FRONTEND_DEPLOYMENT_READY.md](FRONTEND_DEPLOYMENT_READY.md)
- **Visual Guide**: [RISK_ASSESSMENT_VISUAL_GUIDE.md](RISK_ASSESSMENT_VISUAL_GUIDE.md)
- **Component Code**: [src/components/dashboard/RiskAssessment.tsx](../src/components/dashboard/RiskAssessment.tsx)

---

## ✅ You're Ready!

- ✅ Backend: Running on Catalyst AppSail
- ✅ Frontend: Built and tested
- ✅ i18n: Bilingual ready
- ✅ Tests: All passing
- ✅ Docs: Complete

**Just deploy and go live!** 🚀

---

*Last Updated*: 2026-07-20  
*Component Status*: Production Ready  
*Build Status*: ✅ Clean  
*Test Status*: ✅ Passing
