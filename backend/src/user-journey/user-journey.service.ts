// src/user-journey/user-journey.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UpdateUserJourneyDto } from './dto/update-user-journey.dto';

const DEFAULT_STEP: User['userJourneyStep'] = 'verify_identity';

@Injectable()
export class UserJourneyService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  private normalizeWallet(addr: string) {
    return addr?.trim().toLowerCase();
  }

  private isIdentityVerified(u: Partial<User>): boolean {
    const required = [
      u.firstName,
      u.lastName,
      u.documentNumber,
      u.documentType,
      u.nationality,
    ];
    return required.every((v) => !!(v && String(v).trim().length > 0));
  }

  /** Devuelve el step actual del usuario; si no existe, lo crea en verify_identity */
  async getStepByWallet(walletAddress: string) {
    const wallet = this.normalizeWallet(walletAddress);

    let user = await this.repo.findOne({ where: { walletAddress: wallet } });
    if (!user) {
      user = this.repo.create({
        walletAddress: wallet,
        userJourneyStep: DEFAULT_STEP,
      });
      await this.repo.save(user);
    }

    const isVerified = this.isIdentityVerified(user);

    return {
      walletAddress: user.walletAddress,
      step: user.userJourneyStep,
      isVerified,
    };
  }

  /** Actualiza (o crea) el step del usuario */
  async updateStep(dto: UpdateUserJourneyDto) {
    const wallet = this.normalizeWallet(dto.walletAddress);

    let user = await this.repo.findOne({ where: { walletAddress: wallet } });
    if (!user) {
      user = this.repo.create({
        walletAddress: wallet,
        userJourneyStep: dto.step,
      });
    } else {
      user.userJourneyStep = dto.step;
    }

    await this.repo.save(user);
    return { walletAddress: user.walletAddress, step: user.userJourneyStep };
  }

  /** Solo lee; lanza 404 si no existe y no querés autocrear */
  async getStrict(walletAddress: string) {
    const wallet = this.normalizeWallet(walletAddress);
    const user = await this.repo.findOne({ where: { walletAddress: wallet } });
    if (!user) throw new NotFoundException('User not found');
    return { walletAddress: user.walletAddress, step: user.userJourneyStep };
  }
}
