export const ORG_HIERARCHY_SEED = {
  organization: {
    id: 'org-localops',
    nodeType: 'organization',
    name: 'LocalOps Organization',
    parentId: null
  },
  departments: [
    {
      id: 'dept-operations',
      nodeType: 'department',
      name: 'Operations',
      parentId: 'org-localops'
    },
    {
      id: 'dept-people',
      nodeType: 'department',
      name: 'People',
      parentId: 'org-localops'
    }
  ],
  grades: [
    {
      id: 'grade-ops-g6',
      nodeType: 'grade',
      name: 'G6',
      parentId: 'dept-operations'
    },
    {
      id: 'grade-people-g5',
      nodeType: 'grade',
      name: 'G5',
      parentId: 'dept-people'
    }
  ],
  classes: [
    {
      id: 'class-ops-full-time',
      nodeType: 'class',
      name: 'Full Time',
      parentId: 'grade-ops-g6'
    },
    {
      id: 'class-people-full-time',
      nodeType: 'class',
      name: 'Full Time',
      parentId: 'grade-people-g5'
    }
  ]
} as const;

export const POSITION_SEED = [
  {
    id: 'position-floor-operations-lead',
    title: 'Floor Operations Lead',
    departmentNodeId: 'dept-operations',
    gradeNodeId: 'grade-ops-g6',
    classNodeId: 'class-ops-full-time',
    responsibilities: [
      'Lead day-to-day shift operations.',
      'Coordinate staffing and service readiness.',
      'Escalate and resolve critical floor incidents.'
    ],
    eligibilityRules: [
      'Minimum 3 years operations leadership experience.',
      'Availability for weekends and evenings.'
    ],
    headcountLimit: 3
  },
  {
    id: 'position-hr-generalist',
    title: 'HR Generalist',
    departmentNodeId: 'dept-people',
    gradeNodeId: 'grade-people-g5',
    classNodeId: 'class-people-full-time',
    responsibilities: [
      'Own candidate communications and onboarding handoffs.',
      'Maintain policy-compliant hiring records.',
      'Partner with managers on hiring pipeline planning.'
    ],
    eligibilityRules: [
      'HR certification preferred.',
      'Experience with hiring workflows and compliance.'
    ],
    headcountLimit: 2
  }
] as const;

export const HIERARCHY_NODE_TYPE_ORDER = {
  organization: 0,
  department: 1,
  grade: 2,
  class: 3
} as const;
