window.App = {
    mapData: { nodes: [], edges: [] },
    adjacencyList: new Map()
};

function initializeApp() {
    App.DOM = {
        findPathBtn: document.getElementById('findPathBtn'),
        mapSvg: document.getElementById('mapSvg'),
        pathContainer: null,
        edgeContainer: null,
        nodeContainer: null,
        mapContainer: document.getElementById('mapContainer'),
        pathInstructions: document.getElementById('pathInstructions'),
        adminPanel: document.getElementById('adminPanel'),
        adminStatus: document.getElementById('adminStatus'),
        floorSelector: document.getElementById('floorSelector'),
        modal: document.getElementById('confirmationModal'),
        modalTitle: document.getElementById('modalTitle'),
        modalMessage: document.getElementById('modalMessage'),
        modalCancelBtn: document.getElementById('modalCancelBtn'),
        modalConfirmBtn: document.getElementById('modalConfirmBtn'),
        roleSelector: document.getElementById('roleSelector'),
        selectedStartDisplay: document.getElementById('selectedStartDisplay'),
        selectedEndDisplay: document.getElementById('selectedEndDisplay'),
        mapLegendHeader: document.getElementById('mapLegendHeader'),
        mainContentWrapper: document.getElementById('mainContentWrapper')
    };

    App.Config = {
        ROOM_RADIUS: 7,
        HALLWAY_RADIUS: 5,
        CONNECTOR_RADIUS: 10,
        EDGE_STROKE: '#4A5568',
        EDGE_STROKE_WIDTH: 2,
        STAIR_WEIGHT: 15,
        ELEVATOR_WEIGHT: 25,
        DEFAULT_VIEWBOX: '0 0 800 500',
        UPDATE_POLL_INTERVAL: 5000
    };

    App.State = {
        currentFloor: 1,
        currentRole: 'student',
        isAdminLoggedIn: false, 
        modalConfirmCallback: null,
        selectedStartId: null,
        selectedEndId: null,
        mapLastUpdated: null,
        updateInterval: null
    };

    App.Utils = {
        buildGraphMap: () => {
            App.adjacencyList.clear();
            App.mapData.nodes.forEach(node => App.adjacencyList.set(node.id, []));
            App.mapData.edges.forEach(edge => {
                if (App.adjacencyList.has(edge.source)) App.adjacencyList.get(edge.source).push(edge.target);
                if (App.adjacencyList.has(edge.target)) App.adjacencyList.get(edge.target).push(edge.source);
            });
        }
    };

    App.Modal = {
        show: (title, message, onConfirm) => {
            App.DOM.modalTitle.textContent = title;
            App.DOM.modalMessage.textContent = message;
            App.State.modalConfirmCallback = onConfirm;
            App.DOM.modal.style.display = 'flex';
        },
        hide: () => {
            App.DOM.modal.style.display = 'none';
            App.State.modalConfirmCallback = null;
        }
    };

    App.RoleManager = {
        roles: {
            'student': { label: 'Student', isNodeAccessible: (node) => node.access !== 'employee' },
            'pwd-student': { label: 'PWD Student', isNodeAccessible: (node) => node.type !== 'stairs' && node.access !== 'employee' },
            'employee': { label: 'Employee', isNodeAccessible: () => true },
            'admin': { label: 'Admin', isNodeAccessible: () => true }
        },

        setRole: (newRole) => {
            if (!App.RoleManager.roles[newRole]) return;
            
            App.State.currentRole = newRole;
            const isAdmin = (newRole === 'admin');
            
            if (isAdmin) {
                if (App.DOM.mainContentWrapper) App.DOM.mainContentWrapper.classList.remove('justify-center');
                if (typeof App.AdminEditor !== 'undefined') App.AdminEditor.init();
            } else {
                if (App.DOM.mainContentWrapper) App.DOM.mainContentWrapper.classList.add('justify-center');
                if (typeof App.AdminEditor !== 'undefined') App.AdminEditor.shutdown();
            }

            App.DOM.adminPanel.classList.toggle('hidden', !isAdmin);

            document.querySelectorAll('.role-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.role === newRole);
            });

            App.Pathfinder.clearHighlights();
            App.Renderer.redrawMapElements();
        },

        isNodeAccessible: (node) => {
            const strategy = App.RoleManager.roles[App.State.currentRole];
            return strategy ? strategy.isNodeAccessible(node) : false;
        }
    };

    App.Renderer = {
        createRoleButtons: () => {
            App.DOM.roleSelector.innerHTML = '';
            const fragment = document.createDocumentFragment();
            Object.entries(App.RoleManager.roles).forEach(([roleId, roleData]) => {
                if (roleId === 'admin' && !App.State.isAdminLoggedIn) {
                    return; 
                }

                const button = document.createElement('button');
                button.textContent = roleData.label;
                button.className = 'role-btn';
                button.dataset.role = roleId;
                button.onclick = () => App.RoleManager.setRole(roleId);
                fragment.appendChild(button);
            });
            App.DOM.roleSelector.appendChild(fragment);
        },

        updateFloorButtons: () => {
            App.DOM.floorSelector.innerHTML = '';
            const floors = [...new Set(App.mapData.nodes.map(n => n.floor))].sort((a,b) => a-b);
            const fragment = document.createDocumentFragment();
            
            floors.forEach(floorNum => {
                const label = (App.mapData.floorLabels && App.mapData.floorLabels[floorNum]) ? App.mapData.floorLabels[floorNum] : `Floor ${floorNum}`;
                const button = document.createElement('button');
                button.textContent = label;
                button.className = `px-4 py-2 rounded-md text-sm font-medium transition ${App.State.currentFloor === floorNum ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`;
                button.onclick = () => App.Renderer.switchFloor(floorNum);
                fragment.appendChild(button);
            });
            App.DOM.floorSelector.appendChild(fragment);
        },

        switchFloor: (floorNum) => {
            if (!App.mapData.nodes.some(n => n.floor === floorNum)) {
                 const floors = [...new Set(App.mapData.nodes.map(n => n.floor))].sort((a,b) => a-b);
                 floorNum = floors.length > 0 ? floors[0] : 1;
            }
            App.State.currentFloor = floorNum;

            App.DOM.mapContainer.style.opacity = '0';
            setTimeout(() => {
                App.Renderer.loadFloorVisuals();
                App.Renderer.updateFloorButtons();
                App.DOM.mapContainer.style.opacity = '1';
            }, 300);
        },
        
        populateSelectors: () => {
             if (App.mapData.nodes.filter(n => n.type === 'room').length === 0) {
                App.Pathfinder.clearHighlights();
             }
        },

        updatePathUI: () => {
            const getFloorLabel = (floorNum) => (App.mapData.floorLabels && App.mapData.floorLabels[floorNum]) ? App.mapData.floorLabels[floorNum] : `F${floorNum}`;
            const startNode = App.mapData.nodes.find(n => n.id === App.State.selectedStartId);
            const endNode = App.mapData.nodes.find(n => n.id === App.State.selectedEndId);

            App.DOM.selectedStartDisplay.textContent = startNode ? `${startNode.name} (${getFloorLabel(startNode.floor)})` : 'None';
            App.DOM.selectedEndDisplay.textContent = endNode ? `${endNode.name} (${getFloorLabel(endNode.floor)})` : 'None';
            
            if (!startNode) {
                App.DOM.pathInstructions.innerHTML = '<p class="text-gray-500">Click a room on the map to select a start point.</p>';
            } else if (!endNode) {
                App.DOM.pathInstructions.innerHTML = '<p class="text-gray-500">Click a room on the map to select a destination.</p>';
            }
        },
 
       drawMapElements: (floor) => {
            const isAdmin = App.State.currentRole === 'admin';
            const nodeMap = new Map(App.mapData.nodes.map(n => [n.id, n]));
            
            const nodesToDraw = App.mapData.nodes.filter(n => n.floor === floor);
            const edgesToDraw = App.mapData.edges.filter(edge => {
                const s = nodeMap.get(edge.source);
                const t = nodeMap.get(edge.target);
                return s && t && s.floor === floor && t.floor === floor;
            });

            const edgeFragment = document.createDocumentFragment();
            edgesToDraw.forEach(edge => {
                const s = nodeMap.get(edge.source);
                const t = nodeMap.get(edge.target);
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', s.x); 
                line.setAttribute('y1', s.y);
                line.setAttribute('x2', t.x); 
                line.setAttribute('y2', t.y);
                line.setAttribute('stroke', App.Config.EDGE_STROKE); 
                line.setAttribute('stroke-width', App.Config.EDGE_STROKE_WIDTH);
                line.classList.add('edge');
                edgeFragment.appendChild(line);
            });
            App.DOM.edgeContainer.appendChild(edgeFragment);

            const nodeFragment = document.createDocumentFragment();
            nodesToDraw.forEach(node => {
                const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                group.setAttribute('id', `g-${node.id}`);
                group.classList.add('node-label-group');
                
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('id', node.id); 
                circle.setAttribute('cx', node.x); 
                circle.setAttribute('cy', node.y);
                
                let radius;
                if (node.type === 'room') radius = App.Config.ROOM_RADIUS;
                else if (node.type === 'hallway') radius = App.Config.HALLWAY_RADIUS;
                else radius = App.Config.CONNECTOR_RADIUS;
                
                circle.setAttribute('r', radius);
                
                let nodeClass = `node ${node.type}`;
                
                if (isAdmin) {
                    nodeClass += ' draggable';
                    if (typeof App.AdminEditor !== 'undefined' && App.AdminEditor.editMode.firstNodeId === node.id) {
                        nodeClass += ' selected-for-action';
                    }
                } else {
                    if (node.type === 'room') nodeClass += ' path-selectable';
                    if (node.id === App.State.selectedStartId) nodeClass += ' start-node-selected';
                    else if (node.id === App.State.selectedEndId) nodeClass += ' end-node-selected';
                }

                if (node.type === 'elevator' && node.access === 'employee') nodeClass += ' elevator-employee';
                circle.setAttribute('class', nodeClass);
                group.appendChild(circle);

               if (node.type === 'room') {
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    text.setAttribute('x', node.x); 
                    text.setAttribute('y', Number(node.y) + 20);
                    text.setAttribute('class', 'node-label'); 
                    text.style.pointerEvents = 'none';
                    text.textContent = node.name; 
                    group.appendChild(text);
                }
                
                if(isAdmin && typeof App.AdminEditor !== 'undefined') {
                    group.addEventListener('mousedown', (e) => { 
                        e.stopPropagation(); 
                        if (App.AdminEditor.editMode.mode) App.AdminEditor.handleMapClick(e);
                        else App.AdminEditor.startDrag(e, node.id); 
                    });
                } else if (!isAdmin) {
                    group.addEventListener('click', (e) => {
                        e.stopPropagation();
                        App.Pathfinder.handleNodeSelection(node.id);
                    });
                }
                nodeFragment.appendChild(group);
            });
            App.DOM.nodeContainer.appendChild(nodeFragment);
        },
        
      redrawMapElements: () => {
            if (!App.DOM.nodeContainer || !App.DOM.edgeContainer) return;
            App.DOM.nodeContainer.innerHTML = '';
            App.DOM.edgeContainer.innerHTML = '';
            App.Renderer.drawMapElements(App.State.currentFloor);
        },

        loadFloorVisuals: () => {
            App.DOM.mapSvg.innerHTML = '';
            const floor = App.State.currentFloor;
            
            if (!App.mapData.nodes.some(n => n.floor === floor)) {
                 App.DOM.mapSvg.setAttribute('viewBox', App.Config.DEFAULT_VIEWBOX);
                 App.DOM.mapSvg.innerHTML = '<text x="400" y="250" text-anchor="middle" fill="white" font-size="20">No floors exist. Add a floor in admin panel.</text>';
                 return;
            }

            const imageEl = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            App.DOM.mapSvg.appendChild(imageEl);

            App.DOM.pathContainer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            App.DOM.pathContainer.setAttribute('id', 'path-container');
            App.DOM.mapSvg.appendChild(App.DOM.pathContainer);
            
            App.DOM.edgeContainer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            App.DOM.edgeContainer.setAttribute('id', 'edge-container');
            App.DOM.mapSvg.appendChild(App.DOM.edgeContainer);
            
            App.DOM.nodeContainer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            App.DOM.nodeContainer.setAttribute('id', 'node-container');
            App.DOM.mapSvg.appendChild(App.DOM.nodeContainer);
            
            const dataUrl = (App.mapData.floorPlans && App.mapData.floorPlans[floor]) ? App.mapData.floorPlans[floor] : null;

            if (!dataUrl) {
                App.DOM.mapSvg.setAttribute('viewBox', App.Config.DEFAULT_VIEWBOX);
                App.Renderer.drawMapElements(floor);
                return;
            }

            const img = new Image();
            img.onload = () => {
                App.DOM.mapSvg.setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
                imageEl.setAttribute('href', img.src);
                imageEl.setAttribute('x', '0');
                imageEl.setAttribute('y', '0');
                imageEl.setAttribute('width', img.naturalWidth);
                imageEl.setAttribute('height', img.naturalHeight);
                App.Renderer.drawMapElements(floor);
            };
            
            img.onerror = () => {
                App.DOM.mapSvg.setAttribute('viewBox', App.Config.DEFAULT_VIEWBOX);
                App.Renderer.drawMapElements(floor);
            };
            img.src = dataUrl;
        }
    };
    
    App.Pathfinder = {
        getWeight: (sourceNode, targetNode) => {
            if (sourceNode.floor !== targetNode.floor) {
                if (sourceNode.type === 'stairs' && targetNode.type === 'stairs') return App.Config.STAIR_WEIGHT;
                if (sourceNode.type === 'elevator' && targetNode.type === 'elevator') return App.Config.ELEVATOR_WEIGHT;
                return Infinity;
            }
            
            if (sourceNode.type === 'stairs' || targetNode.type === 'stairs') return App.Config.STAIR_WEIGHT;
            if (sourceNode.type === 'elevator' || targetNode.type === 'elevator') return App.Config.ELEVATOR_WEIGHT;
        
            const dist = Math.hypot(sourceNode.x - targetNode.x, sourceNode.y - targetNode.y) / 10;
            return Math.max(1, Math.round(dist));
        },

        findShortestPath: (startId, endId) => {
            const distances = {};
            const previous = {};
            const pq = new Map();
            const nodeMap = new Map(App.mapData.nodes.map(n => [n.id, n]));
            
            App.mapData.nodes.forEach(node => { 
                distances[node.id] = Infinity; 
                previous[node.id] = null; 
            });
            
            distances[startId] = 0; 
            pq.set(startId, 0);
            
            const isAccessible = App.RoleManager.isNodeAccessible;

            while (pq.size > 0) {
                let closestNodeId = null; 
                let minDistance = Infinity;
                for (const [nodeId, dist] of pq) { 
                    if (dist < minDistance) { 
                        minDistance = dist; 
                        closestNodeId = nodeId; 
                    } 
                }

                if (closestNodeId === endId || closestNodeId === null || distances[closestNodeId] === Infinity) break;
                
                pq.delete(closestNodeId);
                const closestNode = nodeMap.get(closestNodeId);

                if (!isAccessible(closestNode)) continue;
                
                const neighbors = App.adjacencyList.get(closestNodeId) || [];
                
                for (const neighborId of neighbors) {
                    const neighborNode = nodeMap.get(neighborId);
                    if (!neighborNode || !isAccessible(neighborNode)) continue;
                    
                    const newDist = distances[closestNodeId] + App.Pathfinder.getWeight(closestNode, neighborNode);
                    
                    if (newDist < distances[neighborId]) {
                        distances[neighborId] = newDist;
                        previous[neighborId] = closestNodeId;
                        pq.set(neighborId, newDist);
                    }
                }
            }
            
            const path = []; 
            let currentNode = endId;
            while (currentNode) { 
                path.unshift(currentNode); 
                currentNode = previous[currentNode]; 
            }
            
            return path[0] === startId ? path : null;
        },

        highlightStep: (fromId, toId) => {
            document.querySelectorAll('.step-highlight').forEach(el => el.classList.remove('step-highlight'));
            const fromEl = document.getElementById(fromId);
            const toEl = document.getElementById(toId);
            if (fromEl) fromEl.classList.add('step-highlight');
            if (toEl) toEl.classList.add('step-highlight');
        },

        handleFindPath: () => {
            App.Pathfinder.clearHighlights(false);
            const startId = App.State.selectedStartId;
            const endId = App.State.selectedEndId;
            
            if (!startId || !endId) { 
                App.DOM.pathInstructions.innerHTML = '<p class="text-yellow-400">Please select start and end locations from the map.</p>'; 
                return; 
            }
            if (startId === endId) { 
                App.DOM.pathInstructions.innerHTML = '<p class="text-yellow-400">Start and end cannot be the same.</p>'; 
                return; 
            }
            
            const path = App.Pathfinder.findShortestPath(startId, endId);
            
            if (path) { 
                App.Pathfinder.animatePath(path, 0);
            } else { 
                App.DOM.pathInstructions.innerHTML = '<p class="text-red-400">No path found. The route may be restricted.</p>'; 
            }
        },
        
        handleNodeSelection: (nodeId) => {
            const node = App.mapData.nodes.find(n => n.id === nodeId);
            if (!node || node.type !== 'room') return;

            App.Pathfinder.clearHighlights(false);

            if (!App.State.selectedStartId) {
                App.State.selectedStartId = nodeId;
            } else if (!App.State.selectedEndId) {
                if (nodeId === App.State.selectedStartId) App.State.selectedStartId = null;
                else App.State.selectedEndId = nodeId;
            } else {
                App.State.selectedStartId = nodeId;
                App.State.selectedEndId = null;
            }

            App.Renderer.updatePathUI();
            App.Renderer.redrawMapElements();
        },

        animatePath: (path, pathIndex) => {
            if (pathIndex === 0) { 
                App.DOM.pathInstructions.innerHTML = '<ol id="instructionList" class="list-decimal list-inside"></ol>'; 
            }
            if (pathIndex >= path.length) return;
            
            const startNode = App.mapData.nodes.find(n => n.id === path[pathIndex]);
            if (!startNode) return;
            
            App.Renderer.switchFloor(startNode.floor);
            
            setTimeout(() => {
                let segment = []; 
                let nextFloor = -1;
                
                for (let i = pathIndex; i < path.length; i++) {
                    const currentNode = App.mapData.nodes.find(n => n.id === path[i]);
                    if (currentNode.floor === startNode.floor) segment.push(path[i]);
                    else { 
                        nextFloor = currentNode.floor;
                        break; 
                    }
                }
                
                App.Pathfinder.drawSegment(segment);
                
                if (nextFloor !== -1) { 
                    App.Pathfinder.animatePath(path, pathIndex + segment.length); 
                }
            }, 500);
        },

       drawSegment: (segment) => {
            if (segment.length === 0) return;
            
            const instructionList = document.getElementById('instructionList');
            if (!instructionList) return;

            if (segment.length > 1) {
                const points = segment
                    .map(nodeId => {
                        const node = App.mapData.nodes.find(n => n.id === nodeId);
                        return node ? `${node.x},${node.y}` : null;
                    })
                    .filter(Boolean)
                    .join(' ');
                    
                const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                polyline.setAttribute('points', points);
                polyline.setAttribute('class', 'path');
               App.DOM.pathContainer.appendChild(polyline);
            }
            
            segment.forEach(nodeId => { 
                if (nodeId === App.State.selectedStartId || nodeId === App.State.selectedEndId) return;
                const nodeEl = document.getElementById(nodeId); 
                if (nodeEl) nodeEl.classList.add('highlight'); 
            });
            
            const fragment = document.createDocumentFragment();
            for(let i = 0; i < segment.length - 1; i++){
                const stepFrom = App.mapData.nodes.find(n => n.id === segment[i]);
                const stepTo = App.mapData.nodes.find(n => n.id === segment[i+1]);
                
                if (stepFrom.type === 'hallway' && stepTo.type === 'hallway') continue;
                
                const li = document.createElement('li');
                li.innerHTML = `Go from <strong>${stepFrom.name}</strong> to <strong>${stepTo.name}</strong>`;
                li.dataset.fromId = stepFrom.id;
                li.dataset.toId = stepTo.id;
                li.classList.add('route-step'); 
                li.addEventListener('click', () => App.Pathfinder.highlightStep(stepFrom.id, stepTo.id));
                fragment.appendChild(li);
            }
            instructionList.appendChild(fragment);
        },
        
        clearHighlights: (clearSelections = true) => {
            document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
            document.querySelectorAll('.step-highlight').forEach(el => el.classList.remove('step-highlight'));
            
            if (App.DOM.pathContainer) App.DOM.pathContainer.innerHTML = '';
            
            App.DOM.pathInstructions.innerHTML = '<p class="text-gray-500">Select a start and end point to see the route.</p>';

            if (clearSelections) {
                App.State.selectedStartId = null;
                App.State.selectedEndId = null;
                App.Renderer.updatePathUI();
            }
            App.Renderer.redrawMapElements();
        }
    };

    App.UpdateChecker = {
        poll: () => {
           
            fetch('server-user/getMapVersion.php')
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (!data || !data.lastUpdated) return;

                    if (!App.State.mapLastUpdated) {
                        App.State.mapLastUpdated = data.lastUpdated;
                    } else if (data.lastUpdated > App.State.mapLastUpdated) {
                        App.UpdateChecker.showUpdateBar();
                        if (App.State.updateInterval) clearInterval(App.State.updateInterval);
                    }
                })
                .catch(err => console.warn(err));
        },
        
        showUpdateBar: () => {
            if (document.getElementById('update-bar')) return;

            const updateBar = document.createElement('div');
            updateBar.id = 'update-bar';
            updateBar.textContent = 'Map has been updated by an admin. Page will refresh...';
            Object.assign(updateBar.style, {
                position: 'fixed', top: '0', left: '0', width: '100%',
                backgroundColor: '#3182CE', color: 'white', padding: '1rem',
                textAlign: 'center', zIndex: '10000', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            });
            
            document.body.appendChild(updateBar);
            setTimeout(() => location.reload(), 2500);
        }
    };

    App.init = async () => {
        try {
            const response = await fetch('http://localhost:3000/api/admin/check-session', {
                credentials: 'include' 
            });
            const data = await response.json();
            App.State.isAdminLoggedIn = data.isAdmin;
            
            if (App.State.isAdminLoggedIn) {
                App.DOM.adminPanel.classList.remove('hidden');
            }
        } catch (err) {
            App.State.isAdminLoggedIn = false;
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            if (App.State.isAdminLoggedIn) {
                logoutBtn.textContent = "Logout";
                logoutBtn.classList.add('bg-red-700', 'hover:bg-red-800');
            } else {
                logoutBtn.textContent = "Home";
                logoutBtn.classList.remove('bg-red-700', 'hover:bg-red-800'); 
            }

            logoutBtn.addEventListener('click', async () => {
                if (App.State.isAdminLoggedIn) {
                    try {
                        await fetch('http://localhost:3000/api/logout', { 
                            method: 'POST',
                            credentials: 'include'
                        });
                    } catch (e) { console.error(e); }
                }
                window.location.href = 'index.html';
            });
        }

        App.DOM.findPathBtn.addEventListener('click', App.Pathfinder.handleFindPath);
        App.DOM.modalCancelBtn.addEventListener('click', App.Modal.hide);
        App.DOM.modalConfirmBtn.addEventListener('click', () => {
            if (App.State.modalConfirmCallback) App.State.modalConfirmCallback();
        });

        if (App.DOM.mapLegendHeader) {
            App.DOM.mapLegendHeader.addEventListener('click', () => {
                const legend = document.getElementById('mapLegend');
                if (legend) legend.classList.toggle('collapsed');
            });
        }

        App.DOM.mapSvg.addEventListener('click', (e) => {
            if (App.State.currentRole === 'admin' && typeof App.AdminEditor !== 'undefined') {
                if (App.AdminEditor.isDragging) return;
                const tag = e.target.tagName.toLowerCase();
                if (tag === 'svg' || tag === 'image') App.AdminEditor.handleMapClick(e);
            }
        });
        
        App.Utils.buildGraphMap();
        App.Renderer.populateSelectors();
        App.Renderer.createRoleButtons();
        App.Renderer.updateFloorButtons();
        App.Renderer.switchFloor(1);
        
        if (App.State.currentRole === 'admin' && !App.State.isAdminLoggedIn) {
            App.State.currentRole = 'student';
        }
        
        App.RoleManager.setRole(App.State.currentRole);
        App.Renderer.updatePathUI();

        if (App.State.currentRole !== 'admin') {
           App.State.updateInterval = setInterval(App.UpdateChecker.poll, App.Config.UPDATE_POLL_INTERVAL);
        }
    };
    
    App.init();
}

document.addEventListener('DOMContentLoaded', () => {

   fetch('server-user/getData.php')
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            App.mapData = data;
            initializeApp();
        })
        .catch(error => {
            console.error("Error loading map data:", error);
            const mapSvg = document.getElementById('mapSvg');
            if (mapSvg) {
                mapSvg.innerHTML = 
                    `<text x="400" y="250" text-anchor="middle" fill="red" font-size="20">
                        Error loading map data. Please check console.
                    </text>`;
            }
        });
});