import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { installIntersectionObserver, resetIntersectionObservers } from './intersection.ts';

installIntersectionObserver();

afterEach(() => {
  cleanup();
  resetIntersectionObservers();
});
