// Mock server-only for standalone CLI script
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
} as any;

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  const { getOrCreateUserDepositAddress } = await import("../src/lib/hd-wallet");
  const users = await prisma.user.findMany({
    where: { role: { not: "SYSTEM" } },
  });

  console.log(`Verificando y asignando billeteras para ${users.length} usuarios...`);

  for (const u of users) {
    // 1. Asignar dirección HD de TRON si no tiene
    const res = await getOrCreateUserDepositAddress(u.id, "TRC20", "USDT");
    console.log(`- ${u.email}: Dirección TRON -> ${res.address} (${res.isNew ? "NUEVA ASIGNADA" : "YA TENÍA"})`);

    // 2. Garantizar que tenga Wallet para USDT y USDC
    const [usdt, usdc] = await Promise.all([
      prisma.wallet.findFirst({ where: { userId: u.id, currency: "USDT" } }),
      prisma.wallet.findFirst({ where: { userId: u.id, currency: "USDC" } }),
    ]);

    if (!usdt) {
      await prisma.wallet.create({ data: { userId: u.id, currency: "USDT", balance: 0.0 } });
      console.log(`  + Creada wallet USDT`);
    }
    if (!usdc) {
      await prisma.wallet.create({ data: { userId: u.id, currency: "USDC", balance: 0.0 } });
      console.log(`  + Creada wallet USDC`);
    }
  }

  const totalAddresses = await prisma.userdepositaddress.count();
  console.log(`\n¡Listo! Total de direcciones únicas en el exchange: ${totalAddresses}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
