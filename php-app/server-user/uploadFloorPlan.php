<?php
// server-user/uploadFloorPlan.php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

// --- DOCKER CREDENTIALS ---
$servername = "mysql_db"; 
$username = "root";
$password = "admin123";
$dbname = "graphDB";

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
    die(json_encode(["success" => false, "message" => "Database connection failed."]));
}

// Check if file exists
if (!isset($_FILES['floorImage']) || !isset($_POST['floorNumber'])) {
    die(json_encode(["success" => false, "message" => "Missing file or floor number."]));
}

$floorNumber = (int)$_POST['floorNumber'];
$fileType = $_FILES['floorImage']['type'];
$fileData = file_get_contents($_FILES['floorImage']['tmp_name']);

// Prepare Statement
$stmt = $conn->prepare("INSERT INTO floor_images (floor_number, mime_type, image_data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), image_data = VALUES(image_data)");

// 'ibs' = integer, blob, string (but mime_type is string). Actually 'isb' -> int, string, blob
// Note: sending blob via bind_param can be tricky with large files, usually 'b' requires send_long_data.
// Let's use the 'b' type correctly.

$null = NULL;
$stmt->bind_param("isb", $floorNumber, $fileType, $null);
$stmt->send_long_data(2, $fileData);

if ($stmt->execute()) {
    // Update map version to trigger refresh on clients
    $newTime = time() * 1000;
    $conn->query("UPDATE settings SET setting_value = '$newTime' WHERE setting_key = 'map_version'");
    
    echo json_encode(["success" => true, "message" => "Floor plan uploaded successfully."]);
} else {
    echo json_encode(["success" => false, "message" => "Database Error: " . $stmt->error]);
}

$stmt->close();
$conn->close();
?>