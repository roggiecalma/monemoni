CREATE TABLE `borrowed_lent_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`borrowed_lent_id` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`account_id` text NOT NULL,
	`transaction_id` text,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`borrowed_lent_id`) REFERENCES `borrowed_lent`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `borrowed_lent_payments_entry_id_idx` ON `borrowed_lent_payments` (`borrowed_lent_id`);--> statement-breakpoint
CREATE INDEX `borrowed_lent_payments_account_id_idx` ON `borrowed_lent_payments` (`account_id`);--> statement-breakpoint
CREATE INDEX `borrowed_lent_payments_date_idx` ON `borrowed_lent_payments` (`date`);--> statement-breakpoint
CREATE TABLE `borrowed_lent` (
	`id` text PRIMARY KEY NOT NULL,
	`person` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'PHP' NOT NULL,
	`direction` text NOT NULL,
	`account_id` text,
	`transaction_id` text,
	`date` text NOT NULL,
	`due_date` text,
	`note` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `borrowed_lent_direction_idx` ON `borrowed_lent` (`direction`);--> statement-breakpoint
CREATE INDEX `borrowed_lent_account_id_idx` ON `borrowed_lent` (`account_id`);--> statement-breakpoint
CREATE INDEX `borrowed_lent_archived_idx` ON `borrowed_lent` (`archived`);--> statement-breakpoint
CREATE INDEX `borrowed_lent_date_idx` ON `borrowed_lent` (`date`);--> statement-breakpoint
DROP TABLE `budgets`;