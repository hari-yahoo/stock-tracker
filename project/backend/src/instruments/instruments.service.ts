import { Injectable, NotFoundException } from '@nestjs/common';
import {
  mapPrismaError,
  normalizeCode,
  normalizeCurrency,
} from '../common/api';
import { PrismaService } from '../database/prisma.service';
import {
  CreateInstrumentDto,
  SaveIciciSymbolMappingDto,
  UpdateInstrumentDto,
} from './instruments.dto';

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
          instrumentType: dto.instrumentType,
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
          ...(dto.instrumentType === undefined
            ? {}
            : { instrumentType: dto.instrumentType }),
        },
      });
    } catch (error) {
      mapPrismaError(error, 'Instrument');
    }
  }

  listIciciSymbolMappings() {
    return this.prisma.iciciSymbolMapping.findMany({
      orderBy: { iciciSymbol: 'asc' },
    });
  }

  async getSymbol(symbol: string) {
    const normalizedSymbol = normalizeCode(symbol);
    const instrument = await this.prisma.instrument.findFirst({
      where: { symbol: normalizedSymbol },
    });
    if (!instrument) throw new NotFoundException('Instrument not found');
    return instrument;
  }

  async updateSymbol(symbol: string, newSymbol: string) {
    const normalizedSymbol = normalizeCode(symbol);
    const normalizedNewSymbol = normalizeCode(newSymbol);
    return this.prisma.$transaction(async (tx) => {
      const instrument = await tx.instrument.findFirst({
        where: { symbol: normalizedSymbol },
      });
      if (!instrument) throw new NotFoundException('Instrument not found');
      await tx.instrument.update({
        where: { id: instrument.id },
        data: { symbol: normalizedNewSymbol },
      });
      return { updated: true };
    });
  }

  async saveIciciSymbolMapping(dto: SaveIciciSymbolMappingDto) {
    const iciciSymbol = normalizeCode(dto.iciciSymbol);
    try {
      return await this.prisma.iciciSymbolMapping.upsert({
        where: { iciciSymbol },
        create: {
          iciciSymbol,
          nseSymbol: normalizeCode(dto.nseSymbol),
          companyName: dto.companyName?.trim() || null,
        },
        update: {
          nseSymbol: normalizeCode(dto.nseSymbol),
          companyName: dto.companyName?.trim() || null,
        },
      });
    } catch (error) {
      mapPrismaError(error, 'ICICIDirect symbol mapping');
    }
  }

  async deleteIciciSymbolMapping(id: string) {
    try {
      await this.prisma.iciciSymbolMapping.delete({ where: { id } });
      return { deleted: true };
    } catch (error) {
      mapPrismaError(error, 'ICICIDirect symbol mapping');
    }
  }
}
