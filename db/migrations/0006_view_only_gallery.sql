ALTER TABLE `deals` ADD `deal_type_label_override` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `is_view_only_example` integer DEFAULT false NOT NULL;