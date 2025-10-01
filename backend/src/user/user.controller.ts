import { Controller, Get, Param } from "@nestjs/common";
import { UserService } from "./user.service";

@Controller("user-journey")
export class UserController {
  constructor(private readonly service: UserService) {}

  // GET /user-journey/0xabc... → { walletAddress }
  @Get(":wallet")
  async getByWallet(@Param("wallet") wallet: string) {
    return this.service.getStepByWallet(wallet);
  }

}