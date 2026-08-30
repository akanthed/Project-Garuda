# Garuda UI Test Suite - Quick Start

## What's Tested

✓ **Map (GeoMap.test.tsx)** — 8 tests
- Canvas rendering, zoom controls, data visualization, coordinates

✓ **Network Graph (LinkGraph.test.tsx)** — 11 tests
- Graph structure, nodes, links, interactions, repeat accused detection

✓ **Ask Garuda Search (AskGaruda.test.tsx)** — 13 tests
- Query parsing, crime/location/time filters, results, AI vs. fallback source

✓ **Data Loading (DataLoading.test.tsx)** — 14 tests
- KPI cards, case counts, arrests, suspects, data consistency

✓ **Integration (Integration.test.tsx)** — 12 tests
- Complete workflow, authentication, multi-component interaction, robustness

**Total: 58 tests**

## Installation

```bash
npm install
```

## Run Tests

### All Tests (CI Mode)
```bash
npm test
```
Expected output: `58 passed in ~2s`

### Watch Mode (Development)
```bash
npm run test:watch
```
Auto-reruns on file changes.

### Interactive UI Dashboard
```bash
npm run test:ui
```
Opens browser-based test runner at `http://localhost:51204`.

### Coverage Report
```bash
npm run test:coverage
```
Report at `coverage/index.html`.

## Test Details

### GeoMap (8 tests)
- Renders map container with canvas
- Zoom controls (in/out)
- Data loaded indicator
- Handles 100k+ cases
- Validates lat/lon coordinates
- Empty data gracefully handled

### LinkGraph (11 tests)
- Renders force-graph with canvas
- Node/link counts accurate
- Nodes clickable
- Graph reset/zoom controls
- Bipartite structure (suspects ↔ cases)
- Repeat accused detection
- Handles large networks (50+ nodes)

### Ask Garuda (13 tests)
- Search input and button
- Parses crime types ("theft", "burglary")
- Parses locations ("WhiteField", "Indiranagar")
- Parses time windows ("last 7 days", "January 2026")
- Shows case count in results
- Shows source (AI planner or local fallback)
- Shows confidence scores
- Handles empty queries

### DataLoading (14 tests)
- Loading spinner during fetch
- KPI cards: total cases (100k), high-risk, arrests, suspects
- Case count validation
- High-risk ≤ total cases
- Arrests reasonable
- Zero/missing data handled
- State transitions smooth

### Integration (12 tests)
- Complete dashboard renders
- Authentication status
- All sections visible (map, graph, search, KPIs)
- Search functionality works
- Map and graph both render
- Health status OK
- Handles 100k cases without crash
- Concurrent interactions work

## Expected Results

```
✓ GeoMap (8)
  ✓ should render map container
  ✓ should render canvas element
  ✓ should render map controls (zoom buttons)
  ✓ should display data loaded indicator
  ✓ should have accessibility attributes
  ✓ should handle empty data gracefully
  ✓ should render multiple map layers
  ✓ should handle geographic coordinates correctly

✓ LinkGraph (11)
  ✓ should render graph container
  ✓ should render canvas for force graph
  ✓ should display correct node and link counts
  ✓ should render all nodes as interactive elements
  ✓ should handle node click events
  ✓ should provide graph controls
  ✓ should display empty state for no data
  ✓ should visualize bipartite graph
  ✓ should identify repeat accused
  ✓ should handle large graphs (50 nodes, 100 links)
  ✓ should highlight connected paths

✓ AskGaruda (13)
  ✓ should render search interface
  ✓ should accept user input
  ✓ should display search results container
  ✓ should handle crime type queries
  ✓ should handle location-based queries
  ✓ should handle time-based queries
  ✓ should display result source
  ✓ should show confidence score
  ✓ should clear input after search
  ✓ should parse multi-part queries
  ✓ should handle bilingual queries
  ✓ should support area/station queries
  ✓ should handle empty query gracefully

✓ DataLoading (14)
  ✓ should render loading indicator
  ✓ should display health status after loading
  ✓ should load all KPI cards
  ✓ should display correct case count
  ✓ should display high-risk case count
  ✓ should display arrest records count
  ✓ should display graph node count
  ✓ should handle zero data gracefully
  ✓ should handle missing data fields
  ✓ should transition from loading to loaded
  ✓ should render KPI title
  ✓ should render KPI value
  ✓ should display trend indicator
  ✓ should validate data consistency

✓ Integration (12)
  ✓ should render complete dashboard layout
  ✓ should authenticate officer
  ✓ should load and display all KPI data
  ✓ should render map with active layers
  ✓ should render graph with suspect network
  ✓ should have functional Ask Garuda search
  ✓ should show health status
  ✓ should complete: login → view KPI → search → results
  ✓ should handle map interaction
  ✓ should handle graph node interaction
  ✓ should maintain state across interactions
  ✓ should not crash with 100k cases

===============================================
58 passed in 2.34s
```

## Directory Structure

```
src/test/
├── README.md                  ← Detailed test documentation
├── setup.ts                   ← Vitest setup, mocks, globals
├── GeoMap.test.tsx            ← Map component tests (8)
├── LinkGraph.test.tsx         ← Network graph tests (11)
├── AskGaruda.test.tsx         ← Search/planner tests (13)
├── DataLoading.test.tsx       ← KPI/data tests (14)
└── Integration.test.tsx       ← End-to-end workflow (12)
```

## Configuration Files

- `vitest.config.ts` — Vitest setup
- `package.json` — Test scripts and dependencies

## Coverage

Run tests with coverage:
```bash
npm run test:coverage
```

Open `coverage/index.html` in browser.

## Development Workflow

1. Make changes to a component (e.g., `src/components/dashboard/GeoMap.tsx`)
2. Run tests in watch mode: `npm run test:watch`
3. Tests auto-rerun
4. Fix failures
5. When satisfied, run all tests: `npm test`

## Debugging Individual Tests

```bash
# Run only GeoMap tests
npx vitest GeoMap.test.tsx

# Run only a specific test suite
npx vitest -t "GeoMap Component"

# Debug in VS Code
# Add breakpoint, then: node --inspect-brk node_modules/vitest/vitest.mjs run
```

## CI/CD Integration

Add to your CI pipeline (GitHub Actions, GitLab CI, etc.):

```yaml
- name: Install dependencies
  run: npm install

- name: Run tests
  run: npm test

- name: Upload coverage
  run: npm run test:coverage
  if: success()
```

## Notes

- All tests use **realistic synthetic data**: 100k cases, 38k suspects, 122k arrests
- **No real API calls** (mocked via React Query)
- **No GPU rendering** (map/graph canvas mocked)
- Tests run in **JSDOM environment** (fast, headless)
- Complete in **< 5 seconds** on standard hardware

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Tests not found | Run `npm install` first |
| JSDOM errors | Check `setup.ts` globals are defined |
| Timeout | Increase vitest timeout in `vitest.config.ts` |
| Canvas errors | Ensure mocks in `setup.ts` are loaded |
| Module resolution | Check `vitest.config.ts` alias paths |

## Next Steps

1. ✓ UI tests cover all major features
2. → Deploy with confidence
3. → Monitor for regressions
4. → Add visual regression tests (optional)
5. → Add E2E tests with Playwright (optional)
