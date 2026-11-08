ALTER TABLE `notifications` ADD `delivered_at` integer;--> statement-breakpoint
UPDATE `notifications` SET `delivered_at` = `created_at` WHERE `delivered_at` IS NULL;--> statement-breakpoint
CREATE INDEX `notifications_delivered_idx` ON `notifications` (`delivered_at`);