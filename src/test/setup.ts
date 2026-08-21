import { expect, afterEach, afterAll, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import * as React from 'react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia for responsive design tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock MapLibre GL
vi.mock('maplibre-gl', () => ({
  Map: vi.fn(),
  NavigationControl: vi.fn(),
  GeolocateControl: vi.fn(),
}));

// Mock react-map-gl (the app imports the maplibre entrypoint; v8 has no root export)
vi.mock('react-map-gl/maplibre', () => {
  return {
    Map: React.forwardRef(({ children }: any) => React.createElement('div', { 'data-testid': 'map-container' }, children)),
    Marker: ({ children }: any) => React.createElement('div', { 'data-testid': 'map-marker' }, children),
    Source: React.forwardRef(({ children }: any) => React.createElement('div', { 'data-testid': 'map-source' }, children)),
    Layer: () => React.createElement('div', { 'data-testid': 'map-layer' }),
    Popup: ({ children }: any) => React.createElement('div', { 'data-testid': 'map-popup' }, children),
    NavigationControl: () => React.createElement('div', { 'data-testid': 'nav-control' }),
    useControl: vi.fn(),
  };
});

// Mock react-force-graph
vi.mock('react-force-graph-2d', () => {
  return {
    default: vi.fn().mockImplementation(({ nodeLabel, linkLabel }: any) =>
      React.createElement(
        'div',
        { 'data-testid': 'force-graph' },
        React.createElement('canvas', { 'data-testid': 'force-graph-canvas' })
      )
    ),
  };
});

// Mock deck.gl components
vi.mock('@deck.gl/react', () => {
  return {
    DeckGL: ({ children, layers }: any) =>
      React.createElement(
        'div',
        { 'data-testid': 'deckgl-container' },
        children,
        React.createElement('div', { 'data-testid': 'deckgl-layers' }, layers?.length || 0)
      ),
  };
});

// Suppress console errors in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render') ||
        args[0].includes('Not implemented: HTMLFormElement.prototype.submit'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
