import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class UserService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  private normalizeWallet(addr: string) {
    return addr?.trim().toLowerCase();
  }

  private allRequiredPresent(u: Partial<User>): boolean {
    const req = [u.firstName, u.lastName, u.birthdate, u.nationality, u.documentType, u.documentNumber];
    return req.every(v => !!(v && String(v).trim().length > 0));
  }

  async getStepByWallet(walletAddress: string) {
    const wallet = this.normalizeWallet(walletAddress);

    let user = await this.repo.findOne({ where: { walletAddress: wallet } });
    if (!user) {
      user = this.repo.create({ walletAddress: wallet });
      await this.repo.save(user);
    }

    const isVerified = Boolean(user.kycGranted || user.kycVerifiedAt) || this.allRequiredPresent(user);

    return {
      walletAddress: user.walletAddress,
      isVerified,
      creditLimit: user.creditLimit ?? null,
    };
  }

  async getStrict(walletAddress: string) {
    const wallet = this.normalizeWallet(walletAddress);
    const user = await this.repo.findOne({ where: { walletAddress: wallet } });
    if (!user) throw new NotFoundException('User not found');
    return { walletAddress: user.walletAddress };
  }
}
