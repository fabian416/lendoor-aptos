import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ZkMeService } from './zk-me.service';
import { SubmitZkMeDto } from './dto/submit-zk-me.dto';

@Controller('zkme')
export class ZkMeController {
  constructor(private readonly service: ZkMeService) {}

  @Post('verify')
  @HttpCode(200)
  async verify(@Body() dto: SubmitZkMeDto) {
    return this.service.submitAndVerify(dto);
  }
}
