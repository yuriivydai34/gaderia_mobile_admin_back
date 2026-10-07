import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from './app-setting.entity';
import { APP_SETTINGS, AppSettingKey, AppSettings, normalizeAppSettingsInput } from './app-setting-input';

@Injectable()
export class AppSettingService {
  constructor(@InjectRepository(AppSetting) private readonly repo: Repository<AppSetting>) {}

  async findAll(): Promise<AppSettings> {
    const rows = await this.repo.find();
    const out: AppSettings = { ...APP_SETTINGS };
    for (const row of rows) {
      if (row.key in APP_SETTINGS && typeof row.value === 'boolean') out[row.key as AppSettingKey] = row.value;
    }
    return out;
  }

  async update(body: Record<string, unknown>): Promise<AppSettings> {
    const input = normalizeAppSettingsInput(body);
    await this.repo.save(Object.entries(input).map(([key, value]) => ({ key, value })));
    return this.findAll();
  }
}
