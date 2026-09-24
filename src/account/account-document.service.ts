import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createReadStream, ReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import * as path from 'node:path';
import { AccountDocument } from './account-document.entity';

// stored_name is internal: it is the path on disk, not something to show.
const PUBLIC_FIELDS = [
  'id', 'account_id', 'file_name', 'mime_type', 'size', 'createdAt',
] as const;

export type DocumentFile = {
  stream: ReadStream;
  file_name: string;
  mime_type: string;
};

@Injectable()
export class AccountDocumentService {
  constructor(
    @InjectRepository(AccountDocument)
    private readonly documentRepository: Repository<AccountDocument>,
  ) {}

  findByAccount(accountId: number): Promise<Omit<AccountDocument, 'stored_name' | 'updatedAt'>[]> {
    return this.documentRepository.find({
      where: { account_id: accountId },
      select: [...PUBLIC_FIELDS],
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  /**
   * The files are on app-server's disk, not in the database. DOCUMENTS_DIR is
   * that folder (app-server's documents/account), so this only works where
   * the admin can read it, i.e. on the same machine.
   */
  async openFile(id: number): Promise<DocumentFile> {
    const dir = process.env.DOCUMENTS_DIR;
    if (!dir) {
      throw new ServiceUnavailableException('DOCUMENTS_DIR is not configured');
    }

    const doc = await this.documentRepository.findOne({ where: { id } });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);

    // basename: stored_name is a uuid app-server generated, but a row is not
    // a reason to read an arbitrary path.
    const filePath = path.join(dir, path.basename(doc.stored_name));
    try {
      await access(filePath);
    } catch {
      throw new NotFoundException(`File of document ${id} is missing on disk`);
    }

    return {
      stream: createReadStream(filePath),
      file_name: doc.file_name,
      mime_type: doc.mime_type ?? 'application/octet-stream',
    };
  }
}
