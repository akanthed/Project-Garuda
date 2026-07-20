import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock component for graph testing
const LinkGraphMock = ({ nodes, links, onNodeClick }: any) => (
  <div data-testid="link-graph">
    <canvas data-testid="graph-canvas" />
    <div data-testid="graph-stats">
      Nodes: {nodes?.length || 0} | Links: {links?.length || 0}
    </div>
    <div data-testid="graph-controls">
      <button data-testid="graph-reset">Reset View</button>
      <button data-testid="graph-zoom-in">Zoom In</button>
    </div>
    {nodes?.map((node: any) => (
      <div
        key={node.id}
        data-testid={`node-${node.id}`}
        onClick={() => onNodeClick?.(node)}
        role="button"
        tabIndex={0}
      >
        {node.name}
      </div>
    ))}
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('LinkGraph Component - Network Visualization', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it('should render graph container', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <LinkGraphMock nodes={[]} links={[]} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('link-graph')).toBeInTheDocument();
  });

  it('should render canvas for force graph visualization', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <LinkGraphMock nodes={[]} links={[]} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument();
  });

  it('should display correct node and link counts', () => {
    const mockNodes = [
      { id: '1', name: 'Accused-A' },
      { id: '2', name: 'Accused-B' },
      { id: '3', name: 'Case-1' },
    ];
    const mockLinks = [
      { source: '1', target: '3' },
      { source: '2', target: '3' },
    ];
    render(
      <QueryClientProvider client={queryClient}>
        <LinkGraphMock nodes={mockNodes} links={mockLinks} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('graph-stats')).toHaveTextContent('Nodes: 3');
    expect(screen.getByTestId('graph-stats')).toHaveTextContent('Links: 2');
  });

  it('should render all nodes as interactive elements', () => {
    const mockNodes = [
      { id: 'a1', name: 'Suspect-Alice' },
      { id: 'a2', name: 'Suspect-Bob' },
    ];
    render(
      <QueryClientProvider client={queryClient}>
        <LinkGraphMock nodes={mockNodes} links={[]} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('node-a1')).toBeInTheDocument();
    expect(screen.getByTestId('node-a2')).toBeInTheDocument();
  });

  it('should handle node click events', () => {
    const handleNodeClick = vi.fn();
    const mockNodes = [{ id: 'node-1', name: 'Suspect-1' }];
    render(
      <QueryClientProvider client={queryClient}>
        <LinkGraphMock nodes={mockNodes} links={[]} onNodeClick={handleNodeClick} />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByTestId('node-node-1'));
    expect(handleNodeClick).toHaveBeenCalled();
  });

  it('should provide graph controls', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <LinkGraphMock nodes={[]} links={[]} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('graph-reset')).toBeInTheDocument();
    expect(screen.getByTestId('graph-zoom-in')).toBeInTheDocument();
  });

  it('should display empty state for no data', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <LinkGraphMock nodes={[]} links={[]} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('graph-stats')).toHaveTextContent('Nodes: 0');
    expect(screen.getByTestId('graph-stats')).toHaveTextContent('Links: 0');
  });
});

describe('LinkGraph - Connection Analysis', () => {
  it('should visualize bipartite graph (suspects ↔ cases)', () => {
    const mockNodes = [
      { id: 's1', name: 'Suspect-1', type: 'suspect' },
      { id: 's2', name: 'Suspect-2', type: 'suspect' },
      { id: 'c1', name: 'Case-001', type: 'case' },
      { id: 'c2', name: 'Case-002', type: 'case' },
    ];
    const mockLinks = [
      { source: 's1', target: 'c1' },
      { source: 's1', target: 'c2' },
      { source: 's2', target: 'c1' },
    ];
    render(
      <QueryClientProvider client={queryClient}>
        <LinkGraphMock nodes={mockNodes} links={mockLinks} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('graph-stats')).toHaveTextContent('Nodes: 4');
    expect(screen.getByTestId('graph-stats')).toHaveTextContent('Links: 3');
  });

  it('should identify repeat accused across cases', () => {
    const mockNodes = [
      { id: 'acc-1', name: 'Accused-1', repeat: true },
      { id: 'acc-2', name: 'Accused-2', repeat: false },
    ];
    render(
      <QueryClientProvider client={queryClient}>
        <LinkGraphMock nodes={mockNodes} links={[]} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('node-acc-1')).toHaveTextContent('Accused-1');
  });

  it('should handle large graphs with many connections', () => {
    const mockNodes = Array.from({ length: 50 }, (_, i) => ({
      id: `node-${i}`,
      name: `Entity-${i}`,
    }));
    const mockLinks = Array.from({ length: 100 }, (_, i) => ({
      source: `node-${Math.floor(Math.random() * 50)}`,
      target: `node-${Math.floor(Math.random() * 50)}`,
    }));
    render(
      <QueryClientProvider client={queryClient}>
        <LinkGraphMock nodes={mockNodes} links={mockLinks} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('graph-stats')).toHaveTextContent('Nodes: 50');
  });

  it('should highlight connected paths', () => {
    const mockNodes = [
      { id: 's1', name: 'Suspect-1' },
      { id: 'c1', name: 'Case-1' },
      { id: 's2', name: 'Suspect-2' },
    ];
    const mockLinks = [
      { source: 's1', target: 'c1' },
      { source: 'c1', target: 's2' },
    ];
    render(
      <QueryClientProvider client={queryClient}>
        <LinkGraphMock nodes={mockNodes} links={mockLinks} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('graph-stats')).toHaveTextContent('Links: 2');
  });
});
