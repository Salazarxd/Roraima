import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log("--- Starting Simulation ---")

  // 1. Create Users
  const user1 = await prisma.user.create({
    data: {
      email: 'user1@example.com',
      name: 'User One',
      kycStatus: 'VERIFIED',
      role: 'USER',
      wallet: {
        create: {
          currency: 'USDT',
          balance: 0,
        }
      }
    },
    include: { wallet: true }
  })

  const user2 = await prisma.user.create({
    data: {
      email: 'user2@example.com',
      name: 'User Two',
      kycStatus: 'VERIFIED',
      role: 'USER',
      wallet: {
        create: {
          currency: 'USDT',
          balance: 0,
        }
      }
    },
    include: { wallet: true }
  })

  const support = await prisma.user.create({
    data: {
      email: 'support@example.com',
      name: 'Support Agent',
      role: 'SUPPORT',
    }
  })

  const admin = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      name: 'Admin Boss',
      role: 'ADMIN',
    }
  })
  
  console.log("Users created:", { user1: user1.id, user2: user2.id, support: support.id, admin: admin.id })

  // 2. Deposit Funds for User 1 (Simulate Admin Approval of Deposit)
  console.log("Depositing 100 USDT to User 1")
  await prisma.wallet.updateMany({
    where: { userId: user1.id, currency: 'USDT' },
    data: { balance: { increment: 100 } }
  })
  
  await prisma.wallettx.create({
    data: {
      userId: user1.id,
      currency: 'USDT',
      type: 'DEPOSIT',
      amount: 100,
      note: 'Admin approved deposit',
    }
  })

  // 3. User 1 creates P2P Sell Order (1 USDT = 40 VES)
  console.log("User 1 creates P2P Sell Order (50 USDT)")
  const order = await prisma.p2porder.create({
    data: {
      userId: user1.id,
      type: 'SELL',
      amount: 50,
      price: 40.0,
      maxAmount: 50,
      minAmount: 10,
      methods: 'Pago Móvil',
    }
  })
  
  // Note: in actual implementation, does creating an order freeze funds? 
  // We need to check actions/p2p.ts for exactly what it does.
  // Let's do that in a real test by calling the actual action logic, but we don't have token.
  
  console.log("Simulation setup complete.")
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect())
