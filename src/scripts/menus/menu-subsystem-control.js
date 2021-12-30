/**
 * @fileoverview Logic of functionalities that apply to the menu panel for the subsystems under the active chain.
 * @package
 */

import * as mqtt from "Scripts/my-mqtt.js";
import * as gen from "Scripts/my-general.js";

/** Interval to refresh view elements indicating sub-system status. [milliseconds] */
const STATUS_REFRESH_INTERVAL = 2_000;

/** Interval after which an element is considered to no longer be present. [milliseconds] */
const STATUS_TIMEOUT_INTERVAL = 3_000;

// /** Sub-system edit card control height. */
// const FULL_HEIGHT = 216;

/** Fallback rate-mask to use at startup, or where a sub-system has timed out. */
const EMPTY_RATE_MASK = '000000';

/** Identifying name of the element containing the sub-system control cards (as in the HTML). */
const DEFAULT_VIEW_CONTAINER_NAME = "subsystem-items-stack-default";

/** Identifying name of the element containing the sub-system control cards in edit mode (as in the HTML). */
const EDIT_VIEW_CONTAINER_NAME = "subsystem-items-stack-edit";

/** Identifying name of the element containing the sub-system control cards in edit mode (as in the HTML). */
const AVAILABLE_VIEW_CONTAINER_NAME = "subsystem-items-stack-available";

/** Unique identifier of the processing chain that is currently in use. */
var selectedChainId = "";

/** Internal dictionary describing the current data context of configured sub-systems. */
var context = {};

/** Dictionary of arrays indicating the ordering of sub-system elements within the available chains (will get built as accessed by the user and may be empty for those chain that have not been accessed in the current session). */
var ordering = {};

/** Dictionary of available sub-systems, as determined from those sub-systems actively broadcasting to the configured broker during the current session. */
var available = {};

/** Topics that need to be cleaned out on the broker next time the settings are saved. */
var purgedTopics = [];

/**
 * Class holding the basic implementation for a subsystem that may or have been available for interaction.
 */
class SubSystem {
    constructor(chainId, subSystemId) {
        this.chainId = chainId ?? '';
        this.subSystemId = subSystemId ?? '';
        this.name = name ?? '-';
        this.isUiAdded = false;
        this.rateMask = EMPTY_RATE_MASK;
        this.endpoint = {};
        this.controls = {};
        this.dataStreams = {};
    }
}

/**
 * Class holding the basic implementation for broadcasting subsystems that may added to the signal chains.
 */
class Available {
    constructor(name, poller) {
        this.name = name;
        this.streamKeys = []
        this.poller = poller;
        this.state = gen.State.UNKNOWN;
        this.lastUpdated = Date.now();
        this.isControlLoaded = false;
        this.isInCurrentChain = false;
    }
}

/** Event handler on adding a new subsystem from the broadcasting subsystems, wires the subsystem in at the end of the signal chain. */
document.addSubSystemToChain = subSystemId =>
    add(selectedChainId, subSystemId, DEFAULT_VIEW_CONTAINER_NAME, EDIT_VIEW_CONTAINER_NAME, true);

/** Event handler on removing a new subsystem from the broadcasting subsystems, un-wires the subsystem from the signal chain. */
document.removeSubSystemFromChain = (chainId, subSystemId) =>
    remove(chainId, subSystemId);

/** Event handler on control initialized, with guaranteed control load, effect properties as appropriate (required due to loading order of subscribed messages). */
document.subSystemControlLoaded = (chainId, subSystemId, viewTag) => {
    if (available[subSystemId])
        refreshAvailableView(subSystemId);

    if (!chainId)
        return;

    let key = getKey(chainId, subSystemId);
    if (context[key]) {
        if (viewTag === 'Edit') {
            setLabelView(key, viewTag, context[key].name);
            setEndpointView(key, viewTag, context[key].endpoint);
            if (available[subSystemId])
                refreshAllOrderIndicators(chainId);
        }
        if (viewTag === 'Default') {
            setLabelView(key, viewTag, context[key].name);
            setRateMaskView(key, viewTag, context[key].rateMask);
            if (available[subSystemId])
                setStateView(key, viewTag, available[subSystemId].state);
        }
    }
}

// document.availableSubSystemLoaded = e => refreshAvailableView(e.subSystemId);

/** Event handler on selecting the calling subsystem header, to expand or contract the subsystem details. */
document.subSystemControlsExpanderClicked = (chainId, subSystemId, viewTag, isExpanded) => {
    let key = getKey(chainId, subSystemId);
    let viewKey = `${key}.${viewTag}`;
    let checkElement =  document.getElementById(`${viewKey}.control-panel-container`);
    if (checkElement)
        checkElement
            .style
            .display = isExpanded
                ? 'block'
                : 'none';
}

/** Event handler on selecting the up-arrow on the subsystem card, to move the subsystem up in the list of registered subsystems. */
document.moveSubSystemUpwards = (chainId, subSystemId) => {
    moveSubSystemUpInChain(chainId, subSystemId);
    refreshAllOrderIndicators(chainId);
    refreshAvailableView(chainId);
}

/** Event handler on selecting the down-arrow on the subsystem card, to move the subsystem down in the list of registered subsystems. */
document.moveSubSystemDownwards = (chainId, subSystemId) => {
    moveSubSystemDownInChain(chainId, subSystemId);
    refreshAllOrderIndicators(chainId);
    refreshAvailableView(chainId);
}

/** Event handler on textbox content set, uses element key to identify the originating subsystem and control key, then publishes update to the MQTT broker. */
document.sendTextBoxGroup = viewKey => {
    let parts = viewKey.split('.');
    let updatedMsg = context[getKey(parts[0], parts[1])].controls[parts[4]];

    updatedMsg.value = document.getElementById(viewKey).value;

    mqtt.pubObj(
        `Chains/${parts[0]}/SubSystems/${parts[1]}/Controls/${parts[4]}`,
        updatedMsg);
}

/** Event handler on radio button in group selected, uses element key to identify the originating subsystem and control key, then publishes update to the MQTT broker. */
document.sendRadioButtonGroup = (viewKey, selected) => {
    let parts = viewKey.split('.');
    let updatedMsg = context[getKey(parts[0], parts[1])].controls[parts[4]];

    updatedMsg.selected = selected;

    mqtt.pubObj(
        `Chains/${parts[0]}/SubSystems/${parts[1]}/Controls/${parts[4]}`,
        updatedMsg);
}

/** Event handler on checkbox selected, uses element key to identify the originating subsystem and control key, then publishes update to the MQTT broker. */
document.sendCheckBoxGroup = (viewKey, index, isChecked) => {
    let parts = viewKey.split('.');
    let updatedMsg = context[getKey(parts[0], parts[1])].controls[parts[4]];

    updatedMsg.items[index].isChecked = isChecked;

    mqtt.pubObj(
        `Chains/${parts[0]}/SubSystems/${parts[1]}/Controls/${parts[4]}`,
        updatedMsg);
}

/** Event handler on slider value changed, uses element key to identify the originating subsystem and control key, then publishes update to the MQTT broker. */
document.sendSliderGroup = viewKey => {
    let parts = viewKey.split('.');
    let updatedMsg = context[getKey(parts[0], parts[1])].controls[parts[4]];

    updatedMsg.value = document.getElementById(viewKey).value;

    mqtt.pubObj(
        `Chains/${parts[0]}/SubSystems/${parts[1]}/Controls/${parts[4]}`,
        updatedMsg);
}

// GENERAL

/**
 * Builds a formatted key from the indicated chain ID and subsystem ID.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @returns Properly formatted key.
 */
function getKey(chainId, subSystemId) {
    return `${chainId}.${subSystemId}.SubSystemControls`;
}

/**
 * Set active chain as indicated.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 */
function setSelectedChain(chainId) {
    if (selectedChainId &&
        selectedChainId !== '')
        pullCurrentSetupFromView(selectedChainId);

    clear();
    selectedChainId = chainId;

    let chainSubSystems = Object.values(Object.keys(context).filter(k => k.startsWith(selectedChainId)));
    for (let i in chainSubSystems) {
        let subSystemId = chainSubSystems[i].slice(33, 65);
        addDefaultView(selectedChainId, subSystemId);
        addEditView(selectedChainId, subSystemId);
    }
};

/**
 * Remove special characters from specified string.
 * @param {string} name - String which potentially contains special characters.
 * @returns Name without any special characters.
 */
function getSanitized(name) {
    return name ? name.replace(/\s+/g, '') : name;
}

/**
 * Retrieve the current setup as defined from view to ensure that the client data model is in sync with the view (typically used on save).
 * @param {string} chainId - Unique identifier of a configured processing chain.
 */
function pullCurrentSetupFromView(chainId) {
    let key = '';
    let subSystemIds = [];
    let endpoints = [];
    let subSystems = Object.values(Object.values(document.getElementById(EDIT_VIEW_CONTAINER_NAME).childNodes)
        .filter(k => k.id.startsWith(chainId))
        .reduce((s, k) => {
            let p = k.id.split('.');
            (s[p[1]] = s[p[1]] ?? [])
                .push(p);
            return s;
        }, {}));

    subSystems.forEach(s => {
        Object.values(s).forEach(t => {
            key = getKey(t[0], t[1]);
            subSystemIds.push(t[1]);

            let viewKey = `${key}.Edit`;
            let checkElement = document.getElementById(viewKey);
            if (checkElement) {
                context[key].endpoint = {
                    protocol: "",
                    ip: "127.0.0.1",
                    port: 9001,
                    topics: []
                };

                if (context[key].endpoint !== {}) {
                    let protocolView = document.getElementById(`${viewKey}.address-protocol-content`)
                    if (protocolView)
                        context[key].endpoint.protocol = protocolView.value;
                    let ipView = document.getElementById(`${viewKey}.address-hostname-content`)
                    if (ipView)
                        context[key].endpoint.ip = ipView.value;
                    let portView = document.getElementById(`${viewKey}.address-port-content`)
                    if (portView)
                        context[key].endpoint.port = parseInt(portView.value);
                }

                let elements = checkElement.childNodes[2].elements[`active-topics-${key}`];

                context[key].endpoint.topics = elements && elements.values
                    ? Array.from(elements, e => e.id.split('.')[3])
                    : elements
                        ? [elements.id.split('.')[3]]
                        : [];

                context[key].endpoint.selectedTopic = elements && elements.values && elements[elements.value]
                    ? elements[elements.value].id.split('.')[3]
                    : elements && elements.id
                        ? elements.id.split('.')[3]
                        : undefined

                endpoints.push(context[key].endpoint);
            }
        });
    });
}

/**
 * Save global settings
 */
async function saveSettings() {
    pullCurrentSetupFromView(selectedChainId);

    purgedTopics.forEach(t =>
        mqtt.pubClear(t));

    let key = '';
    let subSystems = {};
    let availableChains = [];

    Object.keys(context).forEach(c => {
        let chainId = c.split('.')[0];
        if ((chainId != "") &&
            availableChains.indexOf(chainId) < 0)
            availableChains.push(chainId)
    });

    for (let i in availableChains) {
        let chainId = availableChains[i];
        let subSystemIds = [];

        if (!ordering[chainId])
            return;

        subSystems = Object.values(ordering[chainId]
            .filter(k => k.startsWith(chainId))
            .reduce((s, k) => {
                let p = k.split('.');
                (s[p[1]] = s[p[1]] ?? [])
                    .push(p);
                return s;
            }, {}));

        subSystems.forEach(s => {
            Object.values(s).forEach(t => {
                key = getKey(t[0], t[1]);
                subSystemIds.push(t[1]);
                let outgoing = {};
                let endpoint = context[key].endpoint;

                if ((endpoint !== {}) &&
                    (endpoint.protocol !== "")) {
                    outgoing = {
                        protocol: endpoint.protocol,
                        ip: endpoint.ip,
                        port: endpoint.port,
                        topics: endpoint.protocol === 'MQTT' || endpoint.protocol === 'MQTTS'
                            ? endpoint.topics
                            : [endpoint.selectedTopic]
                    };
                }

                mqtt.pubObj(
                    `Chains/${t[0]}/SubSystems/${t[1]}/Outgoing`,
                    outgoing);
            });
        });

        for (let j in subSystemIds) {
            let incoming = {};

            if (j > 0) {
                key = getKey(chainId, subSystemIds[j - 1]);
                let previousEndpoint = context[key].endpoint;
                incoming = {
                    protocol: previousEndpoint.protocol,
                    ip: previousEndpoint.ip,
                    port: previousEndpoint.port,
                    topics: [previousEndpoint.selectedTopic]
                };

                incoming.source = subSystemIds[j - 1];

                if (previousEndpoint && previousEndpoint.selectedTopic) {
                    if (previousEndpoint.selectedTopic in context[key].dataStreams)
                        incoming.layout = context[key].dataStreams[previousEndpoint.selectedTopic].layout;
                    else
                        context[key].dataStreams[previousEndpoint.selectedTopic] = {};
                    context[key].dataStreams[previousEndpoint.selectedTopic].incoming = incoming;
                }
            }

            // Set incoming to outgoing of previous subsystem in chain.
            mqtt.pubObj(
                `Chains/${chainId}/SubSystems/${subSystemIds[j]}/Incoming`,
                incoming);
        }

        mqtt.pubObj(
            `Chains/${chainId}/Setup/SubSystems`,
            subSystemIds);//.filter((o, i) => subSystemIds.indexOf(o) !== i));
    }
}

// ADD

/**
 * Logic allowing for subsystem add/update functionality.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {Boolean} isUiAdded - True if control was added directly from the UI, False to indicates addition by message otherwise.
 */
function add(chainId, subSystemId, isUiAdded) {
    if (!ordering[chainId])
        ordering[chainId] = [];

    refreshAvailableView(subSystemId);

    if (!chainId)
        return;

    let key = getKey(chainId, subSystemId);

    if (ordering[chainId].indexOf(key) !== -1)
        return;

    if (!context[key])
        context[key] = new SubSystem(chainId, subSystemId);

    context[key].isUiAdded = isUiAdded;
    context[key].name = available[subSystemId] ? available[subSystemId].name : "";
    ordering[chainId].push(key);

    if (chainId === selectedChainId) {
        addDefaultView(chainId, subSystemId);
        addEditView(chainId, subSystemId);
        setEndpoint(chainId, subSystemId, {
            protocol: "MQTT",
            ip: "127.0.0.1",
            port: "1883",
            topics: available[subSystemId] ? available[subSystemId].streamKeys : []
        });
        refreshAllOrderIndicators(chainId);
    }
}

/**
 * Add/update the default usage control card for the specified subsystem.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 */
function addDefaultView(chainId, subSystemId) {
    let viewTag = 'Default';
    let key = getKey(chainId, subSystemId);
    let viewKey = `${key}.${viewTag}`;
    let checkElement = document.getElementById(viewKey);
    if (!checkElement) {
        document.getElementById(DEFAULT_VIEW_CONTAINER_NAME).innerHTML +=
            `<div id='${key}.${viewTag}' class='group-style'>` +
                `<label class='header-section-style' for='${viewKey}.expander-toggle'>` +
                    `<label id="${viewKey}.label-content" for='${viewKey}.expander-toggle' class="subsystem-label-style">${(available[subSystemId] ? available[subSystemId].name : "")}</label>` +
                    `<input id='${viewKey}.expander-toggle'` +
                        `class='expander-toggle-style'` +
                        `onclick='document.subSystemControlsExpanderClicked("${chainId}","${subSystemId}","${viewTag}",this.checked);'` +
                        `name='${viewKey}.expander-toggle'` +
                        `type='checkbox'/>` +
                    `<div class='bottom-row-style'>` +
                        `<span id="${viewKey}.state-indicator-icon" class="inactive-indicator-style"></span>` +
                        `<div class='status-bars-group-style'>` +
                            `<span id="${viewKey}.bar-0"></span>` +
                            `<span id="${viewKey}.bar-1"></span>` +
                            `<span id="${viewKey}.bar-2"></span>` +
                            `<span id="${viewKey}.bar-3"></span>` +
                            `<span id="${viewKey}.bar-4"></span>` +
                            `<span id="${viewKey}.bar-5"></span>` +
                        `</div>` +
                    `</div>` +
                `</label>` +
                `<div id='${viewKey}.control-panel-container' class='control-panel-container' style='display:none;'></div>` +
                `<img src onerror='subSystemControlLoaded("${chainId}","${subSystemId}","${viewTag}");'/>` +
            `</div>`;
        }
}

/**
 * Add/update the edit only control card for the specified subsystem.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {string} containerName - Name for the container in the DOM, as declared in the HTML.
 */
function addEditView(chainId, subSystemId) {
    let viewTag = 'Edit';
    let key = getKey(chainId, subSystemId);
    let viewKey = `${key}.${viewTag}`;
    let checkElement = document.getElementById(viewKey);
    if (!checkElement) {
        document.getElementById(EDIT_VIEW_CONTAINER_NAME).innerHTML +=
            `<div id='${viewKey}' class='group-style'>` +
                `<div class="header-section-style">` +
                    `<label id="${viewKey}.label-content" class="subsystem-label-style">${(available[subSystemId] ? available[subSystemId].name : "")}</label>` +
                    `<button class='unchain-button-style' onclick='document.removeSubSystemFromChain("${chainId}", "${subSystemId}");'></button>` +
                    `<div class='bottom-row-style'>` +
                        `<button id='${viewKey}.move-up-button' class='button-disabled-style move-up-button-style' onclick='document.moveSubSystemUpwards("${chainId}", "${subSystemId}");'></button>` +
                        `<button id='${viewKey}.move-down-button' class='button-disabled-style move-down-button-style' onclick='document.moveSubSystemDownwards("${chainId}", "${subSystemId}");'></button>` +
                    `</div>` +
                `</div>` +
                // `<div id="${viewKey}.endpoint-setup-warning" class="control-panel-edit-container-inactive">` +
                //     `<label class="notice-icon"><i class="fas fa-exclamation-triangle"></i></label>` +
                //     `<label class="notice-label">Save chain and refresh to continue</label>` +
                // `</div>` +
                `<div class="control-panel-edit-container-active" style="display:block;">` +
                    `<label class="select-container">` +
                        `<select id="${viewKey}.address-protocol-content">` +
                            `<option value="TCP">TCP/IP</option>` +
                            `<option value="MQTT">MQTT</option>` +
                            `<option value="MQTTS">MQTTS</option>` +
                        `</select>` +
                    `</label>` +
                    `<input id="${viewKey}.address-hostname-content" type="text" placeholder="ip"></input>` +
                    `<input id="${viewKey}.address-port-content" type="text" placeholder="port" min="0" max="65535"></input>` +
                `</div>` +
                `<form id="${viewKey}.topic-group-container" style='display:none;flex-direction:row;'></form>` +
                `<img src onerror='subSystemControlLoaded("${chainId}","${subSystemId}","${viewTag}");'/>` +
            `</div>`;
    }
}

/**
 * Add/update the a broadcasting available subsystem control to the edit only panel (allowing for them to be added).
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {string} containerName - Name for the container in the DOM, as declared in the HTML.
 * @param {string} subSystemName - User friendly name of the sub-system, used to label the sub-system on the UI.
 */
function addOrUpdateAvailableView(subSystemId, subSystemName) {
    let viewTag = 'Available';
    let viewKey = `${subSystemId}.${viewTag}`;
    let checkElement = document.getElementById(viewKey);
    if (!checkElement) {
        document.getElementById(AVAILABLE_VIEW_CONTAINER_NAME).innerHTML +=
            `<div id='${viewKey}'>` +
                `<label id="${viewKey}.label-content" class='subsystem-label-style'>${subSystemName}</label>` +
                `<button class='chain-button-style' onclick='document.addSubSystemToChain("${subSystemId}");'></button>` +
                `<img src onerror='subSystemControlLoaded("","${subSystemId}","${viewTag}");'/>` +
            `</div>`;
    }
}

// REMOVE

/**
 * Remove all sub-systems configured to a particular chain, usually where a chain has been removed from use.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 */
function removeAllSubSystemsFromChain(chainId) {
    Object.values(context).forEach(v => {
        if (v.chainId == chainId)
            remove(chainId, v.subSystemId);
    });
}

/**
 * Remove indicated subsystem from the selected signal chain.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 */
function remove(chainId, subSystemId) {
    let key = getKey(chainId, subSystemId);

    if (context[key]) {
        Object.keys(context[key].controls).forEach(k =>
            purgedTopics.push(`Chains/${chainId}/SubSystems/${subSystemId}/Controls/${k}`));
        Object.keys(context[key].dataStreams).forEach(k =>
            purgedTopics.push(`Chains/${chainId}/SubSystems/${subSystemId}/Data/${k}/Interpretation`));
        purgedTopics.push(`Chains/${chainId}/SubSystems/${subSystemId}/Incoming`);
        purgedTopics.push(`Chains/${chainId}/SubSystems/${subSystemId}/Outgoing`);
    }

    ordering[chainId] = ordering[chainId].filter(k => k !== key);
    removeView(key, 'Default');
    removeView(key, 'Edit');
    refreshAvailableView(subSystemId);
    refreshAllOrderIndicators(chainId);
}

/**
 * Remove controls associated with the indicated subsystem from the view.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} viewTag - Tag identifying the specific control view to work on [e.g. "Default"/"Edit"/"Available"].
 */
function removeView(key, viewTag) {
    let checkElement = document.getElementById(`${key}.${viewTag}`)
    if (checkElement)
        checkElement.remove();
}

// CLEAR

/**
 * Remove all subsystem cards under the currently selected chain from the view. 
 */
function clear() {
    clearView(DEFAULT_VIEW_CONTAINER_NAME);
    clearView(EDIT_VIEW_CONTAINER_NAME);
}

/**
 * Remove all elements from the indicated subsystem's view.
 * @param {string} containerName - Name for the container in the DOM, as declared in the HTML.
 */
function clearView(containerName) {
    let list = document.getElementById(containerName);

    if (!list)
        return;

    while (list.firstChild)
        list.firstChild.remove();
}

// REFRESH

/**
 * Set arrows that allow for re-ordering of subsystems.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 */
function refreshAllOrderIndicators(chainId) {
    let keys = ordering[chainId];//.filter(k => k.startsWith(chainId));
    for (let i = 0; i < keys.length; i++) {
        let viewKey = `${keys[i]}.Edit`;
        // let checkElement = document.getElementById(viewKey);
        // let ctx = context[keys[i]];
        let upArrowElement = document.getElementById(`${viewKey}.move-up-button`);
        if (upArrowElement)
            upArrowElement
                .setAttribute('class', i === 0
                    ? 'button-disabled-style move-up-button-style'
                    : 'button-normal-style move-up-button-style');
        let downArrowElement = document.getElementById(`${viewKey}.move-down-button`);
        if (downArrowElement)
            downArrowElement
                .setAttribute('class', i === keys.length - 1
                    ? 'button-disabled-style move-down-button-style'
                    : 'button-normal-style move-down-button-style');
        // If last element, selectively hide topics (as these is no subsequent sub-system)
        let topicsElement = document.getElementById(`${viewKey}.topic-group-container`);
        if (topicsElement) {
            if (i === keys.length - 1) {
                topicsElement.style.display = 'none';
            }
            else {
                topicsElement.style.display = 'block';
                let isAnyChecked = false;
                for (let i = 0; i < topicsElement.childNodes.length; i++) {
                    if (topicsElement.childNodes[i].childNodes[0].checked)
                        isAnyChecked = true;
                }
                if (!isAnyChecked) {
                    let node = topicsElement.childNodes[0];
                    if (node)
                        node.childNodes[0].checked = true;
                }
            }
        }

        // if (topicsElement && ctx) {
        //     If last element, selectively hide topics (as these is no subsequent sub-system)
        //     let nodes = Object.values(checkElement.parentNode.childNodes)
        //         .reduce((s, k) => {
        //             let p = k.id;
        //             (s = s ?? [])
        //                 .push(p);
        //             return s;
        //         }, []);
        //     let isEmptyFinalElement =
        //         ((nodes.length - 1) === nodes.indexOf(viewKey)) &&
        //         ctx.endpoint.topics &&
        //         (ctx.endpoint.topics.length <= 0);
        //     let endpointView = document.getElementById(`${viewKey}.endpoint-setup-edit`);
        //     if (endpointView)
        //         endpointView
        //             .style
        //             .display = i == keys.length - 1
        //                 ? 'none'
        //                 : 'block';
        //     checkElement
        //         .style
        //         .height = FULL_HEIGHT * ((ctx.isUiAdded || !isEmptyFinalElement) ? 1.00 : 0.32);
        // }
    }
}

// MOVE

/**
 * Logic to move a subsystem onward in the list of signal chain subsystems.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 */
function moveSubSystemUpInChain(chainId, subSystemId) {
    let key = getKey(chainId, subSystemId);
    let viewKey = `${key}.Edit`;
    let checkElement = document.getElementById(viewKey);
    if (checkElement) {
        let placement = ordering[chainId].indexOf(key) - 1;
        let firstIndex = 0;
        placement = placement > firstIndex ? placement : firstIndex;
        // Re-order items in local array.
        ordering[chainId][ordering[chainId].indexOf(key)] = ordering[chainId][placement];
        ordering[chainId][placement] = key;
        // Re-order items in view.
        let parent = checkElement.parentNode;
        parent.insertBefore(checkElement, parent.childNodes[placement]);
    }
}

/**
 * Logic to move a subsystem backward in the list of signal chain subsystems.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 */
function moveSubSystemDownInChain(chainId, subSystemId) {
    let key = getKey(chainId, subSystemId);
    let viewKey = `${key}.Edit`;
    let checkElement = document.getElementById(viewKey);
    if (checkElement) {
        let placement = ordering[chainId].indexOf(key) + 1;
        let lastIndex = ordering[chainId].length - 1;
        placement = placement < lastIndex ? placement : lastIndex;
        // Re-order items in local array.
        ordering[chainId][ordering[chainId].indexOf(key)] = ordering[chainId][placement];
        ordering[chainId][placement] = key;
        // Re-order items in view.
        let parent = checkElement.parentNode;
        parent.insertBefore(checkElement, parent.childNodes[placement + 1]);
    }
}

// LABEL

/**
 * Set label directly from message.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {string} availableListContainerName - Name for the container in the DOM, as declared in the HTML.
 * @param {string} subSystemName - User friendly name of the sub-system, used to label the sub-system on the UI.
 */
function setLabel(chainId, subSystemId, subSystemName) {
    if (!available[subSystemId]) {
        let poller = new Promise(async () => setInterval(() => refreshState(subSystemId), STATUS_REFRESH_INTERVAL));
        available[subSystemId] = new Available(subSystemName, poller);
    }

    addOrUpdateAvailableView(subSystemId, subSystemName);

    if (!chainId ||
        !subSystemName)
        return;

    let key = getKey(chainId, subSystemId);
    if (!context[key])
        return;

    context[key].name = subSystemName;
    setLabelView(key, 'Default', subSystemName);
    setLabelView(key, 'Edit', subSystemName);
}

/**
 * Set the user friendly subsystem name on its card in the view.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} viewTag - Tag identifying the specific control view to work on [e.g. "Default"/"Edit"/"Available"].
 * @param {string} subSystemName - User friendly name of the sub-system, used to label the sub-system on the UI.
 */
function setLabelView(key, viewTag, subSystemName) {
    let viewKey = `${key}.${viewTag}`;
    let checkElement = document.getElementById(`${viewKey}.layer-label-content`);
    if (checkElement)
        checkElement.value = subSystemName;
}

// RATE MASK

/**
 * Set rate mask directly from message.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {number[]} rateMask - Mask indicating rates over a defined interval by the source, for display on the subsystem activity histogram.
 */
function setRateMask(chainId, subSystemId, rateMask) {
    let key = getKey(chainId, subSystemId);
    context[key].rateMask = rateMask;
    setRateMaskView(key, 'Default', rateMask);
}

/**
 * Use the rate mask to set the subsystem activity histogram on the indicated card in the view.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} viewTag - Tag identifying the specific control view to work on [e.g. "Default"/"Edit"/"Available"].
 * @param {number[]} rateMask - Mask indicating rates over a defined interval by the source.
 */
function setRateMaskView(key, viewTag, rateMask) {
    let viewKey = `${key}.${viewTag}`
    let checkElement = undefined;
    for (let i = 0; i <= 5; i++) {
        checkElement = document.getElementById(`${viewKey}.bar-${i}`);
        if (checkElement)
            checkElement.style.transform = `scale(1,${(.167 + (.167 * rateMask[i]))})`;
    }
}

// STATE

/**
 * Determine the top-level signal chain state from the operational states of its component subsystems.
 */
function determineGlobalState() {
    let chainStates = Object.values(context).reduce((s, ctx) => {
        (s[ctx.chainId] = s[ctx.chainId] ?? []).push(available[ctx.subSystemId] ? available[ctx.subSystemId].state : gen.State.UNKNOWN);
        return s;
    }, {});

    Object.keys(chainStates).forEach(k => top.updateChainState(k, chainStates[k]));
}

/**
 * Set state directly from message, or polled.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 */
function refreshState(subSystemId) {
    if (Date.now() - available[subSystemId].lastUpdated > STATUS_TIMEOUT_INTERVAL) {
        if (available[subSystemId].state != gen.State.UNKNOWN)
            available[subSystemId].state = gen.State.UNKNOWN;

        let keys = Object.keys(context).filter(k => k.match(subSystemId));
        if (keys.length > 0) {
            determineGlobalState();
            setStateView(keys[0], 'Default', gen.State.UNKNOWN);
            setRateMaskView(keys[0], 'Default', EMPTY_RATE_MASK);
        }

        refreshAvailableView(subSystemId);
    }
}

/**
 * Set state directly from message.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {string} state - Current subsystem state as defined by its source, mapped to a named enum state.
 */
function setState(chainId, subSystemId, state) {
    let enumState =
        state == 'Failure'     ? gen.State.FAILURE :
        state == 'Caution'     ? gen.State.CAUTION :
        state == 'Operational' ? gen.State.OPERATIONAL :
                                 gen.State.UNKNOWN;

    if (available[subSystemId]) {
        available[subSystemId].state = enumState;
        available[subSystemId].lastUpdated = Date.now();
        refreshAvailableView(subSystemId);

        if (selectedChainId == chainId) {
            determineGlobalState();
            setStateView(getKey(chainId, subSystemId), 'Default', enumState);
        }
    }
}

/**
 * Set the current operational state of the subsystem's indicated card in the view.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} viewTag - Tag identifying the specific control view to work on [e.g. "Default"/"Edit"/"Available"].
 * @param {string} state - Current subsystem state as defined by its source, mapped to a named enum state.
 */
function setStateView(key, viewTag, state) {
    let viewKey = `${key}.${viewTag}`;
    let checkElement = document.getElementById(`${viewKey}.state-indicator-icon`);
    if (checkElement) {
        checkElement.setAttribute('class',
            state == gen.State.FAILURE     ? 'failure-indicator-style' :
            state == gen.State.CAUTION     ? 'caution-indicator-style' :
            state == gen.State.OPERATIONAL ? 'operational-indicator-style' :
            state == gen.State.UNKNOWN     ? 'inactive-indicator-style' :
                                             '');
    }
}

/**
 * Set visibility of unchained sub-systems (which may be added).
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 */
function refreshAvailableView(subSystemId) {
    if (subSystemId in available) {
        available[subSystemId].isInCurrentChain = ordering[selectedChainId] && ordering[selectedChainId].filter(v => v.split('.')[1] == subSystemId).length > 0;
        let checkElement = document.getElementById(`${subSystemId}.Available`);
        if (checkElement) {
            checkElement
                .style
                .display = available[subSystemId].isInCurrentChain ||
                    available[subSystemId].state == gen.State.UNKNOWN
                    ? 'none'
                    : 'block';
        }
    }
}

/**
 * Set selected incoming topic.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {string} msg - Payload containing the latest details from the broker that the client should sync with.
 */
function setIncomingData(chainId, subSystemId, msg) {
    let key = getKey(chainId, msg.source);
    let streamKey = msg.topics[0];
    context[key].endpoint.selectedTopic = streamKey;
    setSelectedTopicView(key, 'Edit', streamKey);
    if (context[key].endpoint.topics.includes(streamKey)) {
        let currentKey = getKey(chainId, subSystemId);
        let streams = context[currentKey].dataStreams;
        if (!Object.keys(streams).includes(streamKey))
            streams[streamKey] = {};
        streams[streamKey].incoming = msg;

        // if (previousEndpoint && previousEndpoint.selectedTopic) {
        //     if (previousEndpoint.selectedTopic in context[key].dataStreams)
        //         incoming.layout = context[key].dataStreams[previousEndpoint.selectedTopic].layout;
        //     else
        //         context[key].dataStreams[previousEndpoint.selectedTopic] = {};
        // }
        // context[key].dataStreams[previousEndpoint.selectedTopic].incoming = incoming;
        // context[currentKey].dataStreams[msg.topics[0]]['layout'] = msg.layout;
        // // context[currentKey].dataStreams[subSystemId]['incoming'] = incoming;
        // mqtt.pubObj(
        //     `Chains/${chainId}/SubSystems/${subSystemIds[j]}/Incoming`,
        //     incoming);
    }
}

/**
 * Set the valid output topic for the subsystem that the subsequent subsystem in the signal chain should use as input.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} viewTag - Tag identifying the specific control view to work on [e.g. "Default"/"Edit"/"Available"].
 * @param {string} topic - Originating topic used to specifically identify the applicable control in the view.
 */
function setSelectedTopicView(key, viewTag, topic) {
    let viewKey = `${key}.${viewTag}`;
    let checkElement = document.getElementById(viewKey);
    if (checkElement) {
        let element = document.getElementById(`topic-${key}.${getSanitized(topic)}`);
        if (element)
            element.checked = true;
    }
}

// ENDPOINT

/**
 * Set the viable data streams that an available subsystem may provided as output.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {string} streamKeys - Keys for the data streams available as output from the subsystem.
 */
function setAvailableDataStreams(subSystemId, streamKeys) {
    if (available[subSystemId])
        available[subSystemId].streamKeys = streamKeys;
}

/**
 * Set the record structure from the incoming definition for the primary output data stream.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {string} msg - Payload containing the latest details from the broker that the client should sync with.
 */
function setDataStreamLayouts(chainId, subSystemId, msg) {
    let key = getKey(chainId, subSystemId);
    let streamKey = msg['key'];
    if (!context[key])
        return;

    let streams = context[key].dataStreams;
    if (!Object.keys(streams).includes(streamKey))
        streams[streamKey] = {};

    streams[streamKey].layout = msg['dataTypes'];
    context[key].dataStreams[streamKey] = streams[streamKey];
}

/**
 * Set endpoint directly from message.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {Object} endpoint - Full endpoint definition where the subsystem's output may be retrieved.
 */
function setEndpoint(chainId, subSystemId, endpoint) {
    let key = getKey(chainId, subSystemId);
    // endpoint.topics = available[subSystemId].streamKeys;
    context[key].endpoint = endpoint;
    setEndpointView(key, 'Edit', endpoint);
    return endpoint;
}

/**
 * Set the subsystem's protocol type, ip, port and outgoing data streams on its edit card in the view.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} viewTag - Tag identifying the specific control view to work on [e.g. "Default"/"Edit"/"Available"].
 * @param {Object} endpoint - Full endpoint definition where the subsystem's output may be retrieved.
 */
function setEndpointView(key, viewTag, endpoint) {
    let viewKey = `${key}.${viewTag}`;
    let checkElement = undefined;
    checkElement = document.getElementById(`${viewKey}.address-protocol-content`);
    if (checkElement)
        checkElement.value = endpoint.protocol;
    checkElement = document.getElementById(`${viewKey}.address-hostname-content`);
    if (checkElement)
        checkElement.value = endpoint.ip;
    checkElement = document.getElementById(`${viewKey}.address-port-content`);
    if (checkElement)
        checkElement.value = endpoint.port;
    // let topicGroup = document.getElementById(`${viewKey}.topic-group-container`);
    checkElement = document.getElementById(viewKey);
    if (checkElement && endpoint.topics && (endpoint.topics.length > 0)) {
        let topicGroup = checkElement.childNodes[2];
        if (topicGroup) {
            topicGroup.innerHTML = "";
            for (let i = 0; i < endpoint.topics.length; i++) {
                topicGroup.innerHTML +=
                    `<label class='container' style='padding:0 0 10 0;'>` +
                        `<input id='topic-${key}.${getSanitized(endpoint.topics[i])}' ` +
                            `type='radio' ${((endpoint.topics[i] === context[key].endpoint.selectedTopic) || (endpoint.topics.length === 1) ? 'checked ' : '')}` +
                            `name='active-topics-${key}' value='${i}' />` +
                        `${endpoint.topics[i]}` +
                    `</label>`;
            }
        }
    }
    refreshAllOrderIndicators(key.split('.')[0]);
}

// ADD OR UPDATE CHILDREN

/**
 * Set child controls
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {string} controlId - Unique identifier for the control, allowing for its subsequent retrieval and publish from view.
 * @param {string} controlData - Standardized data structure and definition for controls of a recognized type ('TextBox', 'Radio', 'CheckBox' or 'Slider').
 */
function addOrUpdateChildren(chainId, subSystemId, controlId, controlData) {
    let key = getKey(chainId, subSystemId);
    context[key].controls[controlId] = controlData;

    if (controlData.type === 'TextBox')
        addOrUpdateTextBoxGroupView(key, controlId, controlData);
    else if (controlData.type === 'Radio')
        addOrUpdateRadioButtonGroupView(key, controlId, controlData);
    else if (controlData.type === 'CheckBox')
        addOrUpdateCheckBoxGroupView(key, controlId, controlData);
    else if (controlData.type === 'Slider')
        addOrUpdateSliderGroupView(key, controlId, controlData);
}

/**
 * Add/Update input value child controls from an incoming definition.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} controlId - Unique identifier for the control, allowing for its subsequent retrieval and publish from view.
 * @param {string} controlData - Standardized data structure and definition for the textbox.
 */
function addOrUpdateTextBoxGroupView(key, controlId, controlData) {
    let viewTag = 'Default';
    let containerKey = `${key}.${viewTag}`;
    let viewKey = `${containerKey}.${controlId}`;
    if (document.getElementById(viewKey))
        document.getElementById(viewKey).value = controlData.value;
    else {
        let container = document
            .getElementById(`${containerKey}.control-panel-container`);

        let childElementHtml =
            `<div class='subsystem-child-control-group-style'>`;

        if (controlData.label)
            childElementHtml +=
                `<h1>${controlData.label}</h1>`;

        childElementHtml +=
            `<div>` +
                `<input id='${viewKey}' type='text' value='${controlData.value}'/>` +
                `<button onclick='sendTextBoxGroup("${viewKey}");'>` +
                    `<i class='fas fa-check'></i>` +
                `</button>` +
            `</div>`;

        container.innerHTML += childElementHtml +
            `</div>`;
    }
}

/**
 * Add/Update radio button child controls from an incoming definition.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} controlId - Unique identifier for the control, allowing for its subsequent retrieval and publish from view.
 * @param {string} controlData - Standardized data structure and definition for the radio buttons group, including current selected.
 */
function addOrUpdateRadioButtonGroupView(key, controlId, controlData) {
    let viewTag = 'Default';
    let containerKey = `${key}.${viewTag}`;
    let viewKey = `${containerKey}.${controlId}`;
    if (document.getElementById(viewKey))
        document
            .getElementById(`${viewKey}.${controlData.selected}`).checked = true;
    else {
        let container = document
            .getElementById(`${containerKey}.control-panel-container`);

        let childElementHtml =
            `<div class='subsystem-child-control-group-style'>`;

        if (controlData.label)
            childElementHtml +=
                `<h1>${controlData.label}</h1>`;

        childElementHtml +=
            `<form id='${viewKey}' style='width:100%;display:flex;flex-direction:row;flex-wrap:wrap;justify-content:stretch safe flex-start;'>`;

        for (let i = 0; i < controlData.items.length; i++)
            childElementHtml +=
                `<label class='container'>` +
                    `<input id='${viewKey}.${i}'` +
                        `type='radio'` +
                        `${((controlData.selected == i) || (controlData.items.length === 1) ? 'checked ' : '')}` +
                        `name='${viewKey}'` +
                        `value='${i}'` +
                        `onclick='sendRadioButtonGroup("${viewKey}","${i}");'/>` +
                        `${controlData.items[i]}` +
                `</label>`;

        childElementHtml +=
            `</form>`;

        container.innerHTML += childElementHtml +
            `</div>`;
    }
}

/**
 * Add/Update checkbox child controls from an incoming definition.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} controlId - Unique identifier for the control, allowing for its subsequent retrieval and publish from view.
 * @param {string} controlData - Standardized data structure and definition for the checkbox group, including current checked.
 */
function addOrUpdateCheckBoxGroupView(key, controlId, controlData) {
    let viewTag = 'Default';
    let containerKey = `${key}.${viewTag}`;
    let viewKey = `${containerKey}.${controlId}`;
    if (document.getElementById(viewKey)) {
        for (let i = 0; i < controlData.items.length; i++) {
            let item = document.getElementById(`${viewKey}.${i}`);
            if (item)
                item.checked = controlData.items[i].isChecked;
        }
    }
    else {
        let container = document
            .getElementById(`${containerKey}.control-panel-container`);

        let childElementHtml =
            `<div class='subsystem-child-control-group-style'>`;

        if (controlData.label)
            childElementHtml +=
                `<h1>${controlData.label}</h1>`;

        childElementHtml +=
            `<form id='${viewKey}' style='width:100%;display:flex;flex-direction:row;flex-wrap:wrap;justify-content:stretch safe flex-start;'>`;

        for (let i = 0; i < controlData.items.length; i++)
            childElementHtml +=
                `<label class='container'>` +
                `<input id='${viewKey}.${i}'` +
                    `type='checkbox'` +
                    `name='${viewKey}'` +
                    `onclick='sendCheckBoxGroup("${viewKey}","${i}",this.checked);'` +
                    `${(controlData.items[i].isChecked ? 'checked ' : '')}'/>` +
                    `${controlData.items[i].label}` +
                `</label>`;

        childElementHtml +=
            `</form>`;

        container.innerHTML += childElementHtml +
            `</div>`;
    }
}

/**
 * Add/Update slider child controls from an incoming definition.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} controlId - Unique identifier for the control, allowing for its subsequent retrieval and publish from view.
 * @param {string} controlData - Standardized data structure and definition for the slider, including current value.
 */
function addOrUpdateSliderGroupView(key, controlId, controlData) {
    let viewTag = 'Default';
    let containerKey = `${key}.${viewTag}`;
    let viewKey = `${containerKey}.${controlId}`;
    if (document.getElementById(viewKey)) {
        document.getElementById(viewKey).value = controlData.value;
        document.getElementById(`${viewKey}.label`).innerHTML = controlData.value;
    }
    else {
        let container = document
            .getElementById(`${containerKey}.control-panel-container`);

        let childElementHtml =
            `<div class='subsystem-child-control-group-style'>`;

        if (controlData.label)
            childElementHtml +=
                `<h1>${controlData.label}</h1>`;

        childElementHtml +=
            `<input id='${viewKey}'` +
                `name='${viewKey}'` +
                `type='range'` +
                `min='${controlData.min}'` +
                `max='${controlData.max}'` +
                `value='${controlData.value}'` +
                `change='sendTextBoxGroup(\"${viewKey}\");'` +
                `onchange='sendTextBoxGroup(\"${viewKey}\");'` +
                `oninput='sendTextBoxGroup(\"${viewKey}\");'/>`;

        childElementHtml +=
            `<output id='${viewKey}.label'` +
                `for='${viewKey}'>${controlData.value}</output>`;

        container.innerHTML += childElementHtml +
            `</div>`;
    }
}

export {
    setSelectedChain,
    add,
    remove,
    removeAllSubSystemsFromChain,
    saveSettings,
    setLabel,
    setAvailableDataStreams,
    setDataStreamLayouts,
    setEndpoint,
    setIncomingData,
    setRateMask,
    setState,
    addOrUpdateChildren,
};