-- CreateTable
CREATE TABLE `GuildConfig` (
    `id` VARCHAR(191) NOT NULL,
    `voiceCreatorRoomId` VARCHAR(191) NULL,
    `voiceCreatorCategory` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `temporary_voice_channels` (
    `id` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `temporary_voice_channels_channelId_key`(`channelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Event` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `draftChannelId` VARCHAR(191) NOT NULL,
    `draftThreadId` VARCHAR(191) NOT NULL,
    `draftThreadMessageId` VARCHAR(191) NOT NULL,
    `publishedChannelId` VARCHAR(191) NULL,
    `publishedThreadId` VARCHAR(191) NULL,
    `publishedChannelMessageId` VARCHAR(191) NULL,
    `publishedThreadMessageId` VARCHAR(191) NULL,
    `community` VARCHAR(191) NULL,
    `communityLink` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `subtype` VARCHAR(191) NOT NULL,
    `game` VARCHAR(191) NULL,
    `platforms` VARCHAR(191) NULL,
    `requirements` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `imageUrl` TEXT NULL,
    `hostId` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NULL,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `capacityCap` INTEGER NOT NULL,
    `capacityBase` INTEGER NOT NULL,
    `capacityCohosts` INTEGER NULL,
    `capacityPerCohost` INTEGER NULL,
    `startTime` DATETIME(3) NOT NULL,
    `lengthMinutes` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Event_draftThreadMessageId_key`(`draftThreadMessageId`),
    UNIQUE INDEX `Event_publishedChannelMessageId_key`(`publishedChannelMessageId`),
    UNIQUE INDEX `Event_publishedThreadMessageId_key`(`publishedThreadMessageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CohostsOnEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventId` INTEGER NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventSignUps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventId` INTEGER NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InterestedSignUps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventId` INTEGER NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CohostsOnEvent` ADD CONSTRAINT `CohostsOnEvent_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventSignUps` ADD CONSTRAINT `EventSignUps_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterestedSignUps` ADD CONSTRAINT `InterestedSignUps_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
