import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()
const prisma = new PrismaClient()

async function main() {
  const guildId = "937104156668358686" // replace with your current guild ID

  await prisma.guildConfig.upsert({
    where: { id: guildId },
    update: {}, // no update needed if it already exists
    create: {
      id: guildId,
      voiceCreatorRoomId: null,
      voiceCreatorCategory: null,
      discordEventCalenderMessageId: null,
      vrcEventCalenderMessageId: null,
      upcomingEventsCalenderMessageId: null,
      draftChannelId: process.env.DEFAULT_EVENT_DRAFT_CHANNEL_ID ?? null,
      publishingDiscordChannelId: process.env.DEFAULT_EVENT_PUBLISHING_DISCORD_CHANNEL_ID ?? null,
      publishingVRCChannelId: process.env.DEFAULT_EVENT_PUBLISHING_VRC_CHANNEL_ID ?? null,
      upcomingEventsChannelId: process.env.DEFAULT_EVENT_PUBLISHING_CHANNEL_ID ?? null,
      cookieChannelId: null,
    },
  })

  console.log(`✅ GuildConfig ensured for guildId=${guildId}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })