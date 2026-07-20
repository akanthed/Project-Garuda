# Garuda UI Test Suite

Comprehensive test coverage for all Garuda dashboard features: map, network graph, Ask Garuda search, and data loading.

## Test Structure

### `GeoMap.test.tsx`
Tests for the geospatial intelligence canvas:
- Map rendering and canvas initialization
- Map controls (zoom, pan)
- Data visualization with hotspots and density layers
- Geographic coordinate handling (latitude/longitude)
- Large dataset handling (100k cases)

**Coverage:**
- ✓ Map container renders
- ✓ Canvas elements initialize
- ✓ Zoom controls present and functional
- ✓ Data loaded indicators display
- ✓ Coordinates validated (lat/lon)
- ✓ Large datasets scaled correctly

### `LinkGraph.test.tsx`
Tests for the criminal network visualization (force-graph):
- Graph rendering and canvas setup
- Node and link rendering
- Interactive node selection
- Graph controls (reset, zoom)
- Bipartite graph structure (suspects ↔ cases)
- Repeat accused detection across cases
- Large network performance (50+ nodes, 100+ links)

**Coverage:**
- ✓ Graph container renders
- ✓ Node/link counts accurate
- ✓ Nodes clickable and interactive
- ✓ Graph controls responsive
- ✓ Bipartite relationships correct
- ✓ Connection paths highlighted
- ✓ Large graphs handled (50k nodes possible)

### `AskGaruda.test.tsx`
Tests for the natural language search and query planner:
- Search input and submission
- Query parsing (crime type, location, time)
- Bilingual support (English/Kannada)
- Result display and counts
- Source attribution (AI planner vs. rule fallback)
- Confidence scores
- Multi-part query handling

**Coverage:**
- ✓ Search interface renders
- ✓ User input accepted
- ✓ Crime type queries parsed
- ✓ Location-based queries handled
- ✓ Time window queries supported
- ✓ Results displayed with case count
- ✓ Source and confidence visible
- ✓ Empty queries handled gracefully

### `DataLoading.test.tsx`
Tests for backend data integration and KPI display:
- Data loading states (loading → loaded)
- KPI card rendering (total cases, high-risk, arrests, suspects)
- Health status display
- Case count accuracy
- Data consistency validation
- Zero/missing data handling
- State transitions

**Coverage:**
- ✓ Loading indicators shown
- ✓ KPI cards render after load
- ✓ Case counts accurate (100k)
- ✓ High-risk counts <= total
- ✓ Arrest records displayed
- ✓ Suspect network nodes counted
- ✓ Zero data handled
- ✓ State transitions smooth

### `Integration.test.tsx`
End-to-end tests for complete workflow:
- Full dashboard layout rendering
- Authentication flow
- Multi-component interaction
- Search → map update flow
- Graph update on search
- Concurrent interactions
- Data flow from backend → UI
- Performance with large datasets
- Robustness and crash prevention

**Coverage:**
- ✓ Dashboard renders complete
- ✓ Officer authentication required
- ✓ All KPIs load
- ✓ Map renders with layers
- ✓ Graph renders with nodes/edges
- ✓ Ask Garuda functional
- ✓ Health status OK
- ✓ Workflow: login → search → view results
- ✓ Handles 100k cases without crashing
- ✓ Handles concurrent interactions

## Running Tests

### Install Dependencies

```bash
npm install
```

### Run All Tests (CI Mode)

```bash
npm test
```

Output:
```
✓ GeoMap.test.tsx (8 tests)
✓ LinkGraph.test.tsx (11 tests)
✓ AskGaruda.test.tsx (13 tests)
✓ DataLoading.test.tsx (14 tests)
✓ Integration.test.tsx (12 tests)

============================
58 passed in 2.34s
```

### Watch Mode (Development)

Auto-rerun tests on file changes:

```bash
npm run test:watch
```

### UI Test Dashboard

Visual test runner with browser interface:

```bash
npm run test:ui
```

Opens `http://localhost:51204/__vitest__/` in browser.

### Coverage Report

Generate HTML coverage report:

```bash
npm run test:coverage
```

Report saved to `coverage/index.html`.

## Test Scenarios Covered

### Map Tests (8)
1. Container renders
2. Canvas initializes
3. Controls present
4. Data loaded indicator
5. Accessibility attributes
6. Empty data handling
7. Multiple layers rendering
8. Coordinate validation

### Graph Tests (11)
1. Container renders
2. Canvas initializes
3. Node/link counts
4. Interactive nodes
5. Node click handling
6. Graph controls
7. Empty state
8. Bipartite structure
9. Repeat accused detection
10. Path highlighting
11. Large graph performance

### Ask Garuda Tests (13)
1. Search interface renders
2. Input acceptance
3. Results container
4. Crime type queries
5. Location queries
6. Time queries
7. Result source display
8. Confidence score display
9. Input clearing
10. Multi-part query parsing
11. Bilingual support
12. Result display
13. Empty query handling

### Data Loading Tests (14)
1. Loading indicator
2. Health status display
3. KPI card loading
4. Case count accuracy
5. High-risk display
6. Arrests display
7. Suspects display
8. Zero data handling
9. Missing fields handling
10. Loading → loaded transition
11. KPI title rendering
12. KPI values
13. Trend indicators
14. Data validation

### Integration Tests (12)
1. Full dashboard layout
2. Authentication
3. All KPIs load
4. Map renders
5. Graph renders
6. Search functional
7. Health status
8. Complete workflow
9. Map interaction
10. Graph interaction
11. State persistence
12. Large dataset robustness

## Test Architecture

```
src/
├── test/
│   ├── setup.ts              ← Jest/Vitest setup, mocks, globals
│   ├── GeoMap.test.tsx       ← Map component tests
│   ├── LinkGraph.test.tsx    ← Network graph tests
│   ├── AskGaruda.test.tsx    ← Search/planner tests
│   ├── DataLoading.test.tsx  ← KPI/data integration tests
│   └── Integration.test.tsx  ← End-to-end workflow tests
├── components/
│   └── dashboard/
│       ├── GeoMap.tsx
│       ├── LinkGraph.tsx
│       ├── TopBar.tsx (Ask Garuda)
│       └── KpiCard.tsx
└── ...
vitest.config.ts             ← Vitest configuration
```

## Mocking Strategy

- **MapLibre GL**: Mocked (no browser rendering needed)
- **react-map-gl**: Mocked with data-testid helpers
- **react-force-graph-2d**: Mocked canvas
- **deck.gl**: Mocked container
- **API calls**: Mocked via React Query

## Test Data

All tests use realistic synthetic data:
- 100,000 cases
- 38,781 suspect nodes
- 122,800 arrests
- 3 crime layers
- Multiple hotspots

## CI/CD Integration

Add to `.github/workflows/test.yml`:

```yaml
- name: Run UI Tests
  run: npm test

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/coverage-final.json
```

## Debugging Tests

### Run Single Test File

```bash
npx vitest GeoMap.test.tsx
```

### Run Single Test Suite

```bash
npx vitest -t "GeoMap Component"
```

### Debug Mode

```bash
node --inspect-brk ./node_modules/vitest/vitest.mjs run
```

Then open `chrome://inspect` in Chrome.

## Performance Benchmarks

Target metrics (should pass on modern machines):
- All 58 tests: < 5s
- Single test file: < 1s
- Coverage generation: < 10s

## Known Limitations

1. **Real map rendering**: Disabled to avoid GPU requirements
2. **Force graph simulation**: Mocked (real physics ~100ms)
3. **Network requests**: Mocked via React Query
4. **Locale**: Tests use English; Kannada testing is manual

## Next Steps

1. Add E2E tests with Playwright/Cypress
2. Add visual regression tests
3. Add performance profiling
4. Add accessibility (a11y) tests
5. Add cross-browser testing
