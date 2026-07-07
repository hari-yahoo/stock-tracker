import { Injectable, NotFoundException } from '@nestjs/common';
import { normalizeCurrency, mapPrismaError } from '../common/api';
import { PrismaService } from '../database/prisma.service';
import { CreateAccountDto, UpdateAccountDto } from './accounts.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.account.findMany({ orderBy: { name: 'asc' } });
  }

  async get(id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async create(dto: CreateAccountDto) {
    try {
      return await this.prisma.account.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          reportingCurrency: normalizeCurrency(dto.reportingCurrency ?? 'INR'),
        },
      });
    } catch (error) {
      mapPrismaError(error, 'Account');
    }
  }

  async update(id: string, dto: UpdateAccountDto) {
    try {
      return await this.prisma.account.update({
        where: { id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.description === undefined
            ? {}
            : { description: dto.description.trim() || null }),
          ...(dto.reportingCurrency === undefined
            ? {}
            : { reportingCurrency: normalizeCurrency(dto.reportingCurrency) }),
        },
      });
    } catch (error) {
      mapPrismaError(error, 'Account');
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.account.delete({ where: { id } });
    } catch (error) {
      mapPrismaError(error, 'Account');
    }
  }
}
