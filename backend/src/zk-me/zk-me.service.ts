import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { SubmitZkMeDto } from './dto/submit-zk-me.dto';
import { giveCreditScoreAndLimit } from 'src/config/contractConfig';

// Defaults for your business logic
const DEFAULT_SCORE = 120;
const DEFAULT_CREDIT_LIMIT_USDC = 1000;

type TokenResp =
  | { code: number; data?: { accessToken?: string }; msg?: string; timestamp?: number }
  | undefined;

/**
 * Service that:
 *  - Issues short-lived access tokens for the zkMe widget (server-side, API key never leaves).
 *  - Persists the result of the widget grant (non-PII).
 *  - Optionally fetches non-PII flags from zkMe OpenAPI (age/sanction/location/timestamps).
 */
@Injectable()
export class ZkMeService {
  private readonly logger = new Logger(ZkMeService.name);

  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {}

  /* -------------------------------------------------------------------------- */
  /*                                 ACCESS TOKEN                               */
  /* -------------------------------------------------------------------------- */

  // Simple in-memory cache so the widget doesn't hammer this endpoint
  private tokenCache: { token: string; expiresAt: number } | null = null;

  /**
   * Issue a short-lived zkMe access token.
   * NOTE: Ensure your Node runtime provides global `fetch` (Node 18+). If not, install a fetch polyfill.
   */
  async getAccessToken() {
    const appId = process.env.ZK_ME_APP_ID!;
    const apiKey = process.env.ZK_ME_API_KEY!;
    // 0 = Email/SSO first, 1 = App/QR first (ask zkMe to enable “App-only” if you want to remove SSO UI)
    const apiModePermission = Number(process.env.ZK_ME_API_MODE_PERMISSION ?? 1);
    const lv = Number(process.env.ZK_ME_LV ?? 1);

    if (!appId || !apiKey) {
      this.logger.error('Missing ZK_ME_APP_ID or ZK_ME_API_KEY');
      throw new BadRequestException('Server misconfigured: missing zkMe credentials');
    }

    // Serve from cache if still valid (tokens are short-lived).
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now) {
      return { accessToken: this.tokenCache.token };
    }

    const body = { appId, apiKey, apiModePermission, lv };
    // Debug log to confirm you're sending App/QR-first

    const r = await fetch('https://nest-api.zk.me/api/token/get', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await r.text();
    let json: TokenResp = undefined;
    try { json = JSON.parse(text); } catch {
      this.logger.error(`zkMe token: non-JSON response: ${text.slice(0, 400)}`);
    }

    if (!r.ok) {
      this.logger.error(`zkMe token HTTP ${r.status}: ${text.slice(0, 400)}`);
      throw new BadRequestException('zkMe token HTTP error');
    }
    if (!json || json.code !== 80000000 || !json.data?.accessToken) {
      this.logger.error(`zkMe token code error: ${JSON.stringify(json).slice(0, 400)}`);
      throw new BadRequestException(`zkMe token error: code=${json?.code ?? 'unknown'}`);
    }

    const token = json.data.accessToken!;
    // ~55s TTL is safe; set to 0 while debugging to avoid stale mode
    this.tokenCache = { token, expiresAt: Date.now() + 55_000 };
    return { accessToken: token };
  }

  /* -------------------------------------------------------------------------- */
  /*                                 VERIFY FLOW                                */
  /* -------------------------------------------------------------------------- */

  private normalizeWallet(addr: string) {
    return addr.trim().toLowerCase();
  }

  /**
   * Called by the frontend after widget `kycFinished`.
   * We do not set PII here; when Disclosures/MeID is enabled, map those fields explicitly.
   */
  async submitAndVerify(dto: SubmitZkMeDto) {
    const wallet = this.normalizeWallet(dto.walletAddress);

    // Require programNo and grant
    if (!dto.programNo?.trim()) throw new BadRequestException('Missing programNo');
    if (!dto.isGrant) throw new BadRequestException('KYC not granted');

    // Upsert user by wallet
    let user = await this.userRepo.findOne({ where: { walletAddress: wallet } });
    if (!user) user = this.userRepo.create({ walletAddress: wallet });
    console.log(wallet);  
    // Optionally fetch non-PII compliance flags from zkMe OpenAPI for this program
    let flags: any = null;
    try {
      flags = await this.fetchKycFlagsFromZkMe(wallet, dto.programNo);
    } catch (e) {
      this.logger.warn(`Could not fetch KYC flags: ${(e as any)?.message ?? e}`);
    }

    // Mark as verified according to your business rules (no fake PII)
    user.score = DEFAULT_SCORE;
    user.creditLimit = DEFAULT_CREDIT_LIMIT_USDC;

    // Persist KYC state
    user.kycProvider   = 'zkme';
    user.kycProgramNo  = dto.programNo;
    user.kycGranted    = true;
    user.kycVerifiedAt = new Date();
    user.kycFlags      = flags ?? null;
    user.kycRaw        = dto.widgetPayload ?? null;

    await this.userRepo.save(user);

    // On-chain side effect (only after grant)
    const result = await giveCreditScoreAndLimit(wallet);
    if (result !== 200) throw new BadRequestException('Setting line failed');

    return {
      verified: true,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        score: user.score,
        creditLimit: user.creditLimit ?? null,
        kycProgramNo: user.kycProgramNo,
        kycFlags: user.kycFlags,
      },
    };
  }

  /**
   * Backend → zkMe OpenAPI to get non-PII flags (age/sanction/location/timestamps).
   * Ask zkMe to enable API access for your merchant + program, then replace the calls below.
   * For convenience, `zkmeCall` automatically injects appId/apiKey into the request body.
   */
  private async fetchKycFlagsFromZkMe(wallet: string, programNo: string) {
    // PSEUDOCODE — enable and swap with your real endpoints/fields
    // 1) Resolve zkme user by wallet+program:
    // const userList = await this.zkmeCall('/merchant/user/list', { wallet, programNo });
    // const { zkmeId, networkId } = pickYourUser(userList);
    //
    // 2) Get KYC summary (non-PII):
    // const info = await this.zkmeCall('/merchant/kyc/info', { zkmeId, networkId, programNo });
    //
    // return {
    //   zkmeId,
    //   ageOk: info?.age === 'pass',
    //   sanctionOk: info?.sanction === 'pass',
    //   location: info?.location ?? null,
    //   mintTime: info?.mint_time ?? null,
    // };

    return null;
  }

  /**
   * Helper that posts to zkMe’s merchant API and injects appId/apiKey automatically.
   * Replace `https://nest-api.zk.me` with the base your zkMe contact provides if different.
   */
  private async zkmeCall(path: string, payload: Record<string, any>) {
    const appId = process.env.ZK_ME_APP_ID!;
    const apiKey = process.env.ZK_ME_API_KEY!;
    if (!appId || !apiKey) {
      throw new Error('Missing appId/apiKey for zkMe OpenAPI call');
    }

    const r = await fetch(`https://nest-api.zk.me${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId, apiKey, ...payload }),
    });

    const text = await r.text();
    try {
      const json = JSON.parse(text);
      if (!r.ok || json?.code !== 80000000) {
        throw new Error(`zkMe error ${r.status}: ${text}`);
      }
      return json?.data ?? json;
    } catch {
      throw new Error(`zkMe non-JSON: ${text.slice(0, 200)}`);
    }
  }
}
