import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const orgName = "Workk Demo Co";
  const email = "owner@eagle.test";
  const password = "eagle1234";

  const org = await prisma.organization.upsert({
    where: { id: "seed-org" },
    update: {},
    create: { id: "seed-org", name: orgName },
  });

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      orgId: org.id,
      email,
      name: "Demo Owner",
      role: "OWNER",
      passwordHash: bcrypt.hashSync(password, 10),
    },
  });

  await prisma.trackingSetting.upsert({
    where: { orgId: org.id },
    update: {},
    create: { orgId: org.id },
  });

  await prisma.subscription.upsert({
    where: { orgId: org.id },
    update: {},
    create: {
      orgId: org.id,
      tier: "PROFESSIONAL",
      cycle: "ANNUALLY",
      seats: 10,
      validUntil: new Date("2026-08-22"),
    },
  });

  // A couple of employees so the dashboard isn't empty before an agent enrolls.
  const names = ["Divya Laptop", "Kanika Desktop", "Priyanshu Laptop"];
  for (const name of names) {
    const existing = await prisma.employee.findFirst({ where: { orgId: org.id, name } });
    if (!existing) await prisma.employee.create({ data: { orgId: org.id, name } });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded org "${orgName}". Login: ${email} / ${password}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
