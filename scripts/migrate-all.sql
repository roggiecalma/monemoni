-- MoneMoni — Combined migration for Turso
-- Apply this entire file to your Turso database console.

CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `sessions_user_id_idx` ON `sessions` (`user_id`);

CREATE TABLE IF NOT EXISTS `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`opening_balance` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'PHP' NOT NULL,
	`is_liability` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `accounts_sort_order_idx` ON `accounts` (`sort_order`);

CREATE TABLE IF NOT EXISTS `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `categories_kind_sort_order_idx` ON `categories` (`kind`,`sort_order`);

CREATE TABLE IF NOT EXISTS `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'PHP' NOT NULL,
	`category_id` text,
	`account_id` text NOT NULL,
	`to_account_id` text,
	`note` text,
	`recurring_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recurring_id`) REFERENCES `recurring_bills`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX IF NOT EXISTS `transactions_date_idx` ON `transactions` (`date`);
CREATE INDEX IF NOT EXISTS `transactions_account_id_idx` ON `transactions` (`account_id`);
CREATE INDEX IF NOT EXISTS `transactions_category_id_idx` ON `transactions` (`category_id`);
CREATE INDEX IF NOT EXISTS `transactions_type_idx` ON `transactions` (`type`);

CREATE TABLE IF NOT EXISTS `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`month` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'PHP' NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `budgets_category_month_idx` ON `budgets` (`category_id`,`month`);
CREATE UNIQUE INDEX IF NOT EXISTS `budgets_category_month_unique` ON `budgets` (`category_id`,`month`);

CREATE TABLE IF NOT EXISTS `recurring_bills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'PHP' NOT NULL,
	`category_id` text,
	`account_id` text NOT NULL,
	`frequency` text NOT NULL,
	`day_of_month` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`active` integer DEFAULT true NOT NULL,
	`last_materialized` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `recurring_bills_account_id_idx` ON `recurring_bills` (`account_id`);
CREATE INDEX IF NOT EXISTS `recurring_bills_category_id_idx` ON `recurring_bills` (`category_id`);

CREATE TABLE IF NOT EXISTS `savings_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`target_amount` integer NOT NULL,
	`currency` text DEFAULT 'PHP' NOT NULL,
	`target_date` text,
	`color` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `savings_goals_archived_idx` ON `savings_goals` (`archived`);

CREATE TABLE IF NOT EXISTS `goal_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'PHP' NOT NULL,
	`account_id` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `savings_goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `goal_contributions_goal_id_idx` ON `goal_contributions` (`goal_id`);
CREATE INDEX IF NOT EXISTS `goal_contributions_account_id_idx` ON `goal_contributions` (`account_id`);
CREATE INDEX IF NOT EXISTS `goal_contributions_date_idx` ON `goal_contributions` (`date`);
