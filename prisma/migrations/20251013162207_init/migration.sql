-- DropForeignKey
ALTER TABLE `cohostsonevent` DROP FOREIGN KEY `CohostsOnEvent_eventId_fkey`;

-- DropForeignKey
ALTER TABLE `eventsignups` DROP FOREIGN KEY `EventSignUps_eventId_fkey`;

-- DropForeignKey
ALTER TABLE `interestedsignups` DROP FOREIGN KEY `InterestedSignUps_eventId_fkey`;

-- DropForeignKey
ALTER TABLE `usereventreminder` DROP FOREIGN KEY `UserEventReminder_eventId_fkey`;

-- DropIndex
DROP INDEX `CohostsOnEvent_eventId_fkey` ON `cohostsonevent`;

-- DropIndex
DROP INDEX `EventSignUps_eventId_fkey` ON `eventsignups`;

-- DropIndex
DROP INDEX `InterestedSignUps_eventId_fkey` ON `interestedsignups`;

-- AddForeignKey
ALTER TABLE `UserEventReminder` ADD CONSTRAINT `UserEventReminder_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CohostsOnEvent` ADD CONSTRAINT `CohostsOnEvent_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventSignUps` ADD CONSTRAINT `EventSignUps_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterestedSignUps` ADD CONSTRAINT `InterestedSignUps_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
