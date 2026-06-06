-- CreateTable
CREATE TABLE "proveedores" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "razon_social" TEXT,
    "rfc" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articulos" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "unidad_medida" TEXT NOT NULL DEFAULT 'PZA',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "imagen_url" TEXT,
    "proveedor_id" TEXT,
    "precio_1" DECIMAL(12,2),
    "precio_2" DECIMAL(12,2),
    "precio_3" DECIMAL(12,2),
    "precio_4" DECIMAL(12,2),
    "precio_5" DECIMAL(12,2),
    "precio_6" DECIMAL(12,2),
    "precio_7" DECIMAL(12,2),
    "precio_8" DECIMAL(12,2),
    "precio_9" DECIMAL(12,2),
    "precio_10" DECIMAL(12,2),
    "existencia_1" DECIMAL(12,3),
    "existencia_2" DECIMAL(12,3),
    "existencia_3" DECIMAL(12,3),
    "existencia_4" DECIMAL(12,3),
    "existencia_5" DECIMAL(12,3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articulos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "articulos_empresa_id_clave_key" ON "articulos"("empresa_id", "clave");

-- AddForeignKey
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articulos" ADD CONSTRAINT "articulos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articulos" ADD CONSTRAINT "articulos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
