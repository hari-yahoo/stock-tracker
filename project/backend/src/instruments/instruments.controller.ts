import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CreateInstrumentDto,
  SaveIciciSymbolMappingDto,
  UpdateInstrumentDto,
} from './instruments.dto';
import { InstrumentsService } from './instruments.service';

@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly instruments: InstrumentsService) {}

  @Get()
  list() {
    return this.instruments.list();
  }

  @Get('icici-symbol-mappings')
  listIciciSymbolMappings() {
    return this.instruments.listIciciSymbolMappings();
  }

  @Post('stock-details')
  retrieveSymbol(@Body() { symbol }: { symbol: string }) {
    //return { symbol: symbol };
    return this.instruments.getSymbol(symbol);
  }

  @Post('update-symbol')
  updateSymbol(@Body() dto: { symbol: string; newSymbol: string }) {
    return this.instruments.updateSymbol(dto.symbol, dto.newSymbol);
  }

  @Post('icici-symbol-mappings')
  saveIciciSymbolMapping(@Body() dto: SaveIciciSymbolMappingDto) {
    return this.instruments.saveIciciSymbolMapping(dto);
  }

  @Delete('icici-symbol-mappings/:id')
  deleteIciciSymbolMapping(@Param('id', ParseUUIDPipe) id: string) {
    return this.instruments.deleteIciciSymbolMapping(id);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.instruments.get(id);
  }

  @Post()
  create(@Body() dto: CreateInstrumentDto) {
    return this.instruments.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInstrumentDto,
  ) {
    return this.instruments.update(id, dto);
  }
}
