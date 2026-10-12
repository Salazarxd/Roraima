import prisma from "@/lib/prisma";
import { isValidTronAddress } from "@/lib/tron";


export type SystemSettings = {
  appName: string;
  logoUrl: string;
  heroTitle: string;
  heroSubtitle: string;
  tronDepositAddress: string;
  tronHotWalletAddress: string;
  trongridApiKey: string;
  withdrawFeeUsdt: number;
  vipMembershipUsdt: number;
  makerFeeRate: number; // e.g. 0.001 = 0.1%
  supportEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  introVideoEnabled: boolean;
  introVideoDesktopUrl: string;
  introVideoMobileUrl: string;
};

const DEFAULT_SETTINGS: SystemSettings = {
  appName: "Roraima Exchange",
  logoUrl: "/logo-transparent.png",
  heroTitle: "Intercambia USDT de forma segura",
  heroSubtitle: "La plataforma líder en P2P con depósito en garantía.",
  tronDepositAddress: (process.env.TRON_DEPOSIT_ADDRESS ?? "").trim(),
  tronHotWalletAddress: (process.env.TRON_HOT_WALLET_ADDRESS ?? "").trim(),
  trongridApiKey: (process.env.TRONGRID_API_KEY ?? "").trim(),
  withdrawFeeUsdt: Number(process.env.WITHDRAW_FEE_USDT ?? "1"),
  vipMembershipUsdt: 25,
  makerFeeRate: 0.001,
  supportEmail: "soporte@roraimaexchange.com",
  smtpHost: "smtp.gmail.com",
  smtpPort: 465,
  smtpUser: "",
  smtpPass: "",
  introVideoEnabled: true,
  introVideoDesktopUrl: "/videos/presentacion.mp4",
  introVideoMobileUrl: "",
};

let settingsCache: { at: number; data: SystemSettings } | null = null;
const SETTINGS_TTL_MS = 60 * 1000;

export async function getSystemSettings(): Promise<SystemSettings> {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) {
    return settingsCache.data;
  }
  const rows = await prisma.systemsetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  
  const getNumber = (key: string, def: number) => {
    const v = map.get(key);
    if (!v) return def;
    const num = Number(v);
    return Number.isFinite(num) && num >= 0 ? num : def;
  };

  const getBool = (key: string, def: boolean) => {
    const v = map.get(key);
    if (v === undefined || v === null) return def;
    return v === "true" || v === "1";
  };

  const depositAddress = map.get("tronDepositAddress") ?? DEFAULT_SETTINGS.tronDepositAddress;
  const hotWalletAddress = map.get("tronHotWalletAddress") ?? DEFAULT_SETTINGS.tronHotWalletAddress;

  const data: SystemSettings = {
    appName: map.get("appName") ?? DEFAULT_SETTINGS.appName,
    logoUrl: map.get("logoUrl") ?? DEFAULT_SETTINGS.logoUrl,
    heroTitle: map.get("heroTitle") ?? DEFAULT_SETTINGS.heroTitle,
    heroSubtitle: map.get("heroSubtitle") ?? DEFAULT_SETTINGS.heroSubtitle,
    tronDepositAddress: isValidTronAddress(depositAddress) ? depositAddress : "",
    tronHotWalletAddress: isValidTronAddress(hotWalletAddress) ? hotWalletAddress : "",
    trongridApiKey: map.get("trongridApiKey") ?? DEFAULT_SETTINGS.trongridApiKey,
    withdrawFeeUsdt: getNumber("withdrawFeeUsdt", DEFAULT_SETTINGS.withdrawFeeUsdt),
    vipMembershipUsdt: getNumber("vipMembershipUsdt", DEFAULT_SETTINGS.vipMembershipUsdt),
    makerFeeRate: getNumber("makerFeeRate", DEFAULT_SETTINGS.makerFeeRate),
    supportEmail: map.get("supportEmail") ?? DEFAULT_SETTINGS.supportEmail,
    smtpHost: map.get("smtpHost") ?? DEFAULT_SETTINGS.smtpHost,
    smtpPort: getNumber("smtpPort", DEFAULT_SETTINGS.smtpPort),
    smtpUser: map.get("smtpUser") ?? DEFAULT_SETTINGS.smtpUser,
    smtpPass: map.get("smtpPass") ?? DEFAULT_SETTINGS.smtpPass,
    introVideoEnabled: getBool("introVideoEnabled", DEFAULT_SETTINGS.introVideoEnabled),
    introVideoDesktopUrl: map.get("introVideoDesktopUrl") ?? DEFAULT_SETTINGS.introVideoDesktopUrl,
    introVideoMobileUrl: map.get("introVideoMobileUrl") ?? DEFAULT_SETTINGS.introVideoMobileUrl,
  };
  settingsCache = { at: Date.now(), data };
  return data;
}

export async function updateSystemSettings(updates: Partial<SystemSettings>) {
  settingsCache = null;
  const tx = Object.entries(updates)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) =>
      prisma.systemsetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    );
  if (tx.length > 0) {
    await prisma.$transaction(tx);
  }
}
