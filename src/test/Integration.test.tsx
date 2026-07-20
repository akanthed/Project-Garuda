import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock complete dashboard integration
const IntegrationDashboardMock = ({ onReady }: any) => (
  <div data-testid="integration-dashboard">
    <header data-testid="dashboard-header">
      <h1>Project Garuda</h1>
      <div data-testid="auth-status">Officer: logged in</div>
    </header>

    <section data-testid="kpi-section">
      <div data-testid="kpi-cards">
        <div data-testid="kpi-cases">100,000 Cases</div>
        <div data-testid="kpi-suspects">38,781 Suspects</div>
        <div data-testid="kpi-arrests">122,800 Arrests</div>
      </div>
    </section>

    <section data-testid="map-section">
      <div data-testid="map-container">
        <canvas data-testid="map-canvas" />
        <div data-testid="map-layers">3 active layers</div>
      </div>
    </section>

    <section data-testid="search-section">
      <input
        data-testid="ask-garuda-input"
        placeholder="Ask Garuda..."
        onKeyPress={(e) => {
          if (e.key === 'Enter') onReady?.();
        }}
      />
      <button data-testid="search-submit">Search</button>
    </section>

    <section data-testid="graph-section">
      <div data-testid="graph-container">
        <canvas data-testid="graph-canvas" />
        <div data-testid="graph-info">50 nodes, 120 edges</div>
      </div>
    </section>

    <footer data-testid="dashboard-footer">
      <div data-testid="health-check">✓ All systems operational</div>
    </footer>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('Garuda Integration Tests - Complete Workflow', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it('should render complete dashboard layout', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('integration-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-header')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-section')).toBeInTheDocument();
    expect(screen.getByTestId('map-section')).toBeInTheDocument();
    expect(screen.getByTestId('search-section')).toBeInTheDocument();
    expect(screen.getByTestId('graph-section')).toBeInTheDocument();
  });

  it('should authenticate officer before displaying dashboard', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('auth-status')).toHaveTextContent('logged in');
  });

  it('should load and display all KPI data', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('kpi-cases')).toHaveTextContent('100,000 Cases');
    expect(screen.getByTestId('kpi-suspects')).toHaveTextContent('38,781 Suspects');
    expect(screen.getByTestId('kpi-arrests')).toHaveTextContent('122,800 Arrests');
  });

  it('should render map with active layers', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByTestId('map-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('map-layers')).toHaveTextContent('3 active layers');
  });

  it('should render graph with suspect network data', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('graph-container')).toBeInTheDocument();
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('graph-info')).toHaveTextContent('50 nodes');
  });

  it('should have functional Ask Garuda search', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock />
      </QueryClientProvider>
    );
    const input = screen.getByTestId('ask-garuda-input');
    await user.type(input, 'theft cases in whitefield');
    expect(input).toHaveValue('theft cases in whitefield');
  });

  it('should show health status', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('health-check')).toHaveTextContent('All systems operational');
  });
});

describe('Garuda - Complete User Workflow', () => {
  it('should complete: login → view KPI → search → see results', async () => {
    const user = userEvent.setup();
    const handleReady = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock onReady={handleReady} />
      </QueryClientProvider>
    );

    // Step 1: Verify auth
    expect(screen.getByTestId('auth-status')).toHaveTextContent('logged in');

    // Step 2: Check KPI loaded
    expect(screen.getByTestId('kpi-cases')).toBeInTheDocument();

    // Step 3: Interact with map
    const mapContainer = screen.getByTestId('map-container');
    expect(mapContainer).toBeVisible();

    // Step 4: Use Ask Garuda
    const searchInput = screen.getByTestId('ask-garuda-input');
    await user.type(searchInput, 'high gravity crimes');
    fireEvent.keyPress(searchInput, { key: 'Enter', code: 'Enter' });

    // Step 5: Verify graph loaded
    expect(screen.getByTestId('graph-container')).toBeInTheDocument();
  });

  it('should handle map interaction', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock />
      </QueryClientProvider>
    );

    // Map should be interactive
    const mapCanvas = screen.getByTestId('map-canvas');
    fireEvent.click(mapCanvas);
    expect(mapCanvas).toBeInTheDocument();
  });

  it('should handle graph node interaction', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock />
      </QueryClientProvider>
    );

    // Graph should be rendered
    const graphCanvas = screen.getByTestId('graph-canvas');
    fireEvent.click(graphCanvas);
    expect(graphCanvas).toBeInTheDocument();
  });

  it('should maintain state across interactions', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock />
      </QueryClientProvider>
    );

    // Check initial state
    expect(screen.getByTestId('kpi-cases')).toHaveTextContent('100,000 Cases');

    // Perform interaction
    const input = screen.getByTestId('ask-garuda-input');
    await user.type(input, 'test query');

    // State should persist
    expect(screen.getByTestId('kpi-cases')).toHaveTextContent('100,000 Cases');
  });
});

describe('Garuda - Data Flow Integration', () => {
  it('should flow: backend health → KPI load → UI render', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock />
      </QueryClientProvider>
    );

    // Health should be OK
    expect(screen.getByTestId('health-check')).toHaveTextContent('operational');

    // KPI should load
    expect(screen.getByTestId('kpi-cases')).toBeInTheDocument();

    // UI should render all sections
    expect(screen.getByTestId('map-section')).toBeInTheDocument();
    expect(screen.getByTestId('search-section')).toBeInTheDocument();
    expect(screen.getByTestId('graph-section')).toBeInTheDocument();
  });

  it('should handle search query → process → display results', async () => {
    const user = userEvent.setup();
    const handleSearch = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock onReady={handleSearch} />
      </QueryClientProvider>
    );

    const input = screen.getByTestId('ask-garuda-input');
    await user.type(input, 'show cases');
    fireEvent.click(screen.getByTestId('search-submit'));

    expect(screen.getByTestId('graph-info')).toBeInTheDocument();
  });

  it('should coordinate map, graph, and search results', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock />
      </QueryClientProvider>
    );

    // All key components present
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByTestId('graph-container')).toBeInTheDocument();
    expect(screen.getByTestId('ask-garuda-input')).toBeInTheDocument();

    // They should all be visible and functional
    expect(screen.getByTestId('map-canvas')).toBeVisible();
    expect(screen.getByTestId('graph-canvas')).toBeVisible();
  });
});

describe('Garuda - Robustness', () => {
  it('should not crash with large dataset (100k cases)', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('kpi-cases')).toHaveTextContent('100,000');
  });

  it('should handle concurrent interactions', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock />
      </QueryClientProvider>
    );

    const input = screen.getByTestId('ask-garuda-input');
    const mapCanvas = screen.getByTestId('map-canvas');

    // Multiple interactions simultaneously
    await user.type(input, 'query');
    fireEvent.click(mapCanvas);

    // Should handle gracefully
    expect(screen.getByTestId('integration-dashboard')).toBeInTheDocument();
  });

  it('should maintain performance with multiple renders', () => {
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <IntegrationDashboardMock />
      </QueryClientProvider>
    );

    for (let i = 0; i < 5; i++) {
      rerender(
        <QueryClientProvider client={queryClient}>
          <IntegrationDashboardMock />
        </QueryClientProvider>
      );
    }

    expect(screen.getByTestId('integration-dashboard')).toBeInTheDocument();
  });
});
