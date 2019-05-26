use MtgCardCatalog;

CREATE TABLE Image_Results (
    ImageHashID int NOT NULL AUTO_INCREMENT,
    Name varchar(50) NOT NULL,
    SetName varchar(50) NOT NULL,
    ArtImage TEXT NOT NULL,
    FlavorImage TEXT NOT NULL,
    ArtMatchPercent DOUBLE,
    FlavorMatchPercent DOUBLE,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME ON UPDATE CURRENT_TIMESTAMP,
    CreatedBy varchar(25) NOT NULL,
    UpdatedBy varchar(25) NOT NULL,
    PRIMARY KEY (ImageHashID)
);