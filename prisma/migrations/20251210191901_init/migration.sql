-- AlterTable
ALTER TABLE `event` ADD COLUMN `lastTitleChangeTime` DATETIME(3) NULL,
    ADD COLUMN `lastVrcUpdateTime` DATETIME(3) NULL,
    ADD COLUMN `vrcCalenderEventId` VARCHAR(191) NULL,
    ADD COLUMN `vrcDescription` TEXT NULL,
    ADD COLUMN `vrcGroupId` VARCHAR(191) NULL,
    ADD COLUMN `vrcImageId` VARCHAR(191) NULL,
    ADD COLUMN `vrcSendNotification` BOOLEAN NULL,
    MODIFY `draftThreadMessageId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `guildconfig` ADD COLUMN `vrcGroupId` VARCHAR(191) NULL;
