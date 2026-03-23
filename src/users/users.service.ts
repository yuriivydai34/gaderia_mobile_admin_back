import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  findAll(): Promise<Omit<User, 'password'>[]> {
    return this.usersRepository.find({ select: ['id', 'name', 'email'] });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  create(name: string, email: string, hashedPassword: string): Promise<User> {
    const user = this.usersRepository.create({
      name,
      email,
      password: hashedPassword,
    });
    return this.usersRepository.save(user);
  }
}
