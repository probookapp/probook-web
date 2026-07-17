-- Platform admin password recovery
CREATE TABLE "admin_password_reset_tokens" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_password_reset_tokens_token_key" ON "admin_password_reset_tokens"("token");
CREATE INDEX "admin_password_reset_tokens_token_idx" ON "admin_password_reset_tokens"("token");
CREATE INDEX "admin_password_reset_tokens_admin_id_idx" ON "admin_password_reset_tokens"("admin_id");

ALTER TABLE "admin_password_reset_tokens" ADD CONSTRAINT "admin_password_reset_tokens_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "platform_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
