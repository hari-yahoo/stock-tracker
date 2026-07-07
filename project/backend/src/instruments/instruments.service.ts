import { Injectable, NotFoundException } from '@nestjs/common';
import {
  mapPrismaError,
  normalizeCode,
  normalizeCurrency,
} from '../common/api';
import { PrismaService } from '../database/prisma.service';
import { CreateInstrumentDto, UpdateInstrumentDto } from './instruments.dto';

@Injectable()
export class InstrumentsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.instrument.findMany({
      orderBy: [{ symbol: 'asc' }, { exchange: 'asc' }],
    });
  }

  async get(id: string) {
    const instrument = await this.prisma.instrument.findUnique({
      where: { id },
    });
    if (!instrument) throw new NotFoundException('Instrument not found');
    return instrument;
  }

  async create(dto: CreateInstrumentDto) {
    try {
      return await this.prisma.instrument.create({
        data: {
          symbol: normalizeCode(dto.symbol),
          exchange: normalizeCode(dto.exchange),
          quoteCurrency: normalizeCurrency(dto.quoteCurrency),
          name: dto.name?.trim() || null,
          sector: dto.sector?.trim() || null,
        },
      });
    } catch (error) {
      mapPrismaError(error, 'Instrument');
    }
  }

  async update(id: string, dto: UpdateInstrumentDto) {
    try {
      return await this.prisma.instrument.update({
        where: { id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.sector === undefined ? {} : { sector: dto.sector.trim() }),
        },
      });
    } catch (error) {
      mapPrismaError(error, 'Instrument');
    }
  }
}
