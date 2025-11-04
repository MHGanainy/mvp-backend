import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding credit packages...');

  const packages = [
    {
      name: 'Starter Pack',
      description: 'Perfect for trying out voice simulations',
      credits: 100,
      priceInCents: 1000, // £10.00
      isActive: true,
    },
    {
      name: 'Value Pack',
      description: 'Best value - Most popular choice',
      credits: 500,
      priceInCents: 4500, // £45.00 (10% savings)
      isActive: true,
    },
    {
      name: 'Premium Pack',
      description: 'Maximum savings for power users',
      credits: 1000,
      priceInCents: 8000, // £80.00 (20% savings)
      isActive: true,
    },
  ];

  for (const pkg of packages) {
    // Check if package already exists
    const existing = await prisma.creditPackage.findFirst({
      where: { name: pkg.name },
    });

    if (existing) {
      console.log(
        `⏩ ${pkg.name} already exists - skipping`
      );
      continue;
    }

    const created = await prisma.creditPackage.create({
      data: pkg,
    });
    console.log(
      `✓ ${created.name}: ${created.credits} credits for £${(created.priceInCents / 100).toFixed(2)}`
    );
  }

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
