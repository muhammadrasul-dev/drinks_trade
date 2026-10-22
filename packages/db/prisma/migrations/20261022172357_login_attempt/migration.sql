-- CreateTable
CREATE TABLE "login_attempt" (
    "username" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "failed_count" INTEGER NOT NULL,
    "last_failed_at" TIMESTAMPTZ NOT NULL,
    "locked_until" TIMESTAMPTZ,

    CONSTRAINT "login_attempt_pkey" PRIMARY KEY ("username","ip")
);
