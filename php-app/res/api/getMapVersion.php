<?php
// --- Create new file: res/api/getMapVersion.php ---

header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

// Use @ to suppress errors if file doesn't exist
// Assuming map_version.json is in /res/
$versionData = @file_get_contents('../map_version.json');

if ($versionData === false) {
    // If file doesn't exist, send a default
    echo json_encode(['lastUpdated' => time()]);
} else {
    echo $versionData;
}
?>