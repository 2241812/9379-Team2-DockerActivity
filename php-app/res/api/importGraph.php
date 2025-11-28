<?php
header('Content-Type: text/plain');

// 1. Connect to database
$conn = new mysqli("localhost", "root", "", "graphDB");
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// 2. Load JSON data
$jsonPath = '../../school_map_data.json';
if (!file_exists($jsonPath)) {
    die("Error: school_map_data.json not found at expected location.");
}

$jsonData = file_get_contents($jsonPath);
$data = json_decode($jsonData, true);

if ($data === null) {
    die("Error: Failed to decode JSON. Check file for syntax errors.");
}

// 3. Start a database transaction
$conn->begin_transaction();

try {
    // 4. Clear existing map data
    $conn->query("SET FOREIGN_KEY_CHECKS = 0");
    $conn->query("TRUNCATE TABLE nodes");
    $conn->query("TRUNCATE TABLE edges");
    $conn->query("TRUNCATE TABLE floor_labels");
    $conn->query("TRUNCATE TABLE floor_images"); // Also clear old images
    $conn->query("SET FOREIGN_KEY_CHECKS = 1");

    // 5. Prepare and insert new nodes
    $imported_floors = [];
    if (isset($data['nodes']) && !empty($data['nodes'])) {
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
            if (!in_array($node['floor'], $imported_floors)) {
                $imported_floors[] = $node['floor'];
            }
        }
        $stmtNodes->close();
        echo "Successfully imported " . count($data['nodes']) . " nodes.\n";
    }

    // 6. Prepare and insert new edges
    if (isset($data['edges']) && !empty($data['edges'])) {
        $stmtEdges = $conn->prepare("INSERT INTO edges (source, target) VALUES (?, ?)");
        foreach ($data['edges'] as $edge) {
            $stmtEdges->bind_param("ss", $edge['source'], $edge['target']);
            $stmtEdges->execute();
        }
        $stmtEdges->close();
        echo "Successfully imported " . count($data['edges']) . " edges.\n";
    }

    // 7. Prepare and insert new floor labels
    if (isset($data['floorLabels']) && !empty($data['floorLabels'])) {
        $stmtLabels = $conn->prepare("INSERT INTO floor_labels (floor_number, label) VALUES (?, ?)");
        foreach ($data['floorLabels'] as $floor_num => $label) {
            $stmtLabels->bind_param("is", $floor_num, $label);
            $stmtLabels->execute();
        }
        $stmtLabels->close();
        echo "Successfully imported " . count($data['floorLabels']) . " floor labels.\n";
    }

    // 8. Import Floorplan Images
    echo "\nAttempting to import floorplan images...\n";
    if (empty($imported_floors)) {
        echo "No floors found in nodes, skipping image import.\n";
    } else {
        $extensions_to_try = ['png', 'jpg', 'jpeg', 'svg'];
        $stmtImages = $conn->prepare(
            "INSERT INTO floor_images (floor_number, mime_type, image_data) 
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE mime_type = ?, image_data = ?"
        );

        foreach ($imported_floors as $floor_num) {
            $image_path_found = null;
            foreach ($extensions_to_try as $ext) {
                $image_file_path = "../images/floor-" . $floor_num . "." . $ext;
                if (file_exists($image_file_path)) {
                    $image_path_found = $image_file_path;
                    break;
                }
            }

            if ($image_path_found) {
                $mime_type = mime_content_type($image_path_found);
                $image_data = file_get_contents($image_path_found);
                
                $null = NULL;
                
                // --- THIS IS THE FIX ---
                // The type string is now 'isbsb' instead of 'isssb'
                $stmtImages->bind_param("isbsb", 
                    $floor_num, 
                    $mime_type, 
                    $null, // Placeholder for INSERT blob
                    $mime_type, 
                    $null  // Placeholder for UPDATE blob
                );
                
                $stmtImages->send_long_data(2, $image_data); // Index 2 is the 3rd '?'
                $stmtImages->send_long_data(4, $image_data); // Index 4 is the 5th '?'
                $stmtImages->execute();
                
                echo " - Successfully imported image for floor " . $floor_num . " (" . $mime_type . ").\n";
            } else {
                echo " - No image file found for floor " . $floor_num . " in /res/images/.\n";
            }
        }
        $stmtImages->close();
    }

    // 9. If all successful, commit the transaction
    $conn->commit();
    echo "\nSUCCESS: All data successfully imported into graphDB!";

} catch (mysqli_sql_exception $exception) {
    // 10. If anything failed, roll back
    $conn->rollback();
    echo "\nDATABASE ERROR: Transaction rolled back.\n";
    echo "Error: " . $exception->getMessage();
}

$conn->close();
?>