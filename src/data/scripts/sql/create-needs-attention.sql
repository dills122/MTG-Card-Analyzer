use MtgCardCatalog;

CREATE TABLE Card_NEED_ATTN (
    ItemID int NOT NULL AUTO_INCREMENT,
    CardName varchar(50),
    ExtractedText varchar(100),
    DirtyExtractedText varchar(100),
    NameImage TEXT,
    TypeImage TEXT,
    ArtImage TEXT,
    FlavorImage TEXT,
    PossibleSets varchar(50),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME ON UPDATE CURRENT_TIMESTAMP,
    CreatedBy varchar(25) NOT NULL DEFAULT 'automated',
    UpdatedBy varchar(25) NOT NULL DEFAULT 'automated',
    PRIMARY KEY (ItemID),
    CONSTRAINT U_CardSet UNIQUE (CardName,ExtractedText,NameImage(255))
);
