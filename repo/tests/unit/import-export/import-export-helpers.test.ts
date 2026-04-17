import { describe, expect, it } from 'vitest';

import { listImportExportEntityOptions } from '../../../src/core/import-export/import-export-service';

describe('import/export helpers', () => {
  it('listImportExportEntityOptions returns all entity types', () => {
    const options = listImportExportEntityOptions();
    expect(options.length).toBeGreaterThan(0);

    const entityTypes = options.map((option) => option.entityType);
    expect(entityTypes).toContain('merchants');
    expect(entityTypes).toContain('bookings');
    expect(entityTypes).toContain('collaborationNotes');
    expect(entityTypes).toContain('workspaceBackup');
  });

  it('each option has a label and supported formats', () => {
    const options = listImportExportEntityOptions();
    for (const option of options) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.supportedFormats.length).toBeGreaterThan(0);
    }
  });

  it('workspace backup only supports JSON format', () => {
    const options = listImportExportEntityOptions();
    const backup = options.find((option) => option.entityType === 'workspaceBackup');
    expect(backup).toBeTruthy();
    expect(backup?.supportedFormats).toEqual(['json']);
  });
});
