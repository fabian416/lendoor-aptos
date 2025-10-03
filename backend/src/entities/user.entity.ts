import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
  CreateDateColumn,
  UpdateDateColumn,
  Check,
} from 'typeorm';

const lowercase = {
  to: (v?: string | null) => (v == null ? null : v.toLowerCase()),
  from: (v?: string | null) => v ?? null,
};

export const decimalNumber = {
  to: (v?: number | null) => (v == null ? null : v.toString()),
  from: (v: string | null) => (v == null ? null : Number(v)),
};

@Entity({ name: 'users' })
@Unique('uq_user_document', ['documentType', 'documentNumber'])
@Index('idx_user_wallet', ['walletAddress'], { unique: true })
@Check(`score >= 0 AND score <= 1000`)
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Wallet address (lowercase). Unique. */
  @Column({ type: 'text', transformer: lowercase })
  walletAddress!: string;

  // --- PII (seguirán NULL hasta que actives Disclosures/MeID) ---
  @Column({ type: 'text', nullable: true }) firstName?: string | null;
  @Column({ type: 'text', nullable: true }) lastName?: string | null;
  @Column({ type: 'text', nullable: true }) birthdate?: string | null;      // "1996-04-12"
  @Column({ type: 'varchar', length: 2, nullable: true }) nationality?: string | null; // ISO 3166-1 alpha-2
  @Column({ type: 'text', nullable: true }) documentType?: string | null;   // DNI, PASSPORT, ...
  @Column({ type: 'text', nullable: true }) documentNumber?: string | null;

  // --- Business fields ---
  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
    default: null,
    transformer: decimalNumber,
  })
  creditLimit?: number | null;

  @Column({ type: 'float', nullable: true, default: null })  teleporterValue?: number | null;
  @Column({ type: 'integer', nullable: true, default: null }) timetravelValue?: number | null;
  @Column({ type: 'integer', nullable: true, default: null }) score?: number | null;

  // --- KYC status (non-PII) ---
  @Column({ type: 'text', nullable: true }) kycProvider?: string | null;

  @Index('idx_user_kyc_program')
  @Column({ type: 'text', nullable: true })
  kycProgramNo?: string | null;

  @Column({ type: 'boolean', default: false })
  kycGranted!: boolean;

  /** Usa 'datetime' para SQLite; guarda UTC (Date) */
  @Column({ type: 'datetime', nullable: true })
  kycVerifiedAt?: Date | null;

  @Column({ type: 'text', nullable: true }) zkmeId?: string | null;
  @Column({ type: 'text', nullable: true }) zkmeNetworkId?: string | null;

  /** 'json' funciona en PG; en SQLite TypeORM guarda como TEXT. */
  @Column({ type: 'json', nullable: true })
  kycFlags?: Record<string, any> | null;

  @Column({ type: 'json', nullable: true })
  kycRaw?: Record<string, any> | null;

  // Dejá que TypeORM infiera para máxima portabilidad
  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
