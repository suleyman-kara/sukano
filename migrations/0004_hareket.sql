ALTER TABLE `user_preferences` ADD `motion` text DEFAULT 'system' NOT NULL CHECK (`motion` IN ('system', 'reduced', 'full'));--> statement-breakpoint
UPDATE `user_preferences` SET `motion` = 'reduced' WHERE `reduce_motion` = 1;
