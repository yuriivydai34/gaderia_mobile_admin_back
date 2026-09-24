import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { AccountService } from './account.service';
import { AccountDocumentService } from './account-document.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('accounts')
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly documentService: AccountDocumentService,
  ) {}

  @Get()
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search?: string,
  ) {
    return this.accountService.findAll(Number(page), Number(limit), search);
  }

  @Get(':id/documents')
  findDocuments(@Param('id', ParseIntPipe) id: number) {
    return this.documentService.findByAccount(id);
  }

  // Any document, not just the caller's own: unlike app-server's
  // /account/documents/download, the guard here is the admin role.
  @Get('documents/:docId/download')
  async downloadDocument(@Param('docId', ParseIntPipe) docId: number): Promise<StreamableFile> {
    const file = await this.documentService.openFile(docId);
    return new StreamableFile(file.stream, {
      type: file.mime_type,
      // filename* carries the Cyrillic name; filename is the ASCII fallback.
      disposition: `attachment; filename="document-${docId}${extensionOf(file.file_name)}"; `
        + `filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
    });
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.accountService.updateProfile(id, body);
  }
}

function extensionOf(name: string): string {
  const match = /\.[A-Za-z0-9]{1,8}$/.exec(name);
  return match ? match[0] : '';
}
