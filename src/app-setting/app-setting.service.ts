import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from './app-setting.entity';
import { AppSettings, defaultAppSettings, normalizeAppSettingsInput, readStoredValue } from './app-setting-input';

@Injectable()
export class AppSettingService {
  constructor(@InjectRepository(AppSetting) private readonly repo: Repository<AppSetting>) {}

  async findAll(): Promise<AppSettings> {
    const out = defaultAppSettings() as Record<string, unknown>;
    for (const row of await this.repo.find()) {
      const value = readStoredValue(row.key, row.value);
      if (value !== undefined) out[row.key] = value;
    }
    return out as AppSettings;
  }

  async update(body: Record<string, unknown>): Promise<AppSettings> {
    const input = normalizeAppSettingsInput(body, await this.findAll());
    for (const [key, value] of Object.entries(input)) {
      // value is NOT NULL: a cleared setting is no row, which reads as its default.
      if (value === null) await this.repo.delete(key);
      else await this.repo.save({ key, value });
    }
    return this.findAll();
  }
}
