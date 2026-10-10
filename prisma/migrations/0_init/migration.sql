BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[Household] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(200) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Household_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Household_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[User] (
    [id] INT NOT NULL IDENTITY(1,1),
    [email] NVARCHAR(320) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [passwordHash] NVARCHAR(200) NOT NULL,
    [householdId] INT NOT NULL,
    [role] NVARCHAR(20) NOT NULL CONSTRAINT [User_role_df] DEFAULT 'OWNER',
    [systemRole] NVARCHAR(20) NOT NULL CONSTRAINT [User_systemRole_df] DEFAULT 'USER',
    [enabledMealSlots] NVARCHAR(200) NOT NULL CONSTRAINT [User_enabledMealSlots_df] DEFAULT 'BREAKFAST,LUNCH,DINNER,SNACK',
    [hiddenNavItems] NVARCHAR(400) NOT NULL CONSTRAINT [User_hiddenNavItems_df] DEFAULT '',
    [aiEnabled] BIT NOT NULL CONSTRAINT [User_aiEnabled_df] DEFAULT 1,
    [bio] NVARCHAR(max),
    [avatarUrl] NVARCHAR(2000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [lastLogin] DATETIME2,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[HouseholdInvite] (
    [id] INT NOT NULL IDENTITY(1,1),
    [householdId] INT NOT NULL,
    [email] NVARCHAR(320) NOT NULL,
    [invitedBy] INT NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [HouseholdInvite_status_df] DEFAULT 'PENDING',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [HouseholdInvite_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [HouseholdInvite_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [HouseholdInvite_householdId_email_key] UNIQUE NONCLUSTERED ([householdId],[email])
);

-- CreateTable
CREATE TABLE [dbo].[Unit] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(50) NOT NULL,
    [abbreviation] NVARCHAR(10) NOT NULL,
    [unitType] NVARCHAR(20) NOT NULL,
    CONSTRAINT [Unit_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Unit_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[UnitConversion] (
    [id] INT NOT NULL IDENTITY(1,1),
    [fromUnitId] INT NOT NULL,
    [toUnitId] INT NOT NULL,
    [factor] FLOAT(53) NOT NULL,
    CONSTRAINT [UnitConversion_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UnitConversion_fromUnitId_toUnitId_key] UNIQUE NONCLUSTERED ([fromUnitId],[toUnitId])
);

-- CreateTable
CREATE TABLE [dbo].[Ingredient] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(200) NOT NULL,
    [category] NVARCHAR(100),
    [defaultUnitId] INT,
    CONSTRAINT [Ingredient_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Ingredient_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[Recipe] (
    [id] INT NOT NULL IDENTITY(1,1),
    [householdId] INT NOT NULL,
    [authorId] INT,
    [authorName] NVARCHAR(200),
    [name] NVARCHAR(300) NOT NULL,
    [slug] NVARCHAR(350),
    [description] NVARCHAR(max),
    [instructions] NVARCHAR(max) NOT NULL,
    [bodyHtml] NVARCHAR(max),
    [servings] INT NOT NULL,
    [prepTimeMinutes] INT,
    [cookTimeMinutes] INT,
    [sourceType] NVARCHAR(20) NOT NULL CONSTRAINT [Recipe_sourceType_df] DEFAULT 'PERSONAL',
    [sourceUrl] NVARCHAR(2000),
    [sourceBookTitle] NVARCHAR(300),
    [sourceBookPage] NVARCHAR(50),
    [imageUrl] NVARCHAR(2000),
    [isFavorite] BIT NOT NULL CONSTRAINT [Recipe_isFavorite_df] DEFAULT 0,
    [publishedAt] DATETIME2,
    [aiProcessedAt] DATETIME2,
    [imageLocalizeFailed] BIT NOT NULL CONSTRAINT [Recipe_imageLocalizeFailed_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Recipe_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Recipe_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[RecipeIngredient] (
    [id] INT NOT NULL IDENTITY(1,1),
    [recipeId] INT NOT NULL,
    [ingredientId] INT NOT NULL,
    [quantity] FLOAT(53) NOT NULL,
    [unitId] INT NOT NULL,
    [notes] NVARCHAR(200),
    [optional] BIT NOT NULL CONSTRAINT [RecipeIngredient_optional_df] DEFAULT 0,
    [sortOrder] INT NOT NULL CONSTRAINT [RecipeIngredient_sortOrder_df] DEFAULT 0,
    [section] NVARCHAR(100),
    CONSTRAINT [RecipeIngredient_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[RecipeNote] (
    [id] INT NOT NULL IDENTITY(1,1),
    [recipeId] INT NOT NULL,
    [body] NVARCHAR(max) NOT NULL,
    [createdByUserId] INT,
    [createdByName] NVARCHAR(200),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RecipeNote_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [RecipeNote_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AuditLog] (
    [id] INT NOT NULL IDENTITY(1,1),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuditLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [category] NVARCHAR(40) NOT NULL,
    [action] NVARCHAR(80) NOT NULL,
    [summary] NVARCHAR(500) NOT NULL,
    [userId] INT,
    [actorName] NVARCHAR(200),
    [householdId] INT,
    [targetType] NVARCHAR(40),
    [targetId] INT,
    [metadata] NVARCHAR(max),
    [ip] NVARCHAR(64),
    CONSTRAINT [AuditLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[UploadedImage] (
    [id] INT NOT NULL IDENTITY(1,1),
    [data] VARBINARY(max) NOT NULL,
    [contentType] NVARCHAR(100) NOT NULL,
    [uploadedBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [UploadedImage_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [UploadedImage_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Comment] (
    [id] INT NOT NULL IDENTITY(1,1),
    [recipeId] INT NOT NULL,
    [userId] INT,
    [authorName] NVARCHAR(120) NOT NULL,
    [body] NVARCHAR(max) NOT NULL,
    [approved] BIT NOT NULL CONSTRAINT [Comment_approved_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Comment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Comment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Tag] (
    [id] INT NOT NULL IDENTITY(1,1),
    [householdId] INT,
    [name] NVARCHAR(100) NOT NULL,
    CONSTRAINT [Tag_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[RecipeTag] (
    [recipeId] INT NOT NULL,
    [tagId] INT NOT NULL,
    CONSTRAINT [RecipeTag_pkey] PRIMARY KEY CLUSTERED ([recipeId],[tagId])
);

-- CreateTable
CREATE TABLE [dbo].[InventoryItem] (
    [id] INT NOT NULL IDENTITY(1,1),
    [householdId] INT NOT NULL,
    [ingredientId] INT NOT NULL,
    [quantity] FLOAT(53) NOT NULL,
    [unitId] INT NOT NULL,
    [expirationDate] DATETIME2,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [InventoryItem_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [InventoryItem_householdId_ingredientId_key] UNIQUE NONCLUSTERED ([householdId],[ingredientId])
);

-- CreateTable
CREATE TABLE [dbo].[MealPlan] (
    [id] INT NOT NULL IDENTITY(1,1),
    [householdId] INT NOT NULL,
    [weekStartDate] DATE NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MealPlan_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [MealPlan_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [MealPlan_householdId_weekStartDate_key] UNIQUE NONCLUSTERED ([householdId],[weekStartDate])
);

-- CreateTable
CREATE TABLE [dbo].[MealPlanEntry] (
    [id] INT NOT NULL IDENTITY(1,1),
    [mealPlanId] INT NOT NULL,
    [recipeId] INT,
    [customName] NVARCHAR(200),
    [date] DATE NOT NULL,
    [mealSlot] NVARCHAR(20) NOT NULL,
    [servings] INT NOT NULL,
    CONSTRAINT [MealPlanEntry_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[GroceryList] (
    [id] INT NOT NULL IDENTITY(1,1),
    [householdId] INT NOT NULL,
    [mealPlanId] INT,
    [name] NVARCHAR(200) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [GroceryList_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [GroceryList_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[GroceryListItem] (
    [id] INT NOT NULL IDENTITY(1,1),
    [groceryListId] INT NOT NULL,
    [ingredientId] INT NOT NULL,
    [quantity] FLOAT(53) NOT NULL,
    [unitId] INT NOT NULL,
    [checked] BIT NOT NULL CONSTRAINT [GroceryListItem_checked_df] DEFAULT 0,
    [inInventory] FLOAT(53) NOT NULL CONSTRAINT [GroceryListItem_inInventory_df] DEFAULT 0,
    [needed] FLOAT(53) NOT NULL,
    CONSTRAINT [GroceryListItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Store] (
    [id] INT NOT NULL IDENTITY(1,1),
    [householdId] INT NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [isFavorite] BIT NOT NULL CONSTRAINT [Store_isFavorite_df] DEFAULT 0,
    [krogerLocationId] NVARCHAR(50),
    CONSTRAINT [Store_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[StorePrice] (
    [id] INT NOT NULL IDENTITY(1,1),
    [storeId] INT NOT NULL,
    [ingredientId] INT NOT NULL,
    [price] DECIMAL(10,2) NOT NULL,
    [quantity] FLOAT(53) NOT NULL,
    [unitId] INT NOT NULL,
    [lastUpdated] DATETIME2 NOT NULL CONSTRAINT [StorePrice_lastUpdated_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [StorePrice_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [StorePrice_storeId_ingredientId_key] UNIQUE NONCLUSTERED ([storeId],[ingredientId])
);

-- CreateTable
CREATE TABLE [dbo].[LibraryRecipe] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(300) NOT NULL,
    [description] NVARCHAR(max),
    [instructions] NVARCHAR(max) NOT NULL,
    [servings] INT NOT NULL,
    [prepTimeMinutes] INT,
    [cookTimeMinutes] INT,
    [sourceType] NVARCHAR(20) NOT NULL CONSTRAINT [LibraryRecipe_sourceType_df] DEFAULT 'PERSONAL',
    [sourceUrl] NVARCHAR(2000),
    [category] NVARCHAR(100),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LibraryRecipe_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [LibraryRecipe_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[LibraryRecipeIngredient] (
    [id] INT NOT NULL IDENTITY(1,1),
    [libraryRecipeId] INT NOT NULL,
    [ingredientId] INT NOT NULL,
    [quantity] FLOAT(53) NOT NULL,
    [unitId] INT NOT NULL,
    [notes] NVARCHAR(200),
    [optional] BIT NOT NULL CONSTRAINT [LibraryRecipeIngredient_optional_df] DEFAULT 0,
    [sortOrder] INT NOT NULL CONSTRAINT [LibraryRecipeIngredient_sortOrder_df] DEFAULT 0,
    [section] NVARCHAR(100),
    CONSTRAINT [LibraryRecipeIngredient_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[LibraryStore] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(200) NOT NULL,
    CONSTRAINT [LibraryStore_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [LibraryStore_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[RecipeBook] (
    [id] INT NOT NULL IDENTITY(1,1),
    [householdId] INT NOT NULL,
    [name] NVARCHAR(300) NOT NULL,
    [tagline] NVARCHAR(500),
    [description] NVARCHAR(max),
    [slug] NVARCHAR(350),
    [coverImageUrl] NVARCHAR(2000),
    [isPublished] BIT NOT NULL CONSTRAINT [RecipeBook_isPublished_df] DEFAULT 0,
    [publishedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RecipeBook_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [RecipeBook_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CookbookInvite] (
    [id] INT NOT NULL IDENTITY(1,1),
    [recipeBookId] INT NOT NULL,
    [email] NVARCHAR(320) NOT NULL,
    [token] NVARCHAR(100) NOT NULL,
    [invitedByName] NVARCHAR(200),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CookbookInvite_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [acceptedAt] DATETIME2,
    CONSTRAINT [CookbookInvite_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CookbookInvite_token_key] UNIQUE NONCLUSTERED ([token]),
    CONSTRAINT [CookbookInvite_recipeBookId_email_key] UNIQUE NONCLUSTERED ([recipeBookId],[email])
);

-- CreateTable
CREATE TABLE [dbo].[BlogSubscriber] (
    [id] INT NOT NULL IDENTITY(1,1),
    [recipeBookId] INT NOT NULL,
    [userId] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [BlogSubscriber_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [BlogSubscriber_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [BlogSubscriber_recipeBookId_userId_key] UNIQUE NONCLUSTERED ([recipeBookId],[userId])
);

-- CreateTable
CREATE TABLE [dbo].[RecipeBookCollaborator] (
    [id] INT NOT NULL IDENTITY(1,1),
    [recipeBookId] INT NOT NULL,
    [userId] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RecipeBookCollaborator_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [RecipeBookCollaborator_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RecipeBookCollaborator_recipeBookId_userId_key] UNIQUE NONCLUSTERED ([recipeBookId],[userId])
);

-- CreateTable
CREATE TABLE [dbo].[RecipeBookEntry] (
    [id] INT NOT NULL IDENTITY(1,1),
    [recipeBookId] INT NOT NULL,
    [recipeId] INT NOT NULL,
    [sortOrder] INT NOT NULL CONSTRAINT [RecipeBookEntry_sortOrder_df] DEFAULT 0,
    [addedAt] DATETIME2 NOT NULL CONSTRAINT [RecipeBookEntry_addedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [RecipeBookEntry_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RecipeBookEntry_recipeBookId_recipeId_key] UNIQUE NONCLUSTERED ([recipeBookId],[recipeId])
);

-- CreateTable
CREATE TABLE [dbo].[ShareLink] (
    [id] INT NOT NULL IDENTITY(1,1),
    [token] NVARCHAR(64) NOT NULL,
    [shareType] NVARCHAR(20) NOT NULL,
    [recipeId] INT,
    [recipeBookId] INT,
    [createdById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ShareLink_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [expiresAt] DATETIME2,
    [revokedAt] DATETIME2,
    CONSTRAINT [ShareLink_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ShareLink_token_key] UNIQUE NONCLUSTERED ([token])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Recipe_householdId_slug_idx] ON [dbo].[Recipe]([householdId], [slug]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_createdAt_idx] ON [dbo].[AuditLog]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_category_createdAt_idx] ON [dbo].[AuditLog]([category], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Comment_recipeId_createdAt_idx] ON [dbo].[Comment]([recipeId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Tag_householdId_name_idx] ON [dbo].[Tag]([householdId], [name]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RecipeBook_slug_idx] ON [dbo].[RecipeBook]([slug]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CookbookInvite_token_idx] ON [dbo].[CookbookInvite]([token]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BlogSubscriber_recipeBookId_idx] ON [dbo].[BlogSubscriber]([recipeBookId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RecipeBookCollaborator_userId_idx] ON [dbo].[RecipeBookCollaborator]([userId]);

-- AddForeignKey
ALTER TABLE [dbo].[User] ADD CONSTRAINT [User_householdId_fkey] FOREIGN KEY ([householdId]) REFERENCES [dbo].[Household]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[HouseholdInvite] ADD CONSTRAINT [HouseholdInvite_householdId_fkey] FOREIGN KEY ([householdId]) REFERENCES [dbo].[Household]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[UnitConversion] ADD CONSTRAINT [UnitConversion_fromUnitId_fkey] FOREIGN KEY ([fromUnitId]) REFERENCES [dbo].[Unit]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[UnitConversion] ADD CONSTRAINT [UnitConversion_toUnitId_fkey] FOREIGN KEY ([toUnitId]) REFERENCES [dbo].[Unit]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Ingredient] ADD CONSTRAINT [Ingredient_defaultUnitId_fkey] FOREIGN KEY ([defaultUnitId]) REFERENCES [dbo].[Unit]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Recipe] ADD CONSTRAINT [Recipe_householdId_fkey] FOREIGN KEY ([householdId]) REFERENCES [dbo].[Household]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Recipe] ADD CONSTRAINT [Recipe_authorId_fkey] FOREIGN KEY ([authorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RecipeIngredient] ADD CONSTRAINT [RecipeIngredient_recipeId_fkey] FOREIGN KEY ([recipeId]) REFERENCES [dbo].[Recipe]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RecipeIngredient] ADD CONSTRAINT [RecipeIngredient_ingredientId_fkey] FOREIGN KEY ([ingredientId]) REFERENCES [dbo].[Ingredient]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RecipeIngredient] ADD CONSTRAINT [RecipeIngredient_unitId_fkey] FOREIGN KEY ([unitId]) REFERENCES [dbo].[Unit]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RecipeNote] ADD CONSTRAINT [RecipeNote_recipeId_fkey] FOREIGN KEY ([recipeId]) REFERENCES [dbo].[Recipe]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Comment] ADD CONSTRAINT [Comment_recipeId_fkey] FOREIGN KEY ([recipeId]) REFERENCES [dbo].[Recipe]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Tag] ADD CONSTRAINT [Tag_householdId_fkey] FOREIGN KEY ([householdId]) REFERENCES [dbo].[Household]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RecipeTag] ADD CONSTRAINT [RecipeTag_recipeId_fkey] FOREIGN KEY ([recipeId]) REFERENCES [dbo].[Recipe]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RecipeTag] ADD CONSTRAINT [RecipeTag_tagId_fkey] FOREIGN KEY ([tagId]) REFERENCES [dbo].[Tag]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[InventoryItem] ADD CONSTRAINT [InventoryItem_householdId_fkey] FOREIGN KEY ([householdId]) REFERENCES [dbo].[Household]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[InventoryItem] ADD CONSTRAINT [InventoryItem_ingredientId_fkey] FOREIGN KEY ([ingredientId]) REFERENCES [dbo].[Ingredient]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InventoryItem] ADD CONSTRAINT [InventoryItem_unitId_fkey] FOREIGN KEY ([unitId]) REFERENCES [dbo].[Unit]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MealPlan] ADD CONSTRAINT [MealPlan_householdId_fkey] FOREIGN KEY ([householdId]) REFERENCES [dbo].[Household]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[MealPlanEntry] ADD CONSTRAINT [MealPlanEntry_mealPlanId_fkey] FOREIGN KEY ([mealPlanId]) REFERENCES [dbo].[MealPlan]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[MealPlanEntry] ADD CONSTRAINT [MealPlanEntry_recipeId_fkey] FOREIGN KEY ([recipeId]) REFERENCES [dbo].[Recipe]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GroceryList] ADD CONSTRAINT [GroceryList_householdId_fkey] FOREIGN KEY ([householdId]) REFERENCES [dbo].[Household]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[GroceryList] ADD CONSTRAINT [GroceryList_mealPlanId_fkey] FOREIGN KEY ([mealPlanId]) REFERENCES [dbo].[MealPlan]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GroceryListItem] ADD CONSTRAINT [GroceryListItem_groceryListId_fkey] FOREIGN KEY ([groceryListId]) REFERENCES [dbo].[GroceryList]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[GroceryListItem] ADD CONSTRAINT [GroceryListItem_ingredientId_fkey] FOREIGN KEY ([ingredientId]) REFERENCES [dbo].[Ingredient]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GroceryListItem] ADD CONSTRAINT [GroceryListItem_unitId_fkey] FOREIGN KEY ([unitId]) REFERENCES [dbo].[Unit]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Store] ADD CONSTRAINT [Store_householdId_fkey] FOREIGN KEY ([householdId]) REFERENCES [dbo].[Household]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[StorePrice] ADD CONSTRAINT [StorePrice_storeId_fkey] FOREIGN KEY ([storeId]) REFERENCES [dbo].[Store]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[StorePrice] ADD CONSTRAINT [StorePrice_ingredientId_fkey] FOREIGN KEY ([ingredientId]) REFERENCES [dbo].[Ingredient]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StorePrice] ADD CONSTRAINT [StorePrice_unitId_fkey] FOREIGN KEY ([unitId]) REFERENCES [dbo].[Unit]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LibraryRecipeIngredient] ADD CONSTRAINT [LibraryRecipeIngredient_libraryRecipeId_fkey] FOREIGN KEY ([libraryRecipeId]) REFERENCES [dbo].[LibraryRecipe]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[LibraryRecipeIngredient] ADD CONSTRAINT [LibraryRecipeIngredient_ingredientId_fkey] FOREIGN KEY ([ingredientId]) REFERENCES [dbo].[Ingredient]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LibraryRecipeIngredient] ADD CONSTRAINT [LibraryRecipeIngredient_unitId_fkey] FOREIGN KEY ([unitId]) REFERENCES [dbo].[Unit]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RecipeBook] ADD CONSTRAINT [RecipeBook_householdId_fkey] FOREIGN KEY ([householdId]) REFERENCES [dbo].[Household]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CookbookInvite] ADD CONSTRAINT [CookbookInvite_recipeBookId_fkey] FOREIGN KEY ([recipeBookId]) REFERENCES [dbo].[RecipeBook]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[BlogSubscriber] ADD CONSTRAINT [BlogSubscriber_recipeBookId_fkey] FOREIGN KEY ([recipeBookId]) REFERENCES [dbo].[RecipeBook]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[BlogSubscriber] ADD CONSTRAINT [BlogSubscriber_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RecipeBookCollaborator] ADD CONSTRAINT [RecipeBookCollaborator_recipeBookId_fkey] FOREIGN KEY ([recipeBookId]) REFERENCES [dbo].[RecipeBook]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RecipeBookCollaborator] ADD CONSTRAINT [RecipeBookCollaborator_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RecipeBookEntry] ADD CONSTRAINT [RecipeBookEntry_recipeBookId_fkey] FOREIGN KEY ([recipeBookId]) REFERENCES [dbo].[RecipeBook]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RecipeBookEntry] ADD CONSTRAINT [RecipeBookEntry_recipeId_fkey] FOREIGN KEY ([recipeId]) REFERENCES [dbo].[Recipe]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ShareLink] ADD CONSTRAINT [ShareLink_recipeId_fkey] FOREIGN KEY ([recipeId]) REFERENCES [dbo].[Recipe]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ShareLink] ADD CONSTRAINT [ShareLink_recipeBookId_fkey] FOREIGN KEY ([recipeBookId]) REFERENCES [dbo].[RecipeBook]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
