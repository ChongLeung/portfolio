// This list is hand-written. Discovery must never define required coverage.
export const requiredFeatures = [
  'portfolio-content',
  'fictional-disclosure',
  'build-provenance',
  'logo-editor',
  'language-modes',
  'english-playfulness',
  'cantonese-playfulness',
  'message-emojis',
  'private-vocabulary',
  'school-mode',
  'narration',
  'scheduled-settings',
  'external-sources',
  'dim-sum-surprise',
  'regex-workbench',
  'surface-search',
  'notifications',
  'material-components',
  'appearance-editor',
  'color-translator',
  'tabs',
  'tab-groups',
  'tab-searches',
  'offline-docs',
  'command-palette',
  'destructive-confirmation',
  'local-history',
  'changelog',
  'external-editor',
  'exports-imports',
  'bulk-actions',
  'accessibility',
  'responsive-layout',
  'element-locks',
  'support-tickets',
  'download-surfaces',
  'unlock-ladder',
  'social-preview',
  'attention-modes',
  'file-converter',
  'ollama-manager',
  'authenticator',
  'context-actions',
  'resizable-panels',
  'status-hub',
  'design-parity',
] as const;
export const requiredSurfaces = [
  'portfolio',
  'settings',
  'history',
  'help',
  'tools',
  'authenticator',
] as const;
export type FeatureId = (typeof requiredFeatures)[number];
export type EvidenceRow = {
  feature: FeatureId;
  surface: (typeof requiredSurfaces)[number];
  status: 'missing' | 'partial' | 'verified';
  implementation: string[];
  documentation: string[];
  localization: string[];
  persistence: string[];
  tests: string[];
  interaction: string[];
  captures: string[];
};

// No verified rows are asserted until the built, source-bound evidence exists.
export const evidenceRows: EvidenceRow[] = [];
