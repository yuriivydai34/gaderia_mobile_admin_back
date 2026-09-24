import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './account.entity';
import { AccountDocument } from './account-document.entity';
import { AccountDocumentService } from './account-document.service';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Account, AccountDocument])],
  providers: [AccountService, AccountDocumentService],
  controllers: [AccountController],
  exports: [AccountService],
})
export class AccountModule {}
