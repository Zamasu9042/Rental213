CREATE TABLE Rental (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    RenterID INT NOT NULL,
    EquipmentID INT NOT NULL,
    StartTime TIMESTAMP,
    EndTime TIMESTAMP,
    Status VARCHAR(50), -- Active, Completed, Late
    ReturnTimestamp TIMESTAMP NULL,
    HourlyRate DECIMAL(10,2),
    PickupLocation VARCHAR(255)
);