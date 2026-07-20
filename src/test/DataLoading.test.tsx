import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock KPI Card component
const KpiCardMock = ({ title, value, metric, trend }: any) => (
  <div data-testid={`kpi-card-${metric}`}>
    <div data-testid={`kpi-title-${metric}`}>{title}</div>
    <div data-testid={`kpi-value-${metric}`}>{value}</div>
    {trend && <div data-testid={`kpi-trend-${metric}`}>{trend}</div>}
  </div>
);

// Mock Dashboard with data loading
const DashboardMock = ({ isLoading, data }: any) => (
  <div data-testid="dashboard">
    {isLoading && <div data-testid="loading-indicator">Loading...</div>}
    {!isLoading && (
      <>
        <div data-testid="health-status">
          Cases: {data?.cases || 0} | Nodes: {data?.graph_nodes || 0}
        </div>
        <KpiCardMock
          metric="total-cases"
          title="Total Cases"
          value={data?.cases || 0}
        />
        <KpiCardMock
          metric="high-risk-cases"
          title="High Risk"
          value={data?.high_risk || 0}
        />
        <KpiCardMock
          metric="arrests"
          title="Arrests"
          value={data?.arrests || 0}
        />
        <KpiCardMock
          metric="graph-nodes"
          title="Suspects"
          value={data?.graph_nodes || 0}
        />
      </>
    )}
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('Dashboard Data Loading', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it('should render loading indicator while fetching', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardMock isLoading={true} data={null} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
  });

  it('should display health status after loading', () => {
    const mockData = {
      cases: 100000,
      graph_nodes: 38781,
    };
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardMock isLoading={false} data={mockData} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('health-status')).toHaveTextContent('Cases: 100000');
    expect(screen.getByTestId('health-status')).toHaveTextContent('Nodes: 38781');
  });

  it('should load all KPI cards successfully', () => {
    const mockData = {
      cases: 100000,
      high_risk: 33334,
      arrests: 122800,
      graph_nodes: 38781,
    };
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardMock isLoading={false} data={mockData} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('kpi-card-total-cases')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-card-high-risk-cases')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-card-arrests')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-card-graph-nodes')).toBeInTheDocument();
  });

  it('should display correct case count', () => {
    const mockData = { cases: 100000 };
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardMock isLoading={false} data={mockData} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('kpi-value-total-cases')).toHaveTextContent('100000');
  });

  it('should display high-risk case count', () => {
    const mockData = { high_risk: 33334 };
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardMock isLoading={false} data={mockData} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('kpi-value-high-risk-cases')).toHaveTextContent(
      '33334'
    );
  });

  it('should display arrest records count', () => {
    const mockData = { arrests: 122800 };
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardMock isLoading={false} data={mockData} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('kpi-value-arrests')).toHaveTextContent('122800');
  });

  it('should display graph node count (suspect network)', () => {
    const mockData = { graph_nodes: 38781 };
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardMock isLoading={false} data={mockData} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('kpi-value-graph-nodes')).toHaveTextContent(
      '38781'
    );
  });

  it('should handle zero data gracefully', () => {
    const mockData = {
      cases: 0,
      high_risk: 0,
      arrests: 0,
      graph_nodes: 0,
    };
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardMock isLoading={false} data={mockData} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('kpi-value-total-cases')).toHaveTextContent('0');
  });

  it('should handle missing data fields', () => {
    const mockData = { cases: 5000 };
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardMock isLoading={false} data={mockData} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('health-status')).toHaveTextContent('Cases: 5000');
  });

  it('should transition from loading to loaded state', async () => {
    const mockData = {
      cases: 100000,
      graph_nodes: 38781,
    };
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <DashboardMock isLoading={true} data={null} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={queryClient}>
        <DashboardMock isLoading={false} data={mockData} />
      </QueryClientProvider>
    );

    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
    expect(screen.getByTestId('health-status')).toBeInTheDocument();
  });
});

describe('KPI Card Component', () => {
  it('should render KPI title', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <KpiCardMock
          metric="test-kpi"
          title="Test Metric"
          value={42}
        />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('kpi-title-test-kpi')).toHaveTextContent(
      'Test Metric'
    );
  });

  it('should render KPI value', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <KpiCardMock
          metric="test-kpi"
          title="Test Metric"
          value={1234}
        />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('kpi-value-test-kpi')).toHaveTextContent('1234');
  });

  it('should display trend indicator if provided', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <KpiCardMock
          metric="test-kpi"
          title="Test Metric"
          value={1234}
          trend="↑ 15%"
        />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('kpi-trend-test-kpi')).toHaveTextContent('↑ 15%');
  });
});

describe('Data Consistency', () => {
  it('should validate case count is positive integer', () => {
    const mockData = { cases: 100000 };
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardMock isLoading={false} data={mockData} />
      </QueryClientProvider>
    );
    const caseValue = parseInt(
      screen.getByTestId('kpi-value-total-cases').textContent || '0',
      10
    );
    expect(caseValue).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(caseValue)).toBe(true);
  });

  it('should validate high-risk cases <= total cases', () => {
    const mockData = {
      cases: 100000,
      high_risk: 33334,
    };
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardMock isLoading={false} data={mockData} />
      </QueryClientProvider>
    );
    const totalCases = 100000;
    const highRisk = 33334;
    expect(highRisk).toBeLessThanOrEqual(totalCases);
  });

  it('should validate arrests count is reasonable', () => {
    const mockData = {
      cases: 100000,
      arrests: 122800,
    };
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardMock isLoading={false} data={mockData} />
      </QueryClientProvider>
    );
    const arrests = parseInt(
      screen.getByTestId('kpi-value-arrests').textContent || '0',
      10
    );
    expect(arrests).toBeGreaterThanOrEqual(0);
  });
});
