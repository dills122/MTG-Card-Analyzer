use MtgCardCatalog;

CREATE TABLE Transactions (
    TransactionID int NOT NULL AUTO_INCREMENT,
    TransactionType varchar(25),
    IsSuccessful BIT,
    TableName varchar(25) NOT NULL,
    PK int NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME ON UPDATE CURRENT_TIMESTAMP,
    CreatedBy varchar(25) NOT NULL,
    UpdatedBy varchar(25) NOT NULL,
    PRIMARY KEY (TransactionID)
);