import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const responses = [
    "Yes, definitely.",
    "Ask again later.",
    "No way.",
    "It is certain.",
    "Don't count on it.",
    "Outlook not so good.",
    "Most likely.",
    "Cannot predict now."
  ];

  for (const message of responses) {
    await prisma.magic8BallResponse.create({ data: { message } });
  }
}

main().finally(() => prisma.$disconnect());