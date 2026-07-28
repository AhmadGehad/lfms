ALTER TABLE `saas_tenant_sessions`
  ADD COLUMN `idleTimeoutMs` int NULL AFTER `expiresAt`;
