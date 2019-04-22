USING 'mtg-tracker';

CREATE TABLE Card_NEED_ATTN (
    ItemID int NOT NULL AUTO_INCREMENT,
    CardName varchar(50),
    ExtractedText varchar(100),
    DirtyExtractedText varchar(100),
    NameImage TEXT,
    TypeImage TEXT,
    Automated BIT,
    PRIMARY KEY (ItemID)
);