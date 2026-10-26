BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[User] ADD [emailVerifiedAt] DATETIME2;

-- CreateTable
CREATE TABLE [dbo].[AuthToken] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [purpose] NVARCHAR(20) NOT NULL,
    [tokenHash] NVARCHAR(64) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [usedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuthToken_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AuthToken_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AuthToken_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuthToken_userId_purpose_idx] ON [dbo].[AuthToken]([userId], [purpose]);

-- AddForeignKey
ALTER TABLE [dbo].[AuthToken] ADD CONSTRAINT [AuthToken_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
