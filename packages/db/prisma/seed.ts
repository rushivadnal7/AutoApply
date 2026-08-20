import { PrismaClient, PortalCode } from "@prisma/client";

const prisma = new PrismaClient();

const PORTALS: Array<{ code: PortalCode; name: string; isActive: boolean }> = [
  { code: "DICE", name: "Dice", isActive: true },
  { code: "ZIPRECRUITER", name: "ZipRecruiter", isActive: false },
  { code: "INDEED", name: "Indeed", isActive: false },
  { code: "MONSTER", name: "Monster", isActive: false },
];

async function main() {
  for (const portal of PORTALS) {
    await prisma.jobPortal.upsert({
      where: { code: portal.code },
      update: { name: portal.name, isActive: portal.isActive },
      create: portal,
    });
  }
  console.log(`Seeded ${PORTALS.length} job portals (Dice active, others stubbed).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
