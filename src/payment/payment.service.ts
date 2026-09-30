import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Payment } from './payment.entity';
import * as XLSX from 'xlsx';
import { kyivDayRange } from './kyiv-day';

export const ORDER_STATUSES = ['WAITING', 'WORK', 'CANCELED', 'COMPLETED'] as const;

// A page is for looking at, not for dumping the table.
const MAX_LIMIT = 100;

/**
 * What the panel may change in an order: the tracking number and the status.
 * The amount, the items and the owner come from app-server at checkout and
 * are what LiqPay and 1C were given; rewriting them here would only make the
 * order disagree with both.
 */
export function normalizeOrderUpdate(body: Record<string, unknown>): Partial<Pick<Payment, 'ttn' | 'status'>> {
  body = body ?? {};
  const out: Partial<Pick<Payment, 'ttn' | 'status'>> = {};
  if ('ttn' in body) {
    const ttn = String(body.ttn ?? '').trim();
    out.ttn = ttn === '' ? null : ttn;
  }
  if ('status' in body) {
    if (!ORDER_STATUSES.includes(body.status as (typeof ORDER_STATUSES)[number])) {
      throw new BadRequestException(`Статус: ${ORDER_STATUSES.join(', ')}`);
    }
    out.status = body.status as string;
  }
  return out;
}

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
  ) {}

  async findAll(page: number, limit: number, sortBy: string, sortOrder: 'ASC' | 'DESC', status?: string): Promise<{ data: Payment[]; total: number; page: number; limit: number }> {
    const columns = this.paymentRepository.metadata.columns.map(c => c.propertyName);
    const orderField = columns.includes(sortBy) ? sortBy : 'updatedAt';
    // Anything but ASC/DESC used to reach TypeORM and come back as a 500.
    const direction = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    page = Number.isInteger(page) && page > 0 ? page : 1;
    limit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_LIMIT) : 10;
    const [data, total] = await this.paymentRepository.findAndCount({
      where: status ? { status } : {},
      skip: (page - 1) * limit,
      take: limit,
      order: { [orderField]: direction },
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

  async update(id: number, body: Record<string, unknown>): Promise<Payment> {
    const patch = normalizeOrderUpdate(body);
    if (Object.keys(patch).length > 0) await this.paymentRepository.update(id, patch);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const payment = await this.findOne(id);
    await this.paymentRepository.remove(payment);
  }

  /**
   * The day's orders as an .xlsx file, returned to the caller rather than
   * saved: the report holds clients' names, phones and addresses, and files
   * under the public /static folder could be fetched by anyone who guessed
   * the name.
   */
  async generateReport(date: string): Promise<Buffer> {
    const { start, end } = kyivDayRange(date);

    const payments = await this.paymentRepository.find({
      where: { createdAt: Between(start, end) },
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

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
