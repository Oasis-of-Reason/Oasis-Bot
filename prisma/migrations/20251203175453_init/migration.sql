-- AlterTable
ALTER TABLE `cookiesuser` ADD COLUMN `mostCookiesLost` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `guildconfig` ADD COLUMN `vrcLoginToken` VARCHAR(191) NULL;
