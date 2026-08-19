/**
 * Creates or updates the platform Super Admin.
 *
 * There is no other way in: PlatformAdmin has no registration route and the
 * dev seed only creates an org owner, so a fresh production database has an
 * empty Super Admin console.
 *
 * Run it inside the running API container, passing the credentials as env so
 * they are never written to the repo:
 *
 *   docker compose exec \
 *     -e ADMIN_EMAIL=admin@workk.work -e ADMIN_PASSWORD='…' \
 *     api node dist/bootstrap-admin.js
 *
 * Idempotent: running it again with the same email resets that admin's
 * password and re-activates the account, which is also how you recover from a
 * lockout.
 */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const name = (process.env.ADMIN_NAME || "Super Admin").trim();

  if (!email || !password) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD.");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(`Not a valid email address: ${email}`);
  }
  if (password.length < 10) {
    throw new Error("ADMIN_PASSWORD must be at least 10 characters.");
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  const admin = await prisma.platformAdmin.upsert({
    where: { email },
    update: { passwordHash, role: "SUPER_ADMIN", active: true },
    create: { email, name, passwordHash, role: "SUPER_ADMIN", active: true },
  });

  // Never log the password itself.
  console.log(
    `${existing ? "Updated" : "Created"} SUPER_ADMIN  id=${admin.id}  email=${admin.email}  name=${admin.name}`,
  );
}

main()
  .catch((err) => {
    console.error(`bootstrap-admin failed: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
