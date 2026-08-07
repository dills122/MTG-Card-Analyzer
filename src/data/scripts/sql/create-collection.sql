use MtgCardCatalog;

CREATE TABLE CardCollection (
    CardID int NOT NULL AUTO_INCREMENT,
    CardName varchar(50) NOT NULL,
    CardType varchar(50) NOT NULL,
    CardSet varchar(50) NOT NULL,
    Quantity int NOT NULL,
    EstValue DECIMAL(10,2) NOT NULL DEFAULT 0,
    Automated BIT,
    MagicID int,
    ImageUrl varchar(150) NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME ON UPDATE CURRENT_TIMESTAMP,
    CreatedBy varchar(25) NOT NULL DEFAULT 'automated',
    UpdatedBy varchar(25) NOT NULL DEFAULT 'automated',
    PRIMARY KEY (CardID),
    CONSTRAINT U_CardSet UNIQUE (CardName,CardSet)
);