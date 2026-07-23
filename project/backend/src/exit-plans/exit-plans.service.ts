import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExitPlanStatus, Prisma } from '@prisma/client';
import {
  decimalOutput,
  mapPrismaError,
  nonNegativeDecimalInput,
  parseDate,
} from '../common/api';
import { PrismaService } from '../database/prisma.service';
import { CreateExitPlanDto, UpdateExitPlanDto } from './exit-plans.dto';

const planInclude = {
  instrument: true,
} satisfies Prisma.StockExitPlanInclude;

type PlanResult = Prisma.StockExitPlanGetPayload<{
  include: typeof planInclude;
}>;

function presentPlan(plan: PlanResult) {
  return {
    ...plan,
    targetPriceMicros: undefined,
    targetPrice: decimalOutput(plan.targetPriceMicros),
  };
}

@Injectable()
export class ExitPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(status?: ExitPlanStatus) {
    const plans = await this.prisma.stockExitPlan.findMany({
      where: { status },
      include: planInclude,
      orderBy: [{ targetDate: 'asc' }, { instrument: { symbol: 'asc' } }],
    });
    return plans.map(presentPlan);
  }

  async get(id: string) {
    const plan = await this.prisma.stockExitPlan.findUnique({
      where: { id },
      include: planInclude,
    });
    if (!plan) throw new NotFoundException('Exit plan not found');
    return presentPlan(plan);
  }

  async create(dto: CreateExitPlanDto) {
    try {
      const plan = await this.prisma.stockExitPlan.create({
        data: {
          instrumentId: dto.instrumentId,
          targetPriceMicros: nonNegativeDecimalInput(
            dto.targetPrice,
            'targetPrice',
          ),
          targetDate: parseDate(dto.targetDate, 'targetDate'),
          rationale: dto.rationale.trim(),
        },
        include: planInclude,
      });
      return presentPlan(plan);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Foreign key constraint')
      ) {
        throw new ConflictException(error.message);
      }
      mapPrismaError(error, 'Exit plan');
    }
  }

  async update(id: string, dto: UpdateExitPlanDto) {
    try {
      const plan = await this.prisma.stockExitPlan.update({
        where: { id },
        data: {
          ...(dto.targetPrice === undefined
            ? {}
            : {
                targetPriceMicros: nonNegativeDecimalInput(
                  dto.targetPrice,
                  'targetPrice',
                ),
              }),
          ...(dto.targetDate === undefined
            ? {}
            : { targetDate: parseDate(dto.targetDate, 'targetDate') }),
          ...(dto.rationale === undefined
            ? {}
            : { rationale: dto.rationale.trim() }),
          ...(dto.status === undefined ? {} : { status: dto.status }),
        },
        include: planInclude,
      });
      return presentPlan(plan);
    } catch (error) {
      mapPrismaError(error, 'Exit plan');
    }
  }

  cancel(id: string) {
    return this.update(id, { status: ExitPlanStatus.CANCELLED });
  }
}
