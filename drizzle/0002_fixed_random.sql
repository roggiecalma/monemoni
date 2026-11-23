CREATE TABLE `loan_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`loan_id` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`account_id` text NOT NULL,
	`transaction_id` text,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `loan_payments_loan_id_idx` ON `loan_payments` (`loan_id`);--> statement-breakpoint
CREATE INDEX `loan_payments_account_id_idx` ON `loan_payments` (`account_id`);--> statement-breakpoint
CREATE INDEX `loan_payments_date_idx` ON `loan_payments` (`date`);--> statement-breakpoint
CREATE TABLE `loans` (
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
CREATE INDEX `loans_direction_idx` ON `loans` (`direction`);--> statement-breakpoint
CREATE INDEX `loans_account_id_idx` ON `loans` (`account_id`);--> statement-breakpoint
CREATE INDEX `loans_archived_idx` ON `loans` (`archived`);--> statement-breakpoint
CREATE INDEX `loans_date_idx` ON `loans` (`date`);--> statement-breakpoint
DROP TABLE `budgets`;