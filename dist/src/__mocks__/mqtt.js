import { EventEmitter } from "events";
/**
 * Mock MQTT Client for testing
 */
export class MockMqttClient extends EventEmitter {
    connected = false;
    subscriptions = new Map();
    published = [];
    subscribe(topic, opts, callback) {
        this.subscriptions.set(topic, opts);
        callback?.(null);
        return this;
    }
    publish(topic, message, opts, callback) {
        this.published.push({ topic, message, opts });
        callback?.(null);
        return this;
    }
    end(force, opts, callback) {
        this.connected = false;
        this.subscriptions.clear();
        callback?.();
        return this;
    }
    // Test helpers
    simulateConnect() {
        this.connected = true;
        this.emit("connect");
    }
    simulateMessage(topic, payload) {
        const buf = typeof payload === "string" ? Buffer.from(payload) : payload;
        this.emit("message", topic, buf);
    }
    simulateError(err) {
        this.emit("error", err);
    }
    simulateDisconnect() {
        this.connected = false;
        this.emit("close");
    }
    reconnect() {
        this.emit("reconnect");
        setTimeout(() => this.simulateConnect(), 10);
        return this;
    }
    simulateReconnect() {
        this.emit("reconnect");
    }
}
// Factory function that returns mock client
let mockClient = null;
export function connect(url, opts) {
    mockClient = new MockMqttClient();
    // Auto-connect after short delay to simulate async connection
    setTimeout(() => mockClient?.simulateConnect(), 10);
    return mockClient;
}
// Test helper to get current mock client
export function getMockClient() {
    return mockClient;
}
// Reset between tests
export function resetMock() {
    mockClient = null;
}
export default { connect, getMockClient, resetMock };
