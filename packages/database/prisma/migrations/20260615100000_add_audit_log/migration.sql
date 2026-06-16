-- CreateTable audit_logs
CREATE TABLE "audit_logs" (
    "id"           TEXT NOT NULL,
    "empresa_id"   TEXT,
    "usuario_id"   TEXT,
    "usuario_name" TEXT,
    "accion"       TEXT NOT NULL,
    "entidad"      TEXT NOT NULL,
    "entidad_id"   TEXT,
    "cambios"      JSONB,
    "ip"           TEXT,
    "user_agent"   TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_empresa_id_created_at_idx" ON "audit_logs"("empresa_id", "created_at" DESC);
CREATE INDEX "audit_logs_entidad_entidad_id_idx"     ON "audit_logs"("entidad", "entidad_id");
CREATE INDEX "audit_logs_usuario_id_idx"             ON "audit_logs"("usuario_id");
