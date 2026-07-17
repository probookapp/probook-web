-- Recovery codes for platform-admin 2FA, so a lost authenticator no longer
-- means a locked-out super-admin needing direct DB surgery.
CREATE TABLE "admin_backup_codes" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_backup_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_backup_codes_admin_id_idx" ON "admin_backup_codes"("admin_id");

ALTER TABLE "admin_backup_codes" ADD CONSTRAINT "admin_backup_codes_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "platform_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
