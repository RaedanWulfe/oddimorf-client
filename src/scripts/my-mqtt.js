/**
 * @fileoverview Provides the necessary logic to interface with the MQTT broker.
 * Specific MQTT client effected with the available Node.js module.
 * @package
 */

import * as mqtt from "Modules/mqtt/dist/mqtt.js";

/** Default parameters to use with published MQTT messages. */
const PUBLISH_OPTIONS = {
    qos: 1,
    retain: true
};

/** Client object for the active MQTT session, allowing for topic-based pub/sub of messages. */
var client = null;

/** Active topics registered for use. */
var activeTopics = [];

/**
 * Save global settings
 */
function saveSettings() {
    localStorage.brokerHostname = document.getElementById('broker-hostname-content').value;
    localStorage.brokerPort = document.getElementById('broker-port-content').value;
    localStorage.brokerProtocol = document.getElementById('broker-protocol-content').value;
};

/**
 * Reset global settings from local storage
 */
function resetSettings() {
    document.getElementById('broker-protocol-content').value = localStorage.brokerProtocol,
    document.getElementById('broker-hostname-content').value = localStorage.brokerHostname,
    document.getElementById('broker-port-content').value = localStorage.brokerPort;
};

/**
 * Set the displayed MQTT settings as specified and initialize the active MQTT client from those settings.
 * @param {string} brokerProtocol - Specify the primary MQTT broker protocol as plain [WS] or secure [WSS].
 * @param {string} brokerHostname - Host/ip of the primary MQTT broker to connect to.
 * @param {string} brokerPort - Port of the primary MQTT broker to connect through.
 */
function setup(brokerProtocol, brokerHostname, brokerPort) {
    if (!brokerProtocol ||
        !brokerHostname ||
        !brokerPort)
        return;

    document.getElementById('broker-protocol-content').value = brokerProtocol,
    document.getElementById('broker-hostname-content').value = brokerHostname,
    document.getElementById('broker-port-content').value = brokerPort;

    client = mqtt.connect(`${brokerProtocol ?? 'ws'}://${brokerHostname ?? 'localhost'}:${brokerPort ?? 9001}`, {
        protocol: brokerProtocol ?? 'ws',
        secureProtocol: 'TLSv1_2_method',
        rejectUnauthorized: false
    });

    client.on('connect', () =>
        console.log("MQTT client connected to broker"));

    client.on('close', () =>
        console.log("MQTT client disconnected from broker"));

    client.on('error', error =>
        console.log("MQTT client error", error));
}

/**
 * Publish and stringify an JSON map object to the MQTT broker over the specified topic.
 * @param {string} topic - Destination topic.
 * @param {string} msgObj - JSON map object, stringified before publish as message.
 */
function pubObj(topic, msgObj) {
    if (client)
        client.publish(topic, JSON.stringify(msgObj), PUBLISH_OPTIONS);
}

/**
 * Publish a formatted string message to the MQTT broker over the specified topic.
 * @param {string} topic - Destination topic.
 * @param {string} msg - String message to publish.
 */
function pubString(topic, msg) {
    if (client)
        client.publish(topic, msg, PUBLISH_OPTIONS);
}

/**
 * Clear an active topic on the MQTT broker, indicating that it no longer applies.
 * @param {string} topic - Topic to clear.
 */
function pubClear(topic) {
    if (client)
        client.publish(topic, '', PUBLISH_OPTIONS);
}

/**
 * Subscribe the client to the indicated topic on the active MQTT broker.
 * @param {string} topic - Topic that the client should subscribe to at the broker.
 */
function sub(topic) {
    if (!client)
        return;

    activeTopics.push(topic);
    client.subscribe(topic);
}

/**
 * Register an action to the trigger on an incoming message from the MQTT broker.
 * @param {Object} action - Action defining handler logic for incoming messages from the MQTT broker.
 * @return Topic and payload of incoming subscribed message.
 */
function register(action) {
    return client ? client.on('message', action) : null;
}

/**
 * Reset and clear all MQTT settings indicated at the client.
 */
function clear() {
    resetSettings();

    if (!client)
        return;

    unSubAll()
    activeTopics = [];
}

/**
 * Unsubscribe the client from all active topics it has previously subscribed to.
 */
function unSubAll() {
    if (client)
        client.unsubscribe(activeTopics);
}

export {
    setup,
    saveSettings,
    sub,
    unSubAll,
    pubObj,
    pubString,
    pubClear,
    register,
    clear,
};