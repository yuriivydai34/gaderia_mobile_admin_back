import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
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

  async generateReport(date: string): Promise<string> {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const startTs = Math.floor(start.getTime() / 1000);
    const endTs = Math.floor(end.getTime() / 1000);

    const payments = await this.paymentRepository.find({
      where: { createdAt: Between(startTs, endTs) },
      order: { createdAt: 'DESC' },
    });

    type CatalogItem = {
      id?: number;
      count?: number;
      account_id?: number;
      model_catalog?: {
        id?: number;
        header?: string;
        price?: number;
        price_discount?: number;
        is_discount?: boolean;
        measurement?: number;
        type_measurement?: string;
        type_product?: string;
        type_juice?: string;
        type_apple?: string;
        type_vinegar?: string;
        type_packaging?: string;
        shipment_weight?: number;
        shipment_length?: number;
        shipment_width?: number;
        shipment_height?: number;
        picture?: string;
        description?: string;
      };
    };

    const rows = payments.flatMap(p => {
      const items = (p.catalog_list_id as CatalogItem[] | null) ?? [];
      const paymentBase = {
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
      };

      if (items.length === 0) return [{ ...paymentBase }];

      return items.map(item => ({
        ...paymentBase,
        'Item ID': item.id,
        'Item Count': item.count,
        'Product Header': item.model_catalog?.header,
        'Product Price': item.model_catalog?.price,
        'Product Price Discount': item.model_catalog?.price_discount,
        'Is Discount': item.model_catalog?.is_discount,
        'Measurement': item.model_catalog?.measurement,
        'Type Measurement': item.model_catalog?.type_measurement,
        'Type Product': item.model_catalog?.type_product,
        'Type Juice': item.model_catalog?.type_juice,
        'Type Apple': item.model_catalog?.type_apple,
        'Type Vinegar': item.model_catalog?.type_vinegar,
        'Type Packaging': item.model_catalog?.type_packaging,
        'Shipment Weight': item.model_catalog?.shipment_weight,
        'Shipment Length': item.model_catalog?.shipment_length,
        'Shipment Width': item.model_catalog?.shipment_width,
        'Shipment Height': item.model_catalog?.shipment_height,
      }));
    });

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
