/*
  Warnings:

  - You are about to alter the column `type` on the `event` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(1))`.
  - You are about to alter the column `subtype` on the `event` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(2))`.

*/
-- AlterTable
ALTER TABLE `event` ADD COLUMN `googleEventId` VARCHAR(191) NULL,
    ADD COLUMN `publishedAt` DATETIME(3) NULL,
    MODIFY `type` ENUM('DISCORD', 'VRCHAT') NOT NULL,
    MODIFY `subtype` ENUM('CINEMA', 'GAMING', 'WELLNESS', 'ART', 'SOCIAL') NOT NULL;

-- AlterTable
ALTER TABLE `guildconfig` ADD COLUMN `mediaEventCalenderMessageId` VARCHAR(191) NULL,
    ADD COLUMN `publishingMediaChannelId` VARCHAR(191) NULL;
