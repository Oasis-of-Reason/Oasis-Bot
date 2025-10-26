-- CreateTable
CREATE TABLE `Cookies` (
    `id` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CookiesUser` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `lastCookieAttempt` DATETIME(3) NOT NULL,
    `cookies` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `CookiesUser_guildId_userId_key`(`guildId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CookiesUser` ADD CONSTRAINT `CookiesUser_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Cookies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
