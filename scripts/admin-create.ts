/* eslint-disable no-console */
/**
 * 创建/提升管理员账号（生产环境首个管理员的官方入口）。
 *
 * 用法：
 *   npm run admin:create -- admin@yourdomain.com 'StrongPass!2026'
 *   npm run admin:create -- --list            # 列出现有管理员
 *
 * 安全说明：生产库不再由 seed 写入演示账号，请用本脚本创建真实管理员。
 */
import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");

  if (args[0] === "--list") {
    const admins = await prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.SUPPORT] } },
      select: { email: true, name: true, role: true, status: true, createdAt: true },
    });
    console.table(admins);
    return;
  }

  const email = args[0]?.trim().toLowerCase();
  const password = args[1];

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("用法: npm run admin:create -- <email> <password>");
  if (!password || password.length < 10) fail("密码至少 10 位");
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) fail("密码需同时包含字母与数字");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: Role.ADMIN, status: "ACTIVE", emailVerified: true },
    create: {
      email,
      passwordHash,
      name: args[2] ?? "Administrator",
      role: Role.ADMIN,
      emailVerified: true,
      status: "ACTIVE",
    },
  });

  console.log(`✓ 管理员已就绪：${user.email}（role=${user.role}）`);
  console.log("  请前往 /admin 登录。若为已有账号提权，其原密码不变。");
}

main()
  .catch((e) => fail(e instanceof Error ? e.message : String(e)))
  .finally(async () => {
    await prisma.$disconnect();
  });
