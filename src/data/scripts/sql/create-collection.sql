use MtgCardCatalog;

CREATE TABLE Card_Catalog (
    CardID int NOT NULL AUTO_INCREMENT,
    CardName varchar(50) NOT NULL,
    CardType varchar(25) NOT NULL,
    CardSet varchar(50) NOT NULL,
    Quantity int NOT NULL,
    EstValue DECIMAL NOT NULL,
    Automated BIT,
    MagicID int,
    ImageUrl varchar(150) NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME ON UPDATE CURRENT_TIMESTAMP,
    CreatedBy varchar(25) NOT NULL,
    UpdatedBy varchar(25) NOT NULL,
    PRIMARY KEY (CardID),
    CONSTRAINT U_CardSet UNIQUE (CardName,CardSet)
);