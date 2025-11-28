<?php
// server-user/getMapVersion.php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store, must-revalidate');

// DOCKER CONNECTION SETTINGS
$conn = new mysqli("mysql_db", "root", "admin123", "graphDB");

if ($conn->connect_error) {
    die(json_encode(["error" => "Connection failed"]));
}

$result = $conn->query("SELECT setting_value FROM settings WHERE setting_key = 'map_version'");
$lastUpdated = 0;

if ($result && $row = $result->fetch_assoc()) {
    $lastUpdated = $row['setting_value'];
}

echo json_encode(['lastUpdated' => (int)$lastUpdated]);

$conn->close();
?>