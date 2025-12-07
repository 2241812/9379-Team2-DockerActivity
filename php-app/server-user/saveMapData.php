<?php
// File: server-user/saveMapData.php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

// DOCKER DATABASE CREDENTIALS
$servername = "mysql_db"; 
$username = "root";
$password = "admin123";
$dbname = "graphDB";

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
    die(json_encode(["success" => false, "message" => "Connection failed: " . $conn->connect_error]));
}

// Get JSON input
$jsonData = file_get_contents('php://input');
$data = json_decode($jsonData, true);

if (!$data || !isset($data['nodes']) || !isset($data['edges'])) {
    die(json_encode(["success" => false, "message" => "Invalid map data."]));
}

$conn->begin_transaction();

try {
    // Disable foreign keys to clear tables cleanly
    $conn->query("SET FOREIGN_KEY_CHECKS = 0");
    $conn->query("TRUNCATE TABLE nodes");
    $conn->query("TRUNCATE TABLE edges");
    $conn->query("TRUNCATE TABLE floor_labels");
    $conn->query("SET FOREIGN_KEY_CHECKS = 1");

    // Insert Nodes
    if (!empty($data['nodes'])) {
        $stmtNodes = $conn->prepare("INSERT INTO nodes (id, name, type, floor, x, y, access) VALUES (?, ?, ?, ?, ?, ?, ?)");
        foreach ($data['nodes'] as $node) {
            $access = isset($node['access']) ? $node['access'] : 'all';
            $stmtNodes->bind_param("sssiiis", $node['id'], $node['name'], $node['type'], $node['floor'], $node['x'], $node['y'], $access);
            $stmtNodes->execute();
        }
        $stmtNodes->close();
    }

    // Insert Edges
    if (!empty($data['edges'])) {
        $stmtEdges = $conn->prepare("INSERT INTO edges (source, target) VALUES (?, ?)");
        foreach ($data['edges'] as $edge) {
            $stmtEdges->bind_param("ss", $edge['source'], $edge['target']);
            $stmtEdges->execute();
        }
        $stmtEdges->close();
    }

    // Insert Floor Labels
    if (isset($data['floorLabels']) && !empty($data['floorLabels'])) {
        $stmtLabels = $conn->prepare("INSERT INTO floor_labels (floor_number, label) VALUES (?, ?)");
        foreach ($data['floorLabels'] as $floor_num => $label) {
            $stmtLabels->bind_param("is", $floor_num, $label);
            $stmtLabels->execute();
        }
        $stmtLabels->close();
    }

    // Update Version
    $newTime = time() * 1000;
    $conn->query("INSERT INTO settings (setting_key, setting_value) VALUES ('map_version', '$newTime') ON DUPLICATE KEY UPDATE setting_value = '$newTime'");

    $conn->commit();
    echo json_encode(["success" => true, "message" => "Map saved successfully!"]);

} catch (Exception $e) {
    $conn->rollback();
    echo json_encode(["success" => false, "message" => "Database error: " . $e->getMessage()]);
}

$conn->close();
?>