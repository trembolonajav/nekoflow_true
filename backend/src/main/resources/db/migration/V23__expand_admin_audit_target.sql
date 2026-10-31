-- Títulos de obras podem exceder 120 caracteres; auditoria nunca deve abortar a publicação.
ALTER TABLE admin_audit ALTER COLUMN target TYPE TEXT;

