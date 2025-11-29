<?php

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

// DOCKER CONNECTION SETTINGS
$servername = "mysql_db";  
$username = "root";
$password = "admin123";    
$dbname = "graphDB";

// Create connection
$conn = new mysqli($servername, $username, $password, $dbname);

// Check connection
if ($conn->connect_error) {
    die(json_encode(["error" => "Connection failed to Docker DB: " . $conn->connect_error]));
}

// 1. Fetch Nodes
$nodesResult = $conn->query("SELECT * FROM nodes");
$nodes = [];
while ($row = $nodesResult->fetch_assoc()) {

    $row['floor'] = (int)$row['floor'];
    $row['x'] = (int)$row['x'];
    $row['y'] = (int)$row['y'];
    $nodes[] = $row;
}

// 2. Fetch Edges
$edgesResult = $conn->query("SELECT * FROM edges");
$edges = [];
while ($row = $edgesResult->fetch_assoc()) {
    $edges[] = $row;
}

// 3. Fetch Floor Labels
$labelsResult = $conn->query("SELECT * FROM floor_labels");
$floorLabels = [];
while ($row = $labelsResult->fetch_assoc()) {
    $floorLabels[$row['floor_number']] = $row['label'];
}

// 4. Fetch Floor Images
$imagesResult = $conn->query("SELECT * FROM floor_images");
$floorPlans = [];
while ($row = $imagesResult->fetch_assoc()) {
    $floor_num = $row['floor_number'];
    $mime_type = $row['mime_type'];
    $base64 = base64_encode($row['image_data']);
    $floorPlans[$floor_num] = "data:$mime_type;base64,$base64";
}

// Return everything as one JSON object
echo json_encode([
    "nodes" => $nodes,
    "edges" => $edges,
    "floorLabels" => $floorLabels,
    "floorPlans" => $floorPlans
]);

$conn->close();
?>