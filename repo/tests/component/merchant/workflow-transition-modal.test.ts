import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import WorkflowTransitionModalHarness from './WorkflowTransitionModalHarness.svelte';

describe('WorkflowTransitionModal', () => {
  it('requires reason before confirm when configured', async () => {
    const { getByRole, getByLabelText, getByTestId } = render(WorkflowTransitionModalHarness);

    const confirmButton = getByRole('button', { name: 'Reject' }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    await fireEvent.input(getByLabelText('Reason'), {
      target: { value: 'Needs mandatory fields' }
    });
    expect(confirmButton.disabled).toBe(false);

    await fireEvent.click(confirmButton);

    expect(getByTestId('captured-reason').textContent).toContain('Needs mandatory fields');
  });
});
