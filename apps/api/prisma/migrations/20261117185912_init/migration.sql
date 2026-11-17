-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('female', 'male');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('sedentary', 'light', 'moderate', 'active');

-- CreateEnum
CREATE TYPE "MealSlot" AS ENUM ('breakfast', 'lunch', 'snack', 'dinner');

-- CreateEnum
CREATE TYPE "MealSource" AS ENUM ('photo', 'text', 'repeat');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('high', 'medium', 'low');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sex" "Sex",
    "age" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "heightCm" DOUBLE PRECISION NOT NULL,
    "goalWeightKg" DOUBLE PRECISION NOT NULL,
    "activity" "ActivityLevel" NOT NULL,
    "maintenanceKcal" INTEGER NOT NULL,
    "targetKcal" INTEGER NOT NULL,
    "dailyDeficitKcal" INTEGER NOT NULL,
    "proteinTargetG" INTEGER NOT NULL,
    "weeksToGoal" INTEGER,
    "floorApplied" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Meal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "slot" "MealSlot" NOT NULL,
    "eatenAt" TIMESTAMPTZ(3) NOT NULL,
    "source" "MealSource" NOT NULL,
    "totalKcal" INTEGER NOT NULL,
    "totalProteinG" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Meal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealItem" (
    "id" UUID NOT NULL,
    "mealId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "portion" TEXT NOT NULL,
    "kcal" INTEGER NOT NULL,
    "proteinG" DOUBLE PRECISION NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "MealItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRequest" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_deviceId_key" ON "User"("deviceId");

-- CreateIndex
CREATE INDEX "Meal_userId_eatenAt_idx" ON "Meal"("userId", "eatenAt");

-- CreateIndex
CREATE INDEX "Meal_userId_slot_eatenAt_idx" ON "Meal"("userId", "slot", "eatenAt");

-- CreateIndex
CREATE UNIQUE INDEX "MealItem_mealId_position_key" ON "MealItem"("mealId", "position");

-- CreateIndex
CREATE INDEX "AiRequest_createdAt_idx" ON "AiRequest"("createdAt");

-- CreateIndex
CREATE INDEX "AiRequest_userId_createdAt_idx" ON "AiRequest"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealItem" ADD CONSTRAINT "MealItem_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
