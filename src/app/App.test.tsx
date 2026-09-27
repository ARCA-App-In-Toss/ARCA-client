import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { expect, test } from 'vitest';
import { App } from './App.tsx';

test('root mounts without axe violations', async () => {
  const { container } = render(<App />);

  expect(screen.getByTestId('app-root')).toBeInTheDocument();
  const result = await axe.run(container);
  expect(result.violations).toEqual([]);
});
