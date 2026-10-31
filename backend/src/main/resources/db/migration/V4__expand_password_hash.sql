-- Hashes Argon2id codificados incluem parâmetros e salt; 100 caracteres não comportam
-- com segurança futuras evoluções do encoder.
ALTER TABLE app_user ALTER COLUMN password_hash TYPE VARCHAR(255);
