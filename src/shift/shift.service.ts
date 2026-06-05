import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shift } from './shift.entity';

@Injectable()
export class ShiftService {
  constructor(
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
  ) {}

  async refreshToken(pinCode: string): Promise<Shift> {
    const shift = await this.shiftRepository.findOne({ where: {} });
    if (!shift) throw new NotFoundException('Shift record not found');

    const response = await fetch('https://api.checkbox.ua/api/v1/cashier/signinPinCode', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'X-License-Key': shift.licenseKeyCheckBox,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pin_code: pinCode }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new BadRequestException(error?.detail ?? 'Checkbox API error');
    }

    const data = await response.json();
    shift.tokenCheckBox = `Bearer ${data.access_token}`;
    return this.shiftRepository.save(shift);
  }

  async findOne(): Promise<Shift> {
    const shift = await this.shiftRepository.findOne({ where: {} });
    if (!shift) throw new NotFoundException('Shift record not found');
    return shift;
  }
}
