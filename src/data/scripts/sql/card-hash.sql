use MtgCardCatalog;

CREATE TABLE Card_Hashes (
    CardHashID int NOT NULL AUTO_INCREMENT,
    CardName varchar(50) NOT NULL,
    SetName varchar(50) NOT NULL,
    IsFoil BIT NOT NULL,
    IsPromo BIT NOT NULL,
    CardHash varchar(144) NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME ON UPDATE CURRENT_TIMESTAMP,
    CreatedBy varchar(25) NOT NULL,
    UpdatedBy varchar(25) NOT NULL,
    PRIMARY KEY (CardHashID),
    CONSTRAINT U_CardSet UNIQUE (CardName,SetName,CardHash,IsFoil,IsPromo)
);