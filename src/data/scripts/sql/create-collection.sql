USING 'mtg-tracker';

CREATE TABLE Card_Catalog (
    CardID int NOT NULL AUTO_INCREMENT,
    CardName varchar(50) NOT NULL,
    CardType varchar(25) NOT NULL,
    CardSet varchar(20) NOT NULL,
    Automated BIT,
    PRIMARY KEY (CardID),
    CONSTRAINT U_CardSet UNIQUE (CardName,CardSet)
);