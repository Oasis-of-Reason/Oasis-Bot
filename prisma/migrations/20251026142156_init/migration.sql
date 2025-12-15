-- AlterTable
ALTER TABLE `guildconfig` ADD COLUMN `cookieChannelId` VARCHAR(191) NULL,
    ADD COLUMN `upcomingEventsCalenderMessageId` VARCHAR(191) NULL,
    ADD COLUMN `upcomingEventsChannelId` VARCHAR(191) NULL;
