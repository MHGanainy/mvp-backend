const { PrismaClient } = require('@prisma/client');

// Create a new PrismaClient instance with direct connection
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:IBdHmFwKDoDzMYEyVyhuYBwgdaWayUiJ@caboose.proxy.rlwy.net:55655/railway'
    }
  }
});

// Override the datasource
prisma.$connect();

async function cleanup() {
  try {
    // Use executeRawUnsafe for direct SQL
    const existing = await prisma.$queryRawUnsafe(
      'SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at'
    );
    
    console.log('Existing migrations on Railway:', existing);
    
    if (existing.length === 0) {
      console.log('No migrations found in Railway database');
      return;
    }
    
    // Delete orphaned migrations
    const result = await prisma.$executeRawUnsafe(`
      DELETE FROM _prisma_migrations 
      WHERE migration_name IN (
        '20250918122015_initial',
        '20250920113010_add_minutes_billed_to_simulation_attempts', 
        '20250922110711_add_provider_keys'
      )
    `);
    
    console.log(`Cleaned up ${result} orphaned migration records`);
    
    // Show remaining
    const remaining = await prisma.$queryRawUnsafe(
      'SELECT migration_name FROM _prisma_migrations'
    );
    console.log('Remaining migrations:', remaining);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

cleanup()
  .catch(console.error)
  .finally(() => prisma.$disconnect());