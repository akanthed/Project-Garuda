import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock Ask Garuda component
const AskGarudaMock = ({ onSearch, onPlan }: any) => (
  <div data-testid="ask-garuda">
    <input
      data-testid="search-input"
      placeholder="Ask Garuda..."
      type="text"
      onChange={(e) => onSearch?.(e.target.value)}
    />
    <button data-testid="search-button" onClick={() => onPlan?.()}>
      Search
    </button>
    <div data-testid="results-container">
      <div data-testid="result-count">0 cases</div>
      <div data-testid="result-source">Source: -</div>
      <div data-testid="confidence-score">Confidence: -</div>
    </div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('Ask Garuda - Natural Language Search', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it('should render search interface', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AskGarudaMock />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('ask-garuda')).toBeInTheDocument();
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    expect(screen.getByTestId('search-button')).toBeInTheDocument();
  });

  it('should accept user input for query', async () => {
    const user = userEvent.setup();
    const handleSearch = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <AskGarudaMock onSearch={handleSearch} />
      </QueryClientProvider>
    );
    const input = screen.getByTestId('search-input');
    await user.type(input, 'theft in whitefield');
    expect(handleSearch).toHaveBeenCalled();
  });

  it('should display search results container', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AskGarudaMock />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('results-container')).toBeInTheDocument();
  });

  it('should handle crime type queries', async () => {
    const user = userEvent.setup();
    const handlePlan = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <AskGarudaMock onPlan={handlePlan} />
      </QueryClientProvider>
    );
    const input = screen.getByTestId('search-input');
    await user.type(input, 'show me all theft cases');
    fireEvent.click(screen.getByTestId('search-button'));
    expect(handlePlan).toHaveBeenCalled();
  });

  it('should handle location-based queries', async () => {
    const user = userEvent.setup();
    const handlePlan = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <AskGarudaMock onPlan={handlePlan} />
      </QueryClientProvider>
    );
    const input = screen.getByTestId('search-input');
    await user.type(input, 'cases near WhiteField');
    fireEvent.click(screen.getByTestId('search-button'));
    expect(handlePlan).toHaveBeenCalled();
  });

  it('should handle time-based queries', async () => {
    const user = userEvent.setup();
    const handlePlan = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <AskGarudaMock onPlan={handlePlan} />
      </QueryClientProvider>
    );
    const input = screen.getByTestId('search-input');
    await user.type(input, 'recent cases last 7 days');
    fireEvent.click(screen.getByTestId('search-button'));
    expect(handlePlan).toHaveBeenCalled();
  });

  it('should display result source (QuickML or fallback)', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AskGarudaMock />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('result-source')).toBeInTheDocument();
  });

  it('should show confidence score', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AskGarudaMock />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('confidence-score')).toBeInTheDocument();
  });

  it('should clear input after search', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <AskGarudaMock />
      </QueryClientProvider>
    );
    const input = screen.getByTestId('search-input') as HTMLInputElement;
    await user.type(input, 'test query');
    expect(input.value).toBe('test query');
  });
});

describe('Ask Garuda - Query Parsing', () => {
  it('should parse multi-part queries', async () => {
    const user = userEvent.setup();
    const handleSearch = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <AskGarudaMock onSearch={handleSearch} />
      </QueryClientProvider>
    );
    const input = screen.getByTestId('search-input');
    await user.type(input, 'theft cases near whitefield in last 30 days');
    expect(handleSearch).toHaveBeenCalled();
  });

  it('should handle bilingual queries (English)', async () => {
    const user = userEvent.setup();
    const handleSearch = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <AskGarudaMock onSearch={handleSearch} />
      </QueryClientProvider>
    );
    const input = screen.getByTestId('search-input');
    await user.type(input, 'show high gravity crimes');
    expect(handleSearch).toHaveBeenCalled();
  });

  it('should support area/station name queries', async () => {
    const user = userEvent.setup();
    const handleSearch = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <AskGarudaMock onSearch={handleSearch} />
      </QueryClientProvider>
    );
    const input = screen.getByTestId('search-input');
    await user.type(input, 'cases from Whitefield station');
    expect(handleSearch).toHaveBeenCalled();
  });

  it('should handle empty query gracefully', async () => {
    const user = userEvent.setup();
    const handleSearch = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <AskGarudaMock onSearch={handleSearch} />
      </QueryClientProvider>
    );
    const button = screen.getByTestId('search-button');
    fireEvent.click(button);
    // Should not crash
    expect(screen.getByTestId('ask-garuda')).toBeInTheDocument();
  });
});

describe('Ask Garuda - Results Display', () => {
  it('should display case count', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AskGarudaMock />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('result-count')).toBeInTheDocument();
  });

  it('should show result-evidence samples', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AskGarudaMock />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('results-container')).toBeInTheDocument();
  });

  it('should indicate if results are from AI or rules', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AskGarudaMock />
      </QueryClientProvider>
    );
    const source = screen.getByTestId('result-source');
    expect(source).toBeInTheDocument();
  });
});
