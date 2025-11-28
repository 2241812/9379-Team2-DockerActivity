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
        uploadForm: document.getElementById('uploadForm')
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
        controls.addFloorBtn.addEventListener('click', App.AdminEditor.handleAddNewFloor);
        controls.deleteFloorBtn.addEventListener('click', App.AdminEditor.handleDeleteFloor);
        controls.setFloorLabelBtn.addEventListener('click', App.AdminEditor.handleSetFloorLabel);
        controls.exportMapBtn.addEventListener('click', App.AdminEditor.handleExportMapData);
        controls.importMapInput.addEventListener('change', App.AdminEditor.handleImportMapData);

        if (controls.saveToDbBtn) {
            controls.saveToDbBtn.addEventListener('click', App.AdminEditor.handleSaveMapToDatabase);
        }

        if (controls.uploadForm) {
            controls.uploadForm.addEventListener('submit', App.AdminEditor.handleUploadFloorPlan);
        }

        controls.adminAddBtns.forEach(btn => {
            btn.addEventListener('click', App.AdminEditor.handleSetEditMode);
        });

        window.addEventListener('mousemove', App.AdminEditor.drag);
        window.addEventListener('mouseup', App.AdminEditor.endDrag);
        window.addEventListener('mouseleave', App.AdminEditor.endDrag);
    },

    shutdown: () => {
    
        window.removeEventListener('mousemove', App.AdminEditor.drag);
        window.removeEventListener('mouseup', App.AdminEditor.endDrag);
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
        App.AdminEditor.editMode = { mode, type, access, firstNodeId: null };
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

    handleAddNewFloor: () => {
        const existingFloors = [...new Set(App.mapData.nodes.map(n => n.floor))];
        let newFloorNum = existingFloors.length > 0 ? Math.max(...existingFloors) + 1 : 1;
        App.mapData.nodes.push({
            id: `H-${newFloorNum}-START`, name: "Hallway", type: "hallway",
            floor: newFloorNum, x: 400, y: 250, access: "all"
        });
        App.AdminEditor.adminDOMElements.adminStatus.textContent = `Floor ${newFloorNum} added successfully!`;
        App.Renderer.switchFloor(newFloorNum);
    },

    handleDeleteFloor: () => {
        const floors = [...new Set(App.mapData.nodes.map(n => n.floor))];
        if (floors.length <= 1 && App.mapData.nodes.length > 0) return;
        App.Modal.show(`Delete Floor ${App.State.currentFloor}?`, "This will remove all nodes on this floor.", () => {
            App.mapData.nodes = App.mapData.nodes.filter(n => n.floor !== App.State.currentFloor);
            // Also clean up edges
            const validIds = new Set(App.mapData.nodes.map(n => n.id));
            App.mapData.edges = App.mapData.edges.filter(e => validIds.has(e.source) && validIds.has(e.target));
            App.Modal.hide();
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
                    App.Renderer.switchFloor(1);
                }
            } catch (err) { console.error(err); }
        };
        reader.readAsText(file);
    },

    // --- FIX: Point to Node.js Server (Port 3000) ---
    handleSaveMapToDatabase: () => {
        const status = App.AdminEditor.adminDOMElements.adminStatus;
        if (!App.mapData.nodes.length) {
            status.textContent = "Error: No map data to save.";
            status.style.color = App.AdminEditor.constants.STATUS_COLORS.ERROR;
            return;
        }

        status.textContent = "Saving to database...";
        status.style.color = App.AdminEditor.constants.STATUS_COLORS.WARNING;

        // FIXED URL: Using absolute path to Node server
        fetch('http://localhost:3000/api/admin/save-map', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', // Important for Session Cookie
            body: JSON.stringify(App.mapData)
        })
        .then(r => r.json())
        .then(d => {
            status.textContent = d.message || (d.success ? "Map saved!" : "Failed to save.");
            status.style.color = d.success ? App.AdminEditor.constants.STATUS_COLORS.SUCCESS : App.AdminEditor.constants.STATUS_COLORS.ERROR;
        })
        .catch((e) => {
            console.error(e);
            status.textContent = "Error: Could not connect to Node.js server (Port 3000).";
            status.style.color = App.AdminEditor.constants.STATUS_COLORS.ERROR;
        })
        .finally(() => {
            setTimeout(() => {
                status.style.color = App.AdminEditor.constants.STATUS_COLORS.DEFAULT;
                App.AdminEditor._updateStatusText();
            }, 3000);
        });
    },

    handleUploadFloorPlan: (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        formData.append('floorNumber', App.State.currentFloor);

        fetch('http://localhost:3000/api/admin/upload-floorplan', {
            method: 'POST',
            credentials: 'include',
            body: formData
        })
        .then(r => r.json())
        .then(data => {
            alert(data.message);
            if(data.success) location.reload();
        })
        .catch(err => console.error(err));
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
            if (!node) { App.AdminEditor.endDrag(); return; }
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
            if (mode === 'add') { text = `Click map to add new ${type}.`; cursor = 'crosshair'; }
            else if (mode === 'connect') { text = `Click first node to connect.`; cursor = 'pointer'; }
            else if (mode === 'disconnect') { text = `Click first node to disconnect.`; cursor = 'pointer'; }
            else if (mode === 'delete-node') { text = `Click a node to delete it.`; cursor = 'pointer'; }
            else if (mode === 'rename-node') { text = `Click a room to rename it.`; cursor = 'pointer'; }
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
            App.mapData.edges.push({ source: editMode.firstNodeId, target: targetNode.id });
            status.textContent = `Connected!`;
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
            status.textContent = `Selected ${targetNode.name}. Click second node.`;
        } else {
            if (editMode.firstNodeId === targetNode.id) return;
            const firstId = editMode.firstNodeId;
            App.mapData.edges = App.mapData.edges.filter(e =>
                !((e.source === firstId && e.target === targetNode.id) || (e.source === targetNode.id && e.target === firstId))
            );
            status.textContent = `Disconnected.`;
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
        if (targetNode.type !== 'room') return;
        const newName = prompt(`Enter new name:`, targetNode.name);
        if (newName && newName.trim()) {
            targetNode.name = newName.trim();
            App.Renderer.redrawMapElements();
            App.Renderer.populateSelectors();
        }
    }
};