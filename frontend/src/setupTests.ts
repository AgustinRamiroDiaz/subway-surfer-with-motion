import '@testing-library/jest-dom';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

class TestResizeObserver {
  observe(): void {
    // jsdom does not implement layout, so resize observations are inert in tests.
  }

  unobserve(): void {
    // jsdom does not implement layout, so resize observations are inert in tests.
  }

  disconnect(): void {
    // jsdom does not implement layout, so resize observations are inert in tests.
  }
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: TestResizeObserver,
});

Object.defineProperty(globalThis, 'ResizeObserver', {
  writable: true,
  value: TestResizeObserver,
});
