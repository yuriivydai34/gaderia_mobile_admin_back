import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AccountModule } from './account/account.module';
import { Account } from './account/account.entity';
import { PaymentModule } from './payment/payment.module';
import { Payment } from './payment/payment.entity';
import { CatalogModule } from './catalog/catalog.module';
import { Catalog } from './catalog/catalog.entity';
import { ShiftModule } from './shift/shift.module';
import { Shift } from './shift/shift.entity';
import { CustomerModule } from './customer/customer.module';
import { Customer } from './customer/customer.entity';
import { WooModule } from './integration/woocommerce/woo.module';
import { IntegrationState } from './integration/woocommerce/integration-state.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'your_database_name',
      entities: [Account, Payment, Catalog, Shift, Customer, IntegrationState],
      synchronize: false,
    }),
    AuthModule,
    AccountModule,
    PaymentModule,
    CatalogModule,
    ShiftModule,
    CustomerModule,
    WooModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
