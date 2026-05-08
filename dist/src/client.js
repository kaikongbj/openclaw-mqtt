import mqtt from "mqtt";
import { mergeWithEnv } from "./env.js";
const DEFAULT_RECONNECT_MS = 5000;
const MAX_RECONNECT_MS = 60000;
const INITIAL_CONNECT_GRACE_MS = 5000;
const RECONNECT_JITTER = 0.2;
/**
 * MQTT Client Manager
 *
 * Handles connection lifecycle, reconnection, and message routing.
 */
export function createMqttClient(rawConfig, logger) {
    const config = mergeWithEnv(rawConfig);
    let client = null;
    let messageHandlers = new Map();
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let connectPromise = null;
    let manualDisconnect = false;
    function getClientOptions() {
        const options = {
            clientId: config.clientId ?? `openclaw-${Math.random().toString(36).slice(2, 10)}`,
            clean: true,
            connectTimeout: 10000,
            reconnectPeriod: 0,
        };
        // Auth
        if (config.username) {
            options.username = config.username;
        }
        if (config.password) {
            options.password = config.password;
        }
        // TLS
        if (config.tls?.enabled) {
            options.rejectUnauthorized = config.tls.rejectUnauthorized ?? true;
            if (config.tls.ca) {
                // Note: In production, read the CA file
                // options.ca = fs.readFileSync(config.tls.ca);
            }
        }
        return options;
    }
    function clearReconnectTimer() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    }
    function getBackoffDelay(attempt) {
        const base = Math.min(DEFAULT_RECONNECT_MS * Math.pow(2, Math.max(0, attempt - 1)), MAX_RECONNECT_MS);
        const jitter = base * RECONNECT_JITTER * Math.random();
        return Math.round(base + jitter);
    }
    function scheduleReconnect(reason) {
        if (manualDisconnect)
            return;
        if (reconnectTimer)
            return;
        reconnectAttempts += 1;
        const delay = getBackoffDelay(reconnectAttempts);
        logger.warn(`MQTT reconnect scheduled in ${delay}ms (${reason})`);
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            if (manualDisconnect)
                return;
            if (!client) {
                connect().catch((err) => logger.error(`MQTT reconnect failed: ${err}`));
                return;
            }
            try {
                logger.info("MQTT reconnecting...");
                client.reconnect();
            }
            catch (err) {
                logger.error(`MQTT reconnect error: ${err}`);
                scheduleReconnect("reconnect error");
            }
        }, delay);
    }
    function attachClientHandlers(activeClient) {
        activeClient.on("connect", () => {
            logger.info("MQTT connected");
            reconnectAttempts = 0;
            clearReconnectTimer();
            // Resubscribe to all topics
            for (const topic of messageHandlers.keys()) {
                activeClient.subscribe(topic, { qos: config.qos }, (err) => {
                    if (err) {
                        logger.error(`Failed to subscribe to ${topic}: ${err.message}`);
                    }
                    else {
                        logger.debug(`Subscribed to ${topic}`);
                    }
                });
            }
        });
        activeClient.on("message", (topic, payload) => {
            logger.debug(`Received message on ${topic}: ${payload.length} bytes`);
            const handlers = [...(messageHandlers.get(topic) ?? [])];
            // Also check wildcard subscriptions (skip exact match to avoid duplicates)
            for (const [pattern, patternHandlers] of messageHandlers) {
                if (pattern === topic)
                    continue;
                if (topicMatches(pattern, topic)) {
                    handlers.push(...patternHandlers);
                }
            }
            for (const handler of handlers) {
                try {
                    handler(topic, payload);
                }
                catch (err) {
                    logger.error(`Message handler error: ${err}`);
                }
            }
        });
        activeClient.on("error", (err) => {
            logger.error(`MQTT error: ${err.message}`);
            scheduleReconnect("error");
        });
        activeClient.on("close", () => {
            logger.warn("MQTT connection closed");
            scheduleReconnect("close");
        });
        activeClient.on("reconnect", () => {
            logger.info("MQTT reconnect event");
        });
        activeClient.on("offline", () => {
            logger.warn("MQTT client offline");
            scheduleReconnect("offline");
        });
    }
    async function connect() {
        if (client?.connected) {
            logger.debug("MQTT already connected");
            return;
        }
        if (connectPromise) {
            return connectPromise;
        }
        manualDisconnect = false;
        if (!client) {
            logger.info(`Connecting to MQTT broker: ${config.brokerUrl}`);
            const options = getClientOptions();
            client = mqtt.connect(config.brokerUrl, options);
            attachClientHandlers(client);
        }
        else {
            logger.info("MQTT connect requested; reconnecting existing client");
            try {
                client.reconnect();
            }
            catch (err) {
                logger.error(`MQTT reconnect error: ${err}`);
                scheduleReconnect("reconnect error");
            }
        }
        connectPromise = new Promise((resolve) => {
            let settled = false;
            const settle = () => {
                if (settled)
                    return;
                settled = true;
                connectPromise = null;
                resolve();
            };
            if (client?.connected) {
                settle();
                return;
            }
            const timer = setTimeout(() => {
                logger.warn(`MQTT initial connect not ready after ${INITIAL_CONNECT_GRACE_MS}ms; continuing retries in background`);
                settle();
            }, INITIAL_CONNECT_GRACE_MS);
            client?.once("connect", () => {
                clearTimeout(timer);
                settle();
            });
        });
        return connectPromise;
    }
    async function disconnect() {
        if (!client)
            return;
        manualDisconnect = true;
        clearReconnectTimer();
        reconnectAttempts = 0;
        connectPromise = null;
        return new Promise((resolve) => {
            logger.info("Disconnecting from MQTT broker");
            client?.end(false, {}, () => {
                client?.removeAllListeners();
                client = null;
                messageHandlers.clear();
                logger.info("MQTT disconnected");
                resolve();
            });
        });
    }
    async function publish(topic, message, qos = config.qos) {
        if (!client?.connected) {
            throw new Error("MQTT not connected");
        }
        return new Promise((resolve, reject) => {
            client.publish(topic, message, { qos }, (err) => {
                if (err) {
                    logger.error(`Failed to publish to ${topic}: ${err.message}`);
                    reject(err);
                }
                else {
                    logger.debug(`Published to ${topic}: ${message.slice(0, 100)}...`);
                    resolve();
                }
            });
        });
    }
    function subscribe(topic, handler) {
        const handlers = messageHandlers.get(topic) ?? [];
        handlers.push(handler);
        messageHandlers.set(topic, handlers);
        // If already connected, subscribe immediately
        if (client?.connected) {
            client.subscribe(topic, { qos: config.qos }, (err) => {
                if (err) {
                    logger.error(`Failed to subscribe to ${topic}: ${err.message}`);
                }
                else {
                    logger.debug(`Subscribed to ${topic}`);
                }
            });
        }
    }
    function isConnected() {
        return client?.connected ?? false;
    }
    return {
        connect,
        disconnect,
        publish,
        subscribe,
        isConnected,
    };
}
/**
 * Check if a topic matches a subscription pattern.
 * Supports MQTT wildcards: + (single level) and # (multi level)
 */
function topicMatches(pattern, topic) {
    if (pattern === topic)
        return true;
    if (!pattern.includes("+") && !pattern.includes("#"))
        return false;
    const patternParts = pattern.split("/");
    const topicParts = topic.split("/");
    for (let i = 0; i < patternParts.length; i++) {
        const p = patternParts[i];
        if (p === "#") {
            // # matches everything from here
            return true;
        }
        if (p === "+") {
            // + matches exactly one level
            if (i >= topicParts.length)
                return false;
            continue;
        }
        if (p !== topicParts[i]) {
            return false;
        }
    }
    return patternParts.length === topicParts.length;
}
