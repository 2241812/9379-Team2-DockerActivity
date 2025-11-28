<?php
// saveMapData.php
header('Content-Type: application/json');

// 1. Connect to database
$conn = new mysqli("localhost", "root", "", "graphDB");
if ($conn->connect_error) {
    die(json_encode(["success" => false, "message" => "Connection failed: " . $conn->connect_error]));
}

// 2. Get JSON data from the POST request body
$jsonData = file_get_contents('php://input');
$data = json_decode($jsonData, true);

// Check if data is valid
if (!$data || !isset($data['nodes']) || !isset($data['edges'])) {
    die(json_encode(["success" => false, "message" => "Invalid or empty map data received."]));
}

// 3. Start a database transaction
$conn->begin_transaction();

try {
    // 4. Clear existing map data
    // We disable foreign key checks to truncate tables in any order
    $conn->query("SET FOREIGN_KEY_CHECKS = 0");
    $conn->query("TRUNCATE TABLE nodes");
    $conn->query("TRUNCATE TABLE edges");
    $conn->query("TRUNCATE TABLE floor_labels");
    $conn->query("SET FOREIGN_KEY_CHECKS = 1");

    // 5. Prepare and insert new nodes
    if (!empty($data['nodes'])) {
        $stmtNodes = $conn->prepare(
            "INSERT INTO nodes (id, name, type, floor, x, y, access)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        foreach ($data['nodes'] as $node) {
            $access = isset($node['access']) ? $node['access'] : 'all';
            $stmtNodes->bind_param(
                "sssiiis",
                $node['id'],
                $node['name'],
                $node['type'],
                $node['floor'],
                $node['x'],
                $node['y'],
                $access
            );
            $stmtNodes->execute();
        }
        $stmtNodes->close();
    }

    // 6. Prepare and insert new edges
    if (!empty($data['edges'])) {
        $stmtEdges = $conn->prepare("INSERT INTO edges (source, target) VALUES (?, ?)");
        foreach ($data['edges'] as $edge) {
            $stmtEdges->bind_param("ss", $edge['source'], $edge['target']);
            $stmtEdges->execute();
        }
        $stmtEdges->close();
    }

    // 7. Prepare and insert new floor labels (if they exist)
    if (isset($data['floorLabels']) && !empty($data['floorLabels'])) {
        $stmtLabels = $conn->prepare("INSERT INTO floor_labels (floor_number, label) VALUES (?, ?)");
        foreach ($data['floorLabels'] as $floor_num => $label) {
            $stmtLabels->bind_param("is", $floor_num, $label);
            $stmtLabels->execute();
        }
        $stmtLabels->close();
    }

    // 8. If all successful, commit the transaction
    $conn->commit();
    $versionData = ['lastUpdated' => time()];
    file_put_contents('../map_version.json', json_encode($versionData));
    echo json_encode(["success" => true, "message" => "Map data saved to database!"]);

} catch (mysqli_sql_exception $exception) {
    // 9. If anything failed, roll back
    $conn->rollback();
    echo json_encode(["success" => false, "message" => "Database error: " . $exception->getMessage()]);
}

$conn->close();
?>