CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text,
	`show_id` text,
	`settlement_id` text,
	`event_type` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`actor_name` text NOT NULL,
	`actor_role` text,
	`payload_json` text,
	`summary` text NOT NULL,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clause_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`clause_ref` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_name` text NOT NULL,
	`body` text NOT NULL,
	`channel` text NOT NULL,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`accessed_at` integer,
	`signoff_status` text DEFAULT 'open' NOT NULL,
	`signoff_text` text,
	`signoff_by_name` text,
	`signoff_at` integer
);
--> statement-breakpoint
CREATE TABLE `walkthrough_acks` (
	`id` text PRIMARY KEY NOT NULL,
	`settlement_id` text NOT NULL,
	`line_key` text NOT NULL,
	`acked_by_user_id` text,
	`acked_by_actor_type` text,
	`acked_by_name` text,
	`acked_at` integer NOT NULL,
	`dispute_note` text,
	FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `deals` ADD `recoups_json` text;--> statement-breakpoint
ALTER TABLE `deals` ADD `ambiguities_json` text;--> statement-breakpoint
ALTER TABLE `deals` ADD `source_prose` text;--> statement-breakpoint
ALTER TABLE `deals` ADD `extracted_at` integer;--> statement-breakpoint
ALTER TABLE `deals` ADD `confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `deals` ADD `comp_rules_json` text;--> statement-breakpoint
ALTER TABLE `deals` ADD `external_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `deals_external_id_unique` ON `deals` (`external_id`);