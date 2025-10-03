import { Controller, Get, Param, Post, Body, BadRequestException } from "@nestjs/common";
import { UserService } from "./user.service";

@Controller("user")
export class UserController {
  constructor(private readonly service: UserService) {}

  @Get(":wallet")
  async getByWallet(@Param("wallet") wallet: string) {
    return this.service.getStepByWallet(wallet);
  }

  // POST /user/0xabc.../mint  { amount: "100.5", decimals?: 6 }
  @Post(":wallet/mint")
  async mintToWallet(
    @Param("wallet") wallet: string,
    @Body() dto: { amount: string; decimals?: number }
  ) {
    if (!dto?.amount?.trim()) {
      throw new BadRequestException("amount is required (human units, e.g. '100.5').");
    }
    return this.service.mintFaToWallet(wallet, dto.amount, dto.decimals);
  }
}
