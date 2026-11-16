ALTER TABLE `Assignment` ADD COLUMN `isTemporary` BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX `Assignment_isTemporary_updatedAt_idx` ON `Assignment`(`isTemporary`, `updatedAt`);
