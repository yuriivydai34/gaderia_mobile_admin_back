import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './payment.entity';
import * as XLSX from 'xlsx';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
  ) {}

  async findAll(page: number, limit: number, sortBy: string, sortOrder: 'ASC' | 'DESC'): Promise<{ data: Payment[]; total: number; page: number; limit: number }> {
    const columns = this.paymentRepository.metadata.columns.map(c => c.propertyName);
    const orderField = columns.includes(sortBy) ? sortBy : 'createdAt';
    const [data, total] = await this.paymentRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { [orderField]: sortOrder },
    });
    return { data, total, page, limit };
  }

  async findOne(id: number): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  create(data: Partial<Payment>): Promise<Payment> {
    const payment = this.paymentRepository.create(data);
    return this.paymentRepository.save(payment);
  }

  async update(id: number, data: Partial<Payment>): Promise<Payment> {
    await this.paymentRepository.update(id, data);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const payment = await this.findOne(id);
    await this.paymentRepository.remove(payment);
  }

  async generateReport(): Promise<string> {
    const payments = await this.paymentRepository.find({ order: { createdAt: 'DESC' } });

    const rows = payments.map(p => ({
      ID: p.id,
      'Order ID': p.order_id,
      'Full Name': p.full_name,
      Email: p.email,
      Number: p.number,
      Amount: p.amount,
      Currency: p.currency,
      Status: p.status,
      'Payment Method': p.payment_method,
      'Type Delivery': p.type_delivery,
      TTN: p.ttn,
      'Is Delivery Payment': p.is_delivery_payment,
      'Delivery Payment': p.delivery_payment,
      'Is Delivery Address': p.is_delivery_address,
      'Delivery Address': p.delivery_address,
      Comment: p.comment,
      'Created At': p.createdAt,
      'Updated At': p.updatedAt,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payments');

    const staticDir = join(__dirname, '..', '..', 'static');
    if (!existsSync(staticDir)) mkdirSync(staticDir, { recursive: true });

    const filename = `payments_${Date.now()}.xlsx`;
    XLSX.writeFile(wb, join(staticDir, filename));

    return `/static/${filename}`;
  }
}
