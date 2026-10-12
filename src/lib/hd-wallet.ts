import "server-only";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync, generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base58 } from "@scure/base";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import prisma from "@/lib/prisma";
import { isValidTronAddress } from "@/lib/tron";

/**
 * Motor de Billeteras Jerárquicas Deterministas (HD Wallet - BIP-44)
 * para Roraima Exchange.
 *
 * Cada usuario tiene su propia dirección de depósito permanente y única
 * derivada de una semilla maestra protegida (Master Seed / Mnemonic).
 *
 * Ruta estándar TRON (SLIP-0044 coin type 195):
 *   m / 44' / 195' / 0' / 0 / {userIndex}
 *
 * En TRON, la misma dirección recibe tanto USDT (TRC-20) como USDC (TRC-20).
 */

const FALLBACK_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

function getMasterSeed(): Uint8Array {
  const mnemonic = (process.env.TRON_HD_MNEMONIC ?? "").trim();
  const seedHex = (process.env.TRON_HD_SEED ?? "").trim();

  if (seedHex && /^[0-9a-fA-F]{128}$/.test(seedHex)) {
    return Buffer.from(seedHex, "hex");
  }

  if (mnemonic && mnemonic.split(/\s+/).length >= 12) {
    return mnemonicToSeedSync(mnemonic);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "CRÍTICO DE SEGURIDAD: TRON_HD_MNEMONIC o TRON_HD_SEED no está configurado en .env. No se permite ejecutar en producción sin semilla maestra privada."
    );
  }

  console.warn(
    "⚠️ ADVERTENCIA DE SEGURIDAD: TRON_HD_MNEMONIC no está configurado. Usando semilla de desarrollo temporal. Configura una semilla en .env para producción."
  );
  return mnemonicToSeedSync(FALLBACK_MNEMONIC);
}

/**
 * Deriva una dirección TRON estándar a partir de un índice secuencial.
 * Ruta: m/44'/195'/0'/0/{index}
 */
export function deriveTronAddress(index: number): { address: string; path: string } {
  const seed = getMasterSeed();
  const root = HDKey.fromMasterSeed(seed);
  const path = `m/44'/195'/0'/0/${Math.max(0, Math.floor(index))}`;
  const child = root.derive(path);

  if (!child.publicKey) {
    throw new Error("No se pudo obtener la clave pública del HD child");
  }

  // Clave pública sin comprimir (65 bytes, prefijo 0x04)
  const uncompressed = secp256k1.Point.fromBytes(child.publicKey).toBytes(false);
  const pubBytes = uncompressed.subarray(1); // 64 bytes (x, y)

  // Keccak-256 de los 64 bytes
  const hash = keccak_256(pubBytes);

  // Dirección TRON: 0x41 + últimos 20 bytes del hash
  const addressBytes = new Uint8Array(21);
  addressBytes[0] = 0x41; // Prefijo TRON mainnet
  addressBytes.set(hash.subarray(12), 1);

  // Checksum: primeros 4 bytes de SHA-256(SHA-256(addressBytes))
  const check = sha256(sha256(addressBytes)).subarray(0, 4);

  // Payload de 25 bytes
  const fullBytes = new Uint8Array(25);
  fullBytes.set(addressBytes, 0);
  fullBytes.set(check, 21);

  const address = base58.encode(fullBytes);

  if (!isValidTronAddress(address)) {
    throw new Error(`Dirección TRON derivada inválida: ${address}`);
  }

  return { address, path };
}

/**
 * Obtiene o crea la dirección de depósito única para un usuario.
 * Garantiza que cada usuario tenga exactamente una dirección asignada por red.
 */
export async function getOrCreateUserDepositAddress(
  userId: string,
  network = "TRC20",
  currency = "USDT"
): Promise<{ address: string; network: string; currency: string; isNew: boolean }> {
  // 1. Buscar si el usuario ya tiene dirección asignada para esta red
  const existing = await prisma.userdepositaddress.findFirst({
    where: { userId, network },
  });

  if (existing) {
    return {
      address: existing.address,
      network: existing.network,
      currency,
      isNew: false,
    };
  }

  // 2. Si no tiene, calcular el siguiente índice de derivación
  const highest = await prisma.userdepositaddress.findFirst({
    orderBy: { derivationIndex: "desc" },
    select: { derivationIndex: true },
  });

  const nextIndex = highest ? highest.derivationIndex + 1 : 1;
  const { address } = deriveTronAddress(nextIndex);

  // 3. Guardar en base de datos de manera atómica
  try {
    const created = await prisma.userdepositaddress.create({
      data: {
        userId,
        network,
        currency,
        address,
        derivationIndex: nextIndex,
      },
    });

    return {
      address: created.address,
      network: created.network,
      currency,
      isNew: true,
    };
  } catch {
    // En caso de concurrencia, reintentar la búsqueda
    const retry = await prisma.userdepositaddress.findFirst({
      where: { userId, network },
    });
    if (retry) {
      return {
        address: retry.address,
        network: retry.network,
        currency,
        isNew: false,
      };
    }
    throw new Error("No se pudo asignar una dirección de depósito única");
  }
}

/** Utilidad para generar una nueva frase mnemónica de 12 palabras para el .env */
export function createNewPlatformMnemonic(): string {
  return generateMnemonic(wordlist, 128);
}
