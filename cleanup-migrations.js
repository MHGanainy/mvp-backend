const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanup() {
  try {
    // Delete orphaned migration records
    const result = await prisma.$executeRaw`
      DELETE FROM _prisma_migrations 
      WHERE migration_name IN (
        '20250918122015_initial',
        '20250920113010_add_minutes_billed_to_simulation_attempts', 
        '20250922110711_add_provider_keys'
      )
    `;
    
    console.log(`Cleaned up ${result} orphaned migration records`);
    
    // Show remaining migrations
    const remaining = await prisma.$queryRaw`
      SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at
    `;
    
    console.log('Remaining migrations:', remaining);
    
  } catch (error) {
    console.error('Error cleaning up migrations:', error);
  }
}

cleanup()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
