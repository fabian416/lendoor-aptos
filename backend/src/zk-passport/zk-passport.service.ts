import { Injectable } from '@nestjs/common';
import dbPromise from '../db.connection';
import { User } from '../entities/user.entity';
import { SubmitZkPassportDto } from './dto/submit-zk-passport.dto';

type MappedPassport = Partial<
  Pick<
    User,
    'firstName' | 'lastName' | 'birthdate' | 'nationality' | 'documentType' | 'documentNumber'
  >
>;

const DEFAULT_SCORE = 50;
const DEFAULT_CREDIT_LIMIT_USDC = 15;

@Injectable()
export class ZkPassportService {
  private normalizeWallet(addr: string) {
    return addr.trim().toLowerCase();
  }

  private mapDisclosures(result?: Record<string, any>): MappedPassport {
    if (!result) return {};
    const grab = (k: string) => result?.[k]?.disclose?.result ?? null;
    return {
      firstName: grab('firstname'),
      lastName: grab('lastname'),
      birthdate: grab('birthdate'),
      nationality: grab('nationality'),
      documentType: grab('document_type'),
      documentNumber: grab('document_number'),
    };
  }

  private async serverVerifyProof(proof: unknown): Promise<boolean> {
    // TODO: integrate server-side verification against the provider
    // For now, accept any non-empty proof to unblock development
    return !!proof;
  }

  /** Verifies the proof, maps disclosures, and upserts the user record */
  async submitAndVerify(dto: SubmitZkPassportDto) {
    const wallet = this.normalizeWallet(dto.walletAddress);
    const verified = await this.serverVerifyProof(dto.proof);

    const db = await dbPromise;
    const repo = db.getRepository(User);

    // Upsert user by wallet address
    let user = await repo.findOne({ where: { walletAddress: wallet } });
    if (!user) {
      user = repo.create({ walletAddress: wallet });
    }

    if (verified) {
      // Map disclosed fields from the proof result
      const mapped = this.mapDisclosures(dto.result);
      Object.assign(user, mapped);

      // Assign initial score and credit limit upon successful verification
      user.score = DEFAULT_SCORE;
      user.creditLimit = DEFAULT_CREDIT_LIMIT_USDC;

      // Optionally advance the user journey step here if needed
      // user.userJourneyStep = 'use_teleporter';

      await repo.save(user);
    }

    return {
      verified,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        firstName: user.firstName,
        lastName: user.lastName,
        birthdate: user.birthdate,
        nationality: user.nationality,
        documentType: user.documentType,
        documentNumber: user.documentNumber,
        userJourneyStep: user.userJourneyStep,
        score: user.score,
        creditLimit: user.creditLimit,
      },
    };
  }
}
