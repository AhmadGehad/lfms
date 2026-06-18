CREATE TABLE `role_permissions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `role` enum('owner','supervisor','staff','admin','user','viewer') NOT NULL,
  `page` varchar(64) NOT NULL,
  `action` varchar(64) NOT NULL,
  `allowed` boolean NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `updatedBy` int,
  CONSTRAINT `role_permissions_id` PRIMARY KEY(`id`),
  CONSTRAINT `role_permissions_role_page_action_unique` UNIQUE(`role`,`page`,`action`)
);
