const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Admin user ─────────────────────────────────
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const adminHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      displayName: 'Admin',
      passwordHash: adminHash,
      lastSetPassword: adminPassword,
      mustChangePass: false,
      isAdmin: true,
      balance: 10000,
    },
  });
  console.log('✅ Admin created:', admin.username);

  // ── Admin initial deposit transaction ──────────
  const existingDeposit = await prisma.transaction.findFirst({
    where: { userId: admin.id, type: 'DEPOSIT' },
  });
  if (!existingDeposit) {
    await prisma.transaction.create({
      data: {
        userId: admin.id,
        type: 'DEPOSIT',
        amount: 10000,
        description: 'Saldo iniziale admin',
      },
    });
  }

  // ── Default configs ────────────────────────────
  const configs = [
    { key: 'market_margin', value: '0.05' },
    { key: 'initial_balance', value: '1000' },
    { key: 'site_name', value: 'Chill No Presura' },
  ];
  for (const c of configs) {
    await prisma.config.upsert({
      where: { key: c.key },
      update: {},
      create: c,
    });
  }
  console.log('✅ Config defaults set');

  console.log('🎉 Seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
