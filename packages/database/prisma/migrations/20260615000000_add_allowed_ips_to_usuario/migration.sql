-- AlterTable: add allowed_ips column to usuarios
ALTER TABLE "usuarios" ADD COLUMN "allowed_ips" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
