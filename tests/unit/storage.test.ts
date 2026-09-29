import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCAL, migrate, SCHEMA_VERSION } from '@/shared/storage';

describe('local storage migration', () => {
  it('adds the opt-in overlay setting to existing v1 data without changing preferences', () => {
    const migrated = migrate({
      schemaVersion: 1,
      settings: { enabled: false, showCounter: true },
      mutedOrigins: ['https://example.com'],
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.settings).toEqual({
      enabled: false,
      showCounter: true,
      particleOverlayEnabled: false,
      weeklyReportNotificationEnabled: false,
    });
    expect(migrated.mutedOrigins).toEqual(['https://example.com']);
  });

  it('defaults the overlay off on a fresh install', () => {
    expect(migrate({}).settings.particleOverlayEnabled).toBe(false);
    expect(DEFAULT_LOCAL.settings.particleOverlayEnabled).toBe(false);
    expect(DEFAULT_LOCAL.settings.weeklyReportNotificationEnabled).toBe(false);
  });

  it('adds the notification preference to existing v2 settings', () => {
    const migrated = migrate({
      schemaVersion: 2,
      settings: { enabled: true, showCounter: false, particleOverlayEnabled: true },
    });

    expect(migrated.settings).toEqual({
      enabled: true,
      showCounter: false,
      particleOverlayEnabled: true,
      weeklyReportNotificationEnabled: false,
    });
  });
});