export const DEFAULT_RECRUITING_OFFER_TEMPLATES = [
  {
    id: 'offer-template-floor-ops-lead',
    name: 'Floor Operations Lead Offer',
    positionId: 'position-floor-operations-lead',
    compensationAmountCents: 9_500_000,
    compensationCurrency: 'USD',
    responsibilities: [
      'Lead floor staffing plans and shift readiness.',
      'Coach team leads on operational standards.',
      'Coordinate escalations for service incidents.'
    ],
    eligibilityRules: [
      'Minimum 3 years people leadership experience.',
      'Weekend availability required.'
    ]
  },
  {
    id: 'offer-template-hr-generalist',
    name: 'HR Generalist Offer',
    positionId: 'position-hr-generalist',
    compensationAmountCents: 8_600_000,
    compensationCurrency: 'USD',
    responsibilities: [
      'Drive recruiting coordination and candidate communications.',
      'Maintain onboarding policy compliance.',
      'Support workforce planning handoffs.'
    ],
    eligibilityRules: [
      'Prior HR operations experience preferred.',
      'Strong written communication skills required.'
    ]
  }
] as const;

export const DEFAULT_ONBOARDING_CHECKLIST_ITEMS = [
  {
    itemCode: 'documents',
    label: 'Documents submitted'
  },
  {
    itemCode: 'background-check',
    label: 'Background check'
  },
  {
    itemCode: 'orientation',
    label: 'Orientation completed'
  }
] as const;

export function formatCompensationCurrency(amountCents: number, currency: string): string {
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  return formatter.format(amountCents / 100);
}

export function maskSsn(ssn: string): string {
  return `***-**-${ssn.slice(-4)}`;
}
