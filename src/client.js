/**
 * @fileoverview File containing the client's primary logic, loaded with the site.
 * @package
 */

import * as uuid from 'uuid';

import "Modules/leaflet/dist/leaflet-src.esm";
import "Modules/leaflet.polylinemeasure/Leaflet.PolylineMeasure.js";
import "Modules/leaflet-realtime/dist/leaflet-realtime.js";
import "Modules/leaflet.heat/dist/leaflet-heat.js";
import "Modules/leaflet.heat/src/HeatLayer.js";
import "Modules/simpleheat/simpleheat.js";

import * as gen from "Scripts/my-general.js";
import * as map from "Scripts/my-leaflet.js";
import * as mqtt from "Scripts/my-mqtt.js";
import * as mapLayersControl from "Scripts/menus/menu-layer-control.js";
import * as subSystemsControl from "Scripts/menus/menu-subsystem-control.js";
import * as chainHeaderControl from "Scripts/menus/menu-chain-control.js";

/** Collection defining the data model. */
var dataTable = {};

/** Collection of visual layers applied to the view. */
var layerTable = {};

/** Origin of the primary sensor the view is locked to. */
var origin = {};

/** Selected chain ID on broker side. */
var selectedChainId = "";

/** All chains on broker. */
var availableChains = [];

/** Flag indicating whether the panel with the active subsystem parameters is extended. */
var isMenuOpen = false;

/** Flag indicating whether the edit-only panel with the subsystem settings is extended. */
var isSettingsOpen = false;

/** Flag indicating whether the panel with the list of visual layers is extended. */
var isLayersPanelOpen = false;

/** Flag read from the site cookies to indicate whether the site is connected to Azure, needed to specify which WMS to connect to (as Azure hosted sites demand the use of an Azure hosted WMS). */
var isAzure = document.cookie
    ? (document.cookie.match(new RegExp('(^| )isAzure=([^;]+)')))[2] === 'true'
    : false;

/** Initialize the map substrate on initial load. */
map.initialize();

/** Initialize the measurement functionalities to the loaded substrate. */
map.measureLine.initialize(map.obj, 'measure-toggle');

/** Initialize the IndexedDb to read the user parameters as set for the local client. */
mapLayersControl.initializeIdb()
    .then(() => mapLayersControl.addOrUpdate('Base', 'Setup', 'World Map')
        .then(mapLayersControl.getIdbEntry('Base.Setup.WorldMap')
            .then(l => map.tiles.initialize(map.obj, 'Base.Setup.WorldMap', l.opacity, l.isVisible, localStorage.isDayMode === 'true', isAzure))));

/** Toggle view between the light toned day mode and dark night mode. */
window.setViewMode = checkbox => {
    localStorage.isDayMode = checkbox.checked;
    let isDayMode = localStorage.isDayMode === 'true';
    document.getElementById('day-night-mode-toggle-default').checked = isDayMode;
    document.getElementById('day-night-mode-toggle-edit').checked = isDayMode;
    let themeClass = 'theme-' + (checkbox.checked ? 'light' : 'dark');
    document.body.className = themeClass;
    let svgs = document.getElementsByTagName("object");
    for (let i = 0; i < svgs.length; i++) {
        if (svgs[i]) {
            let element = svgs[i]
                .contentDocument;
            if (element)
                element
                    .getElementsByTagName('svg')[0]
                    .setAttribute('class', themeClass);
        }
    }

    map.tiles.setMap(map.obj, 'Base.Setup.WorldMap', isDayMode, isAzure);
}

/** Reapply the active primary chain ID to the window from the currently selected chain. */
window.localChainSelected = chainId =>
    selectChain(chainId);

/**
 * Adds a new processing chain to the system, these chains can then be used to
 * connect sub-systems in a logical to accomplish certain outcomes. These
 * structures is strongly sequential, describing a single processing path (i.e.
 * concurrent processing will require multiple chains).
 */
window.localChainAdded = () =>
    addNewChain();

/**
 * Remove processing chain from the system, unlinking the connected subsystems
 * and removing the layer descriptions and queuing these for permanent removal
 * on the subsequent save.
 */
window.removeLocalChain = e =>
    removeChain(e.parentElement.id.slice(0, 32));

/** Event handling for a particular layer visibility being toggled. */
document.viewLayerToggled = (chainId, subSystemId, layerId, isChecked) => {
    let key = `${chainId}.${subSystemId}.${layerId}`;
    mapLayersControl.setIsVisible(key, isChecked);

    if (layerId === 'WorldMap') {
        map.tiles.setIsVisible(key, isChecked);
    }
    else if (chainId === selectedChainId) {
        if (layerId === 'Rosette') {
            map.rosette.setIsVisible(key, isChecked);
            return;
        }

        let type = layerTable[key].type;
        if (type === 'HeatMap')
            map.heatMap.setIsVisible(key, isChecked);
        else if (type === 'Plot')
            map.plots.setIsVisible(key, isChecked);
        else if (type === 'Strobe')
            map.strobes.setIsVisible(key, isChecked);
        else if (type === 'Track')
            map.tracks.setIsVisible(key, isChecked);
    }
}

/**
 * Changes the UI view to the edit state, expanding the settings menu panels to
 * allow for interaction with usually restricted controls (e.g. the specific
 * broker, manipulating the processing chains structures and defining the
 * location associated with a chain).
 */
window.openSettings = () => {
    isSettingsOpen = true;
    setNav();
}

/**
 * Archives system and UI settings to (respectively) the broker and local IndexedDB,
 * as defined in the current views. After this archival is completed the view then
 * reverts to the basic expanded panel view.
 */
window.saveSettings = () => {
    mqtt.unSubAll();
    mapLayersControl.saveSettings();
    subSystemsControl.saveSettings();
    chainHeaderControl.saveSettings();
    mqtt.saveSettings();

    // HACK: Reload ensures layer opacities set and topics resubscribed, but also
    //       circumvents potentially aberrant behaviour with successive saves.
    setTimeout(() => location.reload(), 1500);
}

/**
 * Resets changes made since last executing a save, re-applying the archived system
 * and UI settings to the current views.
 */
window.undoChanges = () => {
    mqtt.clear();
    selectedChainId = "";
    mqtt.sub('AvailableChains');
}

/**
 * Toggle between the minified and expanded view, which exposes the specific
 * controls that subsystem provide to the user.
 */
window.toggleNav = () => {
    isMenuOpen = !isMenuOpen;
    setNav();
}

/**
 * Expands the panel that allows for toggling the visibility of currently
 * registered map canvas layers.
 */
window.toggleLayersPanel = () => {
    isLayersPanelOpen = !isLayersPanelOpen;
    setNav();
    document.getElementById('layers-toggle')
        .className = isLayersPanelOpen ? 'selected-map-button-style' : 'map-button-style';
}

/** Set main parameters from defaults or stored settings and add service workers on page load event. */
window.addEventListener('load', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker
            .register('/service-worker.js')
            .then(pass => console.log('SW pass: ', pass))
            .catch(fail => console.log('SW fail: ', fail));
    };

    document.getElementById('day-night-mode-toggle-default').checked = (localStorage.isDayMode === 'true');
    document.getElementById('day-night-mode-toggle-edit').checked = (localStorage.isDayMode === 'true');

    document.body.setAttribute('class', 'theme-' +
        (localStorage.isDayMode === 'true'
            ? 'light'
            : 'dark'));

    mqtt.setup(localStorage.brokerProtocol, localStorage.brokerHostname, localStorage.brokerPort);
    mqtt.register(routingLogic);

    checkDateTimeLoop();
    mqtt.sub('AvailableChains');
    setNav();
});

/** Basic routing of broker messages, note that the order of initialization is meaningful. */
const routingLogic = (topic, payload) => {
    if (topic === 'AvailableChains') {
        // Get all configured chains.
        availableChains = JSON.parse(payload);
        mqtt.sub('SelectedChain');
    }
    else if (topic === 'SelectedChain') {
        // Initialized the necessary controls and subscriptions based on selected chain.
        let msg = JSON.parse(payload);
        if ((selectedChainId !== "") &&
            (selectedChainId !== msg.id)) {
            // HACK: Reload ensures that all of the app resources are refreshed
            //       and set as expected.
            setTimeout(() => location.reload(), 1500);
        }

        document.getElementById("access-settings-button")
            .setAttribute("class", msg.isRunning ? 'disabled-button-style' : 'general-button-style');

        mqtt.sub('AvailableSubSystems/+/Status');
        mqtt.sub('AvailableSubSystems/+/Definition');

        if (selectedChainId === "") {
            selectedChainId = msg.id;
            chainHeaderControl.setSelectedChain(selectedChainId, msg.isRunning);
            subSystemsControl.setSelectedChain(selectedChainId);
            mapLayersControl.setSelectedChain(selectedChainId);
            for (let index in availableChains)
                mqtt.sub(`Chains/${availableChains[index]}/Setup/#`);
        }
        else {
            chainHeaderControl.setIsRunning(selectedChainId, msg.isRunning)
        }
    }
    else if (topic.startsWith('Chains/') && topic.endsWith('/Setup')) {
        if (payload.length <= 0)
            return;

        let msg = JSON.parse(payload);
        let chainId = topic.slice(7, 39);
        chainHeaderControl.addOrUpdate(chainId, msg);
        // Set up map from indicated origin.
        chainHeaderControl.setLabel(chainId, msg.label);
        chainHeaderControl.setSensorOrigin(chainId, msg.origin, msg.range);
        origin[chainId] = [msg.origin.latitude, msg.origin.longitude];
        if (chainId === selectedChainId)
            map.setCameraDefault(origin[chainId], msg.range);
        let layerId = `${chainId}.Setup.Rosette`;
        mapLayersControl.addOrUpdate(chainId, 'Setup', 'Rosette')
            .then(mapLayersControl.getIdbEntry(layerId)
                .then(l => {
                    if (chainId === selectedChainId)
                        map.rosette.initialize(map.obj, layerId, origin[chainId], msg.range, l.opacity, l.isVisible);
                }));
    }
    else if (topic.startsWith(`Chains/`) && topic.endsWith('/Setup/SubSystems')) {
        // Initialize subscription to sub-systems associated with the selected chain.
        let msg = JSON.parse(payload);
        let chainId = topic.slice(7, 39);
        let numberOfSubSystems = msg.length;
        for (let i = 0; i < numberOfSubSystems; i++) {
            let subSystemId = msg[i];
            subSystemsControl.add(chainId, subSystemId, false);
            mqtt.sub(`Chains/${chainId}/SubSystems/${subSystemId}/Outgoing`);
            mqtt.sub(`Chains/${chainId}/SubSystems/${subSystemId}/Controls/#`);
            if (chainId === selectedChainId) {
                mqtt.sub(`Chains/${selectedChainId}/SubSystems/${subSystemId}/Rates`);
                mqtt.sub(`Chains/${selectedChainId}/SubSystems/${subSystemId}/Incoming`);
            }
        }
    }
    else if (topic.startsWith('AvailableSubSystems/') && topic.endsWith('/Status')) {
        // Initialized the necessary controls and subscriptions based on selected chain.
        let rate = String(payload);
        let subSystemId = topic.slice(20, -7);
        subSystemsControl.setState(selectedChainId, subSystemId, rate);
    }
    else if (topic.startsWith('AvailableSubSystems/') && topic.endsWith('/Definition')) {
        // Link sub-system specific GUID to label name for user representation.
        let subSystemId = topic.slice(20, -11);
        let msg = JSON.parse(payload);
        mapLayersControl.setParentLabel(selectedChainId, subSystemId, msg.label);
        subSystemsControl.setLabel(selectedChainId, subSystemId, msg.label);
        subSystemsControl.setAvailableDataStreams(subSystemId, msg.streams);
    }
    else if (topic.startsWith(`Chains/`) && topic.includes(`/SubSystems/`) && topic.endsWith('/Outgoing')) {
        // Subscribe to data topics.
        let msg = JSON.parse(payload);
        let chainId = topic.slice(7, 39);
        let subSystemId = topic.slice(-41, -9);
        subSystemsControl.setEndpoint(chainId, subSystemId, msg);
        // if (endpoint.topics &&
        //     (chainId === selectedChainId))
        //     for (let i = 0; i < endpoint.topics.length; i++)
        mqtt.sub(`Chains/${selectedChainId}/SubSystems/${subSystemId}/Data/+/Interpretation`);
    }
    else if (topic.startsWith(`Chains/${selectedChainId}/SubSystems/`) && topic.endsWith('/Incoming')) {
        // Subscribe to subsystem incoming data channel setup topics.
        let msg = JSON.parse(payload);
        let subSystemId = topic.slice(-41, -9);
        if (((msg.protocol === 'MQTT') || (msg.protocol === 'MQTTS') || (msg.protocol === 'TCP')) && msg.source)
            subSystemsControl.setIncomingData(selectedChainId, subSystemId, msg);
    }
    else if (topic.startsWith(`Chains/`) && topic.includes(`/SubSystems/`) && topic.includes('/Controls/')) {
        // Subscribe subsystem control setup.
        let msg = JSON.parse(payload);
        let chainId = topic.slice(7, 39);
        let subSystemId = topic.slice(-74, -42);
        let controlId = topic.slice(-32, topic.length);
        if (chainId === selectedChainId)
            subSystemsControl.addOrUpdateChildren(chainId, subSystemId, controlId, msg);
    }
    else if (topic.startsWith(`Chains/`) && topic.includes(`/SubSystems/`) && topic.endsWith('/Interpretation')) {
        // Setup layer views.
        let msg = JSON.parse(payload);
        let chainId = topic.slice(7, 39);
        let subSystemId = topic.slice(topic.indexOf('/SubSystems/') + 12, topic.indexOf('/Data'));
        let layerKey = topic.slice(topic.indexOf('/Data/') + 6, topic.indexOf('/Interpretation'));
        let layerId = `${chainId}.${subSystemId}.${layerKey}`;
        let dataTopic = `${topic.split('Interpretation')[0]}Records`;
        subSystemsControl.setDataStreamLayouts(selectedChainId, subSystemId, msg);
        dataTable[dataTopic] = { type: msg.display, layerId: layerId };
        layerTable[layerId] = { type: msg.display };
        if (msg.display === 'HeatMap') {
            mapLayersControl.addOrUpdate(chainId, subSystemId, layerKey)
                .then(mapLayersControl.getIdbEntry(layerId)
                    .then(l => {
                        if (l && (chainId === selectedChainId))
                            map.heatMap.initialize(map.obj, layerId, origin[chainId], msg, l.opacity, l.isVisible);
                    })
                    .then(() => {
                        if (chainId === selectedChainId)
                            mqtt.sub(dataTopic);
                    }));
        }
        else if (msg.display === 'Plot') {
            mapLayersControl.addOrUpdate(chainId, subSystemId, layerKey)
                .then(mapLayersControl.getIdbEntry(layerId)
                    .then(l => {
                        if (l && (chainId === selectedChainId))
                            map.plots.initialize(map.obj, layerId, origin[chainId], msg, l.opacity, l.isVisible);
                    })
                    .then(() => {
                        if (chainId === selectedChainId)
                            mqtt.sub(dataTopic);
                    }));
        }
        else if (msg.display === 'Strobe') {
            mapLayersControl.addOrUpdate(chainId, subSystemId, layerKey)
                .then(mapLayersControl.getIdbEntry(layerId)
                    .then(l => {
                        if (l && (chainId === selectedChainId))
                            map.strobes.initialize(map.obj, layerId, origin[chainId], msg, l.opacity, l.isVisible);
                    })
                    .then(() => {
                        if (chainId === selectedChainId)
                            mqtt.sub(dataTopic);
                    }));
        }
        else if (msg.display === 'Track') {
            mapLayersControl.addOrUpdate(chainId, subSystemId, layerKey)
                .then(mapLayersControl.getIdbEntry(layerId)
                    .then(l => {
                        if (l && (chainId === selectedChainId))
                            map.tracks.initialize(map.obj, layerId, origin[chainId], msg, l.opacity, l.isVisible);
                    })
                    .then(() => {
                        if (chainId === selectedChainId)
                            mqtt.sub(dataTopic);
                    }));
        }
    }
    else if (topic.startsWith(`Chains/${selectedChainId}/SubSystems/`) && topic.endsWith('/Records')) {
        // Data interpretation (assume csv)
        let packets = String(payload).split(/\r?\n/);
        let layerId = dataTable[topic].layerId;

        if (dataTable[topic].type === 'HeatMap') {
            for (let i = 0; i < packets.length; i++)
                map.heatMap.enqueue(layerId, packets[i]);
        }
        else if (dataTable[topic].type === 'Plot') {
            for (let i = 0; i < packets.length; i++)
                map.plots.enqueue(layerId, packets[i]);
        }
        else if (dataTable[topic].type === 'Strobe') {
            for (let i = 0; i < packets.length; i++)
                map.strobes.enqueue(layerId, packets[i]);
        }
        else if (dataTable[topic].type === 'Track') {
            for (let i = 0; i < packets.length; i++)
                map.tracks.enqueue(layerId, packets[i]);
        }
    }
    else if (topic.startsWith(`Chains/${selectedChainId}/SubSystems/`) && topic.endsWith('/Rates')) {
        // Refresh sub-system rate display from updated data.
        let msg = JSON.parse(payload);
        subSystemsControl.setRateMask(selectedChainId, topic.slice(-38, -6), msg.total);
    }
}

/**
 * Keeps the UI date/time display up to date be polling the system time at a
 * defined interval.
 */
function checkDateTimeLoop() {
    document.getElementById('timeView').textContent = gen.getFormattedDateTime();
    setTimeout(checkDateTimeLoop, 250);
}

/**
 * Locally adds a new chain to the available signal chains in the system.
 */
function addNewChain() {
    let chainId = uuid.v4().replace(/-/gi, '');
    availableChains.push(chainId);
    chainHeaderControl.addOrUpdate(chainId, {
        label: "",
        origin: {
            lat: 0.0,
            lng: 0.0
        }
    });

    mapLayersControl.addOrUpdate(chainId, 'Setup', 'Rosette');

    if (!selectedChainId) {
        selectedChainId = chainId;
        window.localChainSelected(chainId);
    }
}

/**
 * Locally remove a chain, its subsystems and visual layers from the system.
 */
function removeChain(chainId) {
    let index = availableChains.indexOf(chainId);
    if (index > -1)
        availableChains.splice(index, 1);

    if (availableChains.length <= 0)
        addNewChain();

    if ((availableChains.length <= 1) ||
        (selectedChainId === chainId))
        selectChain(availableChains[0]);

    subSystemsControl.removeAllSubSystemsFromChain(chainId);
    mapLayersControl.removeAllLayersFromChain(chainId);
    chainHeaderControl.remove(chainId);
}

/**
 * Selects a chain from the collection of available chains as the new active chain.
 */
function selectChain(chainId) {
    chainHeaderControl.setSelectedChain(chainId, false);
    subSystemsControl.setSelectedChain(chainId);
    mapLayersControl.setSelectedChain(chainId);

    // mqtt.pubObj('SelectedChain', {"id":chainId,"isRunning":false});
    setNav();
}

/**
 * Apply the specific view setup by the currently applied UI states 
 * ({@link isSettingsOpen}, {@link isMenuOpen} and {@link isLayersPanelOpen}).
 */
function setNav() {
    document.getElementById('add-new-chain-to-clean-broker-button').style.visibility =
        !isSettingsOpen
            ? 'collapse'
            : selectedChainId
                ? 'collapse'
                : 'visible';

    document.getElementById('subsystem-items-stack-available').style.visibility =
        !isSettingsOpen
            ? 'collapse'
            : selectedChainId
                ? 'visible'
                : 'collapse';

    document.getElementById('system-controls-collapsed').style.visibility =
        isSettingsOpen
            ? 'collapse'
            : isMenuOpen
                ? 'collapse'
                : 'visible';

    document.getElementById('system-controls-default').style.visibility =
        isSettingsOpen
            ? 'collapse'
            : isMenuOpen
                ? 'visible'
                : 'collapse';

    document.getElementById('system-controls-edit').style.visibility =
        isSettingsOpen
            ? 'visible'
            : 'collapse';

    document.getElementById('map-layers-panel-default').style.visibility =
        isSettingsOpen
            ? 'collapse'
            : isLayersPanelOpen
                ? 'visible'
                : 'collapse';

    document.getElementById('map-layers-panel-edit').style.visibility =
        isSettingsOpen
            ? 'visible'
            : 'collapse';
}