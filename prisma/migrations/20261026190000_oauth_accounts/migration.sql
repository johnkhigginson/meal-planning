BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[User] ALTER COLUMN [passwordHash] NVARCHAR(200) NULL;

-- CreateTable
CREATE TABLE [dbo].[UserOAuthAccount] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [provider] NVARCHAR(20) NOT NULL,
    [providerAccountId] NVARCHAR(255) NOT NULL,
    [email] NVARCHAR(320) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [UserOAuthAccount_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [UserOAuthAccount_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UserOAuthAccount_provider_providerAccountId_key] UNIQUE NONCLUSTERED ([provider],[providerAccountId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [UserOAuthAccount_userId_idx] ON [dbo].[UserOAuthAccount]([userId]);

-- AddForeignKey
ALTER TABLE [dbo].[UserOAuthAccount] ADD CONSTRAINT [UserOAuthAccount_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
