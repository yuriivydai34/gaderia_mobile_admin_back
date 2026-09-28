import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AccountService } from './account.service';
import { Account } from './account.entity';

// What editing a client in the panel can and cannot write.
describe('AccountService.updateProfile', () => {
  let repo: jest.Mocked<Pick<Repository<Account>, 'update' | 'findOne'>>;
  let service: AccountService;

  beforeEach(() => {
    repo = {
      update: jest.fn().mockResolvedValue({}),
      findOne: jest.fn().mockResolvedValue({ id: 5 } as Account),
    };
    service = new AccountService(repo as unknown as Repository<Account>);
  });

  const written = () => repo.update.mock.calls[0][1];

  it('never writes the password, the confirmation code or the id, whatever is sent', async () => {
    await service.updateProfile(5, {
      full_name: 'Ivan',
      password: 'hacked',
      email_confirmation_code: 1234,
      is_email_confirmation: true,
      id: 99,
    });

    expect(repo.update).toHaveBeenCalledWith(5, { full_name: 'Ivan' });
  });

  it('a cleared field becomes null; email is trimmed and lower-cased', async () => {
    await service.updateProfile(5, { region: '', email: '  Ivan@X.com ' });

    expect(written()).toEqual({ region: null, email: 'ivan@x.com' });
  });

  // A company code is text: numbers would lose leading zeros.
  it('keeps code_company as text', async () => {
    await service.updateProfile(5, { code_company: '00123456' });

    expect(written()).toEqual({ code_company: '00123456' });
  });

  it('nothing editable sent -> nothing written', async () => {
    await service.updateProfile(5, { password: 'x' });

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('an address another account has -> 409, not 500', async () => {
    repo.update.mockRejectedValue({ driverError: { code: '23505' } });

    await expect(service.updateProfile(5, { email: 'taken@x.com' })).rejects.toThrow(ConflictException);
  });

  it('never returns the password', async () => {
    await service.updateProfile(5, { full_name: 'Ivan' });

    const select = repo.findOne.mock.calls[0][0].select as string[];
    expect(select).not.toContain('password');
  });
});
