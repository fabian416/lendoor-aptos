import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ZkMeService } from './zk-me.service';
import { SubmitZkMeDto } from './dto/submit-zk-me.dto';

@Controller('zk-me')
export class ZkMeController {
  constructor(private readonly service: ZkMeService) {}

  /** Frontend calls this to obtain a short-lived access token for the widget. */
  @Post('access-token')
  @HttpCode(200)
  async accessToken() {
    return this.service.getAccessToken();
  }

  /**
   * Frontend calls this right after the widget fires `kycFinished` with `isGrant = true`,
   * passing { walletAddress, programNo, isGrant, widgetPayload? }.
   */
  @Post('verify')
  @HttpCode(200)
  async verify(@Body() dto: SubmitZkMeDto) {
    return this.service.submitAndVerify(dto);
  }
}
