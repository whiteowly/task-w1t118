import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SignatureCanvasHarness from './SignatureCanvasHarness.svelte';

describe('SignatureCanvas', () => {
  it('renders canvas element', () => {
    const { container } = render(SignatureCanvasHarness);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('renders clear button', () => {
    const { getByRole } = render(SignatureCanvasHarness);
    expect(getByRole('button', { name: 'Clear drawn signature' })).toBeTruthy();
  });

  it('initial value is empty', () => {
    const { getByTestId } = render(SignatureCanvasHarness);
    expect(getByTestId('canvas-value').textContent).toBe('');
  });

  it('renders with disabled state without error', () => {
    const { container } = render(SignatureCanvasHarness, { props: { disabled: true } });
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });
});
