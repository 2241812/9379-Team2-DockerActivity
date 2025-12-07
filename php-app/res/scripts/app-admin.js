App.AdminEditor = {
    editMode: {
        mode: null,
        type: null,
        access: null,
        firstNodeId: null
    },

    isDragging: false,
    dragAnimationFrame: null,
    offset: { x: 0, y: 0 },
    draggedNodeId: null,

    adminDOMElements: {
        addFloorBtn: document.getElementById('addFloorBtn'),
        deleteFloorBtn: document.getElementById('deleteFloorBtn'),
        setFloorLabelBtn: document.getElementById('setFloorLabelBtn'),
        importMapInput: document.getElementById('importMapInput'),
        exportMapBtn: document.getElementById('exportMapBtn'),
        adminAddBtns: document.querySelectorAll('.admin-add-btn'),
        saveToDbBtn: document.getElementById('saveToDbBtn'),
        mapSvg: document.getElementById('mapSvg'),
        adminStatus: document.getElementById('adminStatus'),
        
        // NEW: Elements for Floor Plan Upload
        uploadForm: document.getElementById('uploadForm'),
        floorImageInput: document.getElementById('floorImageInput')
    },
    
    constants: {
        STATUS_COLORS: {
            WARNING: "#F6AD55",
            SUCCESS: "#68D391",
            ERROR: "#F56565",
            DEFAULT: ""
        }
    },

    init: () => {
        const controls = App.AdminEditor.adminDOMElements;
        
        // Event Listeners
        if (controls.addFloorBtn) controls.addFloorBtn.addEventListener('click', App.AdminEditor.handleAddNewFloor);
        if (controls.deleteFloorBtn) controls.deleteFloorBtn.addEventListener('click', App.AdminEditor.handleDeleteFloor);
        if (controls.setFloorLabelBtn) controls.setFloorLabelBtn.addEventListener('click', App.AdminEditor.handleSetFloorLabel);
        if (controls.exportMapBtn) controls.exportMapBtn.addEventListener('click', App.AdminEditor.handleExportMapData);
        if (controls.importMapInput) controls.importMapInput.addEventListener('change', App.AdminEditor.handleImportMapData);

        if (controls.saveToDbBtn) {
            controls.saveToDbBtn.addEventListener('click', App.AdminEditor.handleSaveMapToDatabase);
        }

        // NEW: Listener for Floor Plan Upload Form
        if (controls.uploadForm) {
            controls.uploadForm.addEventListener('submit', App.AdminEditor.handleUploadFloorImage);
        }

        controls.adminAddBtns.forEach(btn => {
            btn.addEventListener('click', App.AdminEditor.handleSetEditMode);
        });

        window.addEventListener('mousemove', App.AdminEditor.drag);
        window.addEventListener('mouseup', App.AdminEditor.endDrag);
        window.addEventListener('mouseleave', App.AdminEditor.endDrag);
    },

    shutdown: () => {
        const controls = App.AdminEditor.adminDOMElements;
        
        if (controls.addFloorBtn) controls.addFloorBtn.removeEventListener('click', App.AdminEditor.handleAddNewFloor);
        if (controls.deleteFloorBtn) controls.deleteFloorBtn.removeEventListener('click', App.AdminEditor.handleDeleteFloor);
        if (controls.setFloorLabelBtn) controls.setFloorLabelBtn.removeEventListener('click', App.AdminEditor.handleSetFloorLabel);
        if (controls.exportMapBtn) controls.exportMapBtn.removeEventListener('click', App.AdminEditor.handleExportMapData);
        if (controls.importMapInput) controls.importMapInput.removeEventListener('change', App.AdminEditor.handleImportMapData);

        if (controls.saveToDbBtn) {
            controls.saveToDbBtn.removeEventListener('click', App.AdminEditor.handleSaveMapToDatabase);
        }

        // NEW: Remove Listener for Upload
        if (controls.uploadForm) {
            controls.uploadForm.removeEventListener('submit', App.AdminEditor.handleUploadFloorImage);
        }

        controls.adminAddBtns.forEach(btn => {
            btn.removeEventListener('click', App.AdminEditor.handleSetEditMode);
        });

        window.removeEventListener('mousemove', App.AdminEditor.drag);
        window.removeEventListener('mouseup', App.AdminEditor.endDrag);
        window.removeEventListener('mouseleave', App.AdminEditor.endDrag);

        App.AdminEditor.setEditMode(null);
    },

    handleSetEditMode: (event) => {
        const btn = event.currentTarget;
        App.AdminEditor.setEditMode(btn);
    },

    setEditMode: (targetBtn) => {
        if (App.AdminEditor.isDragging) App.AdminEditor.endDrag();

        const btns = App.AdminEditor.adminDOMElements.adminAddBtns;
        
        if (!targetBtn) {
            App.AdminEditor.editMode = { mode: null, type: null, access: null, firstNodeId: null };
            btns.forEach(b => b.classList.remove('active'));
            App.AdminEditor._updateStatusText();
            App.Renderer.redrawMapElements();
            return;
        }

        const { mode, type, access } = targetBtn.dataset;

        btns.forEach(b => b.classList.remove('active'));
        targetBtn.classList.add('active');

        App.AdminEditor.editMode = { 
            mode, 
            type, 
            access, 
            firstNodeId: null 
        };
        
        App.AdminEditor._updateStatusText();
        App.Renderer.redrawMapElements();
    },

    handleMapClick: (evt) => {
        const targetId = evt.target.id;
        const targetNode = App.mapData.nodes.find(n => n.id === targetId);
        const { mode } = App.AdminEditor.editMode;

        if (!mode) return;

        if (mode === 'add') {
            if (targetNode) return;
            const pos = App.AdminEditor.getMousePosition(evt);
            App.AdminEditor._handleAddNode(pos);
        } else if (targetNode) {
            if (mode === 'connect') App.AdminEditor._handleConnectNode(targetNode);
            else if (mode === 'disconnect') App.AdminEditor._handleDisconnectNode(targetNode);
            else if (mode === 'delete-node') App.AdminEditor._handleDeleteNode(targetNode);
            else if (mode === 'rename-node') App.AdminEditor._handleRenameNode(targetNode);
        }
    },

    // 1. UPDATE THE UPLOAD FUNCTION
    handleUploadFloorImage: async (event) => {
        event.preventDefault();

        const fileInput = App.AdminEditor.adminDOMElements.floorImageInput;
        const file = fileInput.files[0];
        
        if (!file) {
            alert("Please select an image file first.");
            return;
        }

        const floorNum = App.State.currentFloor;
        const formData = new FormData();
        formData.append('floorImage', file);
        formData.append('floorNumber', floorNum);

        const status = App.AdminEditor.adminDOMElements.adminStatus;
        status.textContent = "Uploading image...";
        status.style.color = App.AdminEditor.constants.STATUS_COLORS.WARNING;

        try {
            // FIX: Point to PHP script instead of localhost:3000
            const response = await fetch('server-user/uploadFloorPlan.php', {
                method: 'POST',
                body: formData
                // Note: Don't set 'Content-Type', browser does it automatically for FormData
            });

            const result = await response.json();

            if (result.success) {
                status.textContent = "Floor plan uploaded!";
                status.style.color = App.AdminEditor.constants.STATUS_COLORS.SUCCESS;
                setTimeout(() => location.reload(), 1000);
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error(error);
            status.textContent = "Upload failed: " + error.message;
            status.style.color = App.AdminEditor.constants.STATUS_COLORS.ERROR;
        }
        
        fileInput.value = '';
    },

    handleAddNewFloor: () => {
        const existingFloors = [...new Set(App.mapData.nodes.map(n => n.floor))];
        let newFloorNum = existingFloors.length > 0 ? Math.max(...existingFloors) + 1 : 1;
        const lastFloorNum = newFloorNum - 1;

        let nodesAdded = 0;
        // Check for existing floor plans in JS memory (legacy)
        const lastFloorPlan = (App.mapData.floorPlans && App.mapData.floorPlans[lastFloorNum]) 
            ? App.mapData.floorPlans[lastFloorNum] : null;

        if (lastFloorNum > 0) {
            const copyNode = (node, suffix, name, newAccess) => {
                App.mapData.nodes.push({ 
                    id: `${suffix}-${newFloorNum}-${Date.now()}`, 
                    name: name, 
                    type: node.type, 
                    floor: newFloorNum, 
                    x: node.x, 
                    y: node.y, 
                    access: newAccess 
                });
                nodesAdded++;
            };

            const stairs = App.mapData.nodes.find(n => n.floor === lastFloorNum && n.type === 'stairs');
            const empElev = App.mapData.nodes.find(n => n.floor === lastFloorNum && n.type === 'elevator' && n.access === 'employee');
            const pubElev = App.mapData.nodes.find(n => n.floor === lastFloorNum && n.type === 'elevator' && n.access === 'all');
            
            if (stairs) copyNode(stairs, 'S', "Stairs", "all");
            if (empElev) copyNode(empElev, 'E-Emp', "Elevator (Emp)", "employee");
            if (pubElev) copyNode(pubElev, 'E-Pub', "Elevator", "all");
            
            if (lastFloorPlan) {
                if (!App.mapData.floorPlans) App.mapData.floorPlans = {};
                App.mapData.floorPlans[newFloorNum] = lastFloorPlan;
            }
        }

        if (nodesAdded === 0) {
            App.mapData.nodes.push({
                id: `H-${newFloorNum}-START`, name: "Hallway", type: "hallway",
                floor: newFloorNum, x: 400, y: 250, access: "all"
            });
        }

        App.AdminEditor.adminDOMElements.adminStatus.textContent = `Floor ${newFloorNum} added successfully!`;
        App.Renderer.switchFloor(newFloorNum);
    },

    handleDeleteFloor: () => {
        const floors = [...new Set(App.mapData.nodes.map(n => n.floor))];
        if (floors.length === 0) return;
        if (floors.length <= 1 && App.mapData.nodes.length > 0) {
            App.AdminEditor.adminDOMElements.adminStatus.textContent = "Cannot delete the last remaining floor.";
            return;
        }

        const label = App.AdminEditor._getFloorLabel(App.State.currentFloor);

        App.Modal.show(`Delete ${label}?`, "This will remove all nodes on this floor.", () => {
            const otherNodes = App.mapData.nodes.filter(n => n.floor !== App.State.currentFloor);
            const keepIds = new Set(otherNodes.map(n => n.id));

            App.mapData.nodes = otherNodes;
            App.mapData.edges = App.mapData.edges.filter(e => keepIds.has(e.source) && keepIds.has(e.target));

            if (App.mapData.floorPlans) delete App.mapData.floorPlans[App.State.currentFloor];
            if (App.mapData.floorLabels) delete App.mapData.floorLabels[App.State.currentFloor];

            App.Modal.hide();
            App.Renderer.populateSelectors();

            const remaining = [...new Set(App.mapData.nodes.map(n => n.floor))];
            App.Renderer.switchFloor(remaining.length > 0 ? Math.min(...remaining) : 1);
        });
    },

    handleSetFloorLabel: () => {
        if (!App.mapData.floorLabels) App.mapData.floorLabels = {};
        const curr = App.mapData.floorLabels[App.State.currentFloor] || `Floor ${App.State.currentFloor}`;
        const newLabel = prompt(`Enter display label for Floor ${App.State.currentFloor}:`, curr.replace('Floor ', ''));

        if (newLabel && newLabel.trim()) {
            App.mapData.floorLabels[App.State.currentFloor] = newLabel.trim();
        } else if (newLabel === '') {
            delete App.mapData.floorLabels[App.State.currentFloor];
        }
        App.Renderer.updateFloorButtons();
    },

    handleExportMapData: () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(App.mapData, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = "school_map_data.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
    },

    handleImportMapData: (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data && data.nodes && data.edges) {
                    App.mapData = data;
                    App.AdminEditor.adminDOMElements.adminStatus.textContent = "Map data imported successfully!";
                    App.Utils.buildGraphMap(); 
                    App.Renderer.populateSelectors();
                    App.Renderer.updateFloorButtons();
                    const first = App.mapData.nodes.length > 0 ? Math.min(...App.mapData.nodes.map(n => n.floor)) : 1;
                    App.Renderer.switchFloor(first);
                }
            } catch (err) {
                console.error(err);
                App.AdminEditor.adminDOMElements.adminStatus.textContent = "Error parsing JSON file.";
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    },

    // 2. UPDATE THE SAVE DATA FUNCTION
    handleSaveMapToDatabase: () => {
        const status = App.AdminEditor.adminDOMElements.adminStatus;
        if (!App.mapData.nodes.length) {
            status.textContent = "Error: No map data to save.";
            status.style.color = App.AdminEditor.constants.STATUS_COLORS.ERROR;
            return;
        }

        status.textContent = "Saving to database...";
        status.style.color = App.AdminEditor.constants.STATUS_COLORS.WARNING;

        // FIX: Ensure path is correct relative to your HTML
        fetch('server-user/saveMapData.php', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(App.mapData)
        })
        .then(r => r.json())
        .then(d => {
            status.textContent = d.message || (d.success ? "Map saved!" : "Failed to save.");
            status.style.color = d.success ? App.AdminEditor.constants.STATUS_COLORS.SUCCESS : App.AdminEditor.constants.STATUS_COLORS.ERROR;
        })
        .catch((e) => {
            console.error(e);
            status.textContent = "Error: Could not connect to server.";
            status.style.color = App.AdminEditor.constants.STATUS_COLORS.ERROR;
        })
        .finally(() => {
            setTimeout(() => {
                status.style.color = App.AdminEditor.constants.STATUS_COLORS.DEFAULT;
                App.AdminEditor._updateStatusText();
            }, 3000);
        });
    },

    startDrag: (evt, nodeId) => {
        if (App.AdminEditor.editMode.mode) return;

        evt.preventDefault();
        App.AdminEditor.isDragging = true;
        App.AdminEditor.draggedNodeId = nodeId;

        const pos = App.AdminEditor.getMousePosition(evt);
        const node = App.mapData.nodes.find(n => n.id === nodeId);
        
        App.AdminEditor.offset.x = pos.x - node.x;
        App.AdminEditor.offset.y = pos.y - node.y;

        document.body.classList.add('is-dragging');
    },

    drag: (evt) => {
        if (!App.AdminEditor.isDragging) return;
        evt.preventDefault();

        if (App.AdminEditor.dragAnimationFrame) cancelAnimationFrame(App.AdminEditor.dragAnimationFrame);

        App.AdminEditor.dragAnimationFrame = requestAnimationFrame(() => {
            const pos = App.AdminEditor.getMousePosition(evt);
            const node = App.mapData.nodes.find(n => n.id === App.AdminEditor.draggedNodeId);

            if (!node) {
                App.AdminEditor.endDrag();
                return;
            }

            node.x = Math.round(pos.x - App.AdminEditor.offset.x);
            node.y = Math.round(pos.y - App.AdminEditor.offset.y);

            App.Renderer.redrawMapElements();
        });
    },

    endDrag: () => {
        if (!App.AdminEditor.isDragging) return;
        if (App.AdminEditor.dragAnimationFrame) cancelAnimationFrame(App.AdminEditor.dragAnimationFrame);

        App.AdminEditor.isDragging = false;
        App.AdminEditor.draggedNodeId = null;
        document.body.classList.remove('is-dragging');
    },

    getMousePosition: (evt) => {
        const CTM = App.AdminEditor.adminDOMElements.mapSvg.getScreenCTM();
        return {
            x: (evt.clientX - CTM.e) / CTM.a,
            y: (evt.clientY - CTM.f) / CTM.d
        };
    },

    _getFloorLabel: (floorNum) => {
        return (App.mapData.floorLabels && App.mapData.floorLabels[floorNum])
            ? App.mapData.floorLabels[floorNum]
            : `Floor ${floorNum}`;
    },
    
    _generateNewNodeName: (type, access) => {
        if (type === 'stairs') return 'Stairs';
        if (type === 'hallway') return 'Hallway';
        if (type === 'elevator') return (access === 'employee') ? 'Elevator (Emp)' : 'Elevator';
        return `New ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    },

    _updateStatusText: () => {
        const { mode, type } = App.AdminEditor.editMode;
        let text = 'Drag nodes to move them or select an action.';
        let cursor = 'default';

        if (mode) {
            if (mode === 'add') {
                text = `Click map to add new ${type}.`;
                cursor = 'crosshair';
            } else if (mode === 'connect') {
                text = `Click first node to connect.`;
                cursor = 'pointer';
            } else if (mode === 'disconnect') {
                text = `Click first node to disconnect.`;
                cursor = 'pointer';
            } else if (mode === 'delete-node') {
                text = `Click a node to delete it.`;
                cursor = 'pointer';
            } else if (mode === 'rename-node') {
                text = `Click a room to rename it.`;
                cursor = 'pointer';
            }
        }
        App.AdminEditor.adminDOMElements.adminStatus.textContent = text;
        App.AdminEditor.adminDOMElements.mapSvg.style.cursor = cursor;
    },

    _handleAddNode: (pos) => {
        const { type, access } = App.AdminEditor.editMode;
        const floor = App.State.currentFloor;
        const newNode = {
            id: `${type.charAt(0).toUpperCase()}-${floor}-${Date.now()}`,
            name: App.AdminEditor._generateNewNodeName(type, access),
            type: type,
            floor: floor,
            x: Math.round(pos.x),
            y: Math.round(pos.y),
            access: access || 'all'
        };
        App.mapData.nodes.push(newNode);

        const nodesOnFloor = App.mapData.nodes.filter(n => n.floor === floor && n.id !== newNode.id);
        if (nodesOnFloor.length > 0) {
            let closest = null, min = Infinity;
            nodesOnFloor.forEach(n => {
                const dist = Math.hypot(n.x - newNode.x, n.y - newNode.y);
                if (dist < min) { min = dist; closest = n; }
            });
            if (closest) App.mapData.edges.push({ source: newNode.id, target: closest.id });
        }

        if (newNode.type === 'room') App.Renderer.populateSelectors();
        App.Renderer.redrawMapElements();
    },

    _handleConnectNode: (targetNode) => {
        const editMode = App.AdminEditor.editMode;
        const status = App.AdminEditor.adminDOMElements.adminStatus;

        if (!editMode.firstNodeId) {
            editMode.firstNodeId = targetNode.id;
            status.textContent = `Selected ${targetNode.name}. Select second node.`;
        } else {
            if (editMode.firstNodeId === targetNode.id) return;
            const firstNode = App.mapData.nodes.find(n => n.id === editMode.firstNodeId);

            if (firstNode.floor !== targetNode.floor) {
                const isStairs = firstNode.type === 'stairs' && targetNode.type === 'stairs';
                const isElevator = firstNode.type === 'elevator' && targetNode.type === 'elevator';
                if (!isStairs && !isElevator) {
                    status.textContent = "Error: Cross-floor links must be matching Stairs or Elevators.";
                    setTimeout(() => { 
                         App.AdminEditor.editMode.firstNodeId = null; 
                         App.AdminEditor._updateStatusText(); 
                    }, 2000);
                    return;
                }
            }

            App.mapData.edges.push({ source: editMode.firstNodeId, target: targetNode.id });
            status.textContent = `Connected ${firstNode.name} and ${targetNode.name}!`;
            editMode.firstNodeId = null; 
            App.Utils.buildGraphMap();
        }
        App.Renderer.redrawMapElements();
    },

    _handleDisconnectNode: (targetNode) => {
        const editMode = App.AdminEditor.editMode;
        const status = App.AdminEditor.adminDOMElements.adminStatus;

        if (!editMode.firstNodeId) {
            editMode.firstNodeId = targetNode.id;
            status.textContent = `Selected ${targetNode.name}. Click second node to disconnect.`;
        } else {
            if (editMode.firstNodeId === targetNode.id) return;
            const firstId = editMode.firstNodeId;
            const prevCount = App.mapData.edges.length;

            App.mapData.edges = App.mapData.edges.filter(e =>
                !((e.source === firstId && e.target === targetNode.id) || (e.source === targetNode.id && e.target === firstId))
            );

            status.textContent = (App.mapData.edges.length < prevCount) 
                ? `Disconnected.` : `No connection found.`;
            
            editMode.firstNodeId = null;
            App.Utils.buildGraphMap();
        }
        App.Renderer.redrawMapElements();
    },

    _handleDeleteNode: (targetNode) => {
        App.Modal.show(`Delete ${targetNode.name}?`, 'This will remove the node and connections.', () => {
            App.mapData.nodes = App.mapData.nodes.filter(n => n.id !== targetNode.id);
            App.mapData.edges = App.mapData.edges.filter(e => e.source !== targetNode.id && e.target !== targetNode.id);

            if (targetNode.type === 'room') App.Renderer.populateSelectors();
            App.Utils.buildGraphMap();
            App.Renderer.redrawMapElements();
            App.Modal.hide();
        });
    },

    _handleRenameNode: (targetNode) => {
        if (targetNode.type !== 'room') {
            App.AdminEditor.adminDOMElements.adminStatus.textContent = 'Only rooms can be renamed.';
            return;
        }
        const newName = prompt(`Enter new name for "${targetNode.name}":`, targetNode.name);
        if (newName && newName.trim()) {
            targetNode.name = newName.trim();
            App.Renderer.redrawMapElements();
            App.Renderer.populateSelectors();
        }
    }
};