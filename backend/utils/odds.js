const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MARGIN = parseFloat(process.env.MARKET_MARGIN) || 0.05;
const MIN_ODDS = 1.05;
const MAX_ODDS = 50;

async function recalculateOdds(marketId) {
  const options = await prisma.marketOption.findMany({
    where: { marketId },
  });

  const totalPool = options.reduce((sum, o) => sum + o.totalStaked, 0);

  if (totalPool === 0) return options;

  const updates = options.map((option) => {
    let newOdds;
    if (option.totalStaked === 0) {
      newOdds = MAX_ODDS;
    } else {
      newOdds = (totalPool * (1 - MARGIN)) / option.totalStaked;
    }
    newOdds = Math.max(MIN_ODDS, Math.min(MAX_ODDS, newOdds));
    newOdds = Math.round(newOdds * 100) / 100;

    return prisma.marketOption.update({
      where: { id: option.id },
      data: { odds: newOdds },
    });
  });

  return Promise.all(updates);
}

module.exports = { recalculateOdds, MARGIN, MIN_ODDS, MAX_ODDS };
