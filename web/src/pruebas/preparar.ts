import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { EventSourceFalso } from './eventSourceFalso';

beforeEach(() => {
  EventSourceFalso.instancias = [];
  (globalThis as { EventSource?: unknown }).EventSource = EventSourceFalso;
});

afterEach(() => cleanup());
