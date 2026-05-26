ALTER TABLE "Contact" DROP COLUMN "fullName";
ALTER TABLE "Contact" ADD COLUMN "fullName" text GENERATED ALWAYS AS (
  CASE
    WHEN "firstName" IS NULL AND "lastName" IS NULL THEN NULL
    WHEN "firstName" IS NULL THEN "lastName"
    WHEN "lastName" IS NULL THEN "firstName"
    ELSE "firstName" || ' ' || "lastName"
  END
) STORED;
