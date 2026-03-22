CREATE TABLE Equipment (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    OwnerID INT NOT NULL,
    ItemName VARCHAR(255) NOT NULL,
    Category VARCHAR(100),
    Status VARCHAR(50), -- Available, Rented, Maintenance
    HourlyRate DECIMAL(10,2),
    PickupLocation VARCHAR(255)
);