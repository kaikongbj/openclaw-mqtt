import { EventEmitter } from "events";
/**
 * Mock MQTT Client for testing
 */
export declare class MockMqttClient extends EventEmitter {
    connected: boolean;
    subscriptions: Map<string, {
        qos: number;
    }>;
    published: Array<{
        topic: string;
        message: string;
        opts: unknown;
    }>;
    subscribe(topic: string, opts: {
        qos: number;
    }, callback?: (err: Error | null) => void): this;
    publish(topic: string, message: string, opts: unknown, callback?: (err: Error | null) => void): this;
    end(force: boolean, opts: unknown, callback?: () => void): this;
    simulateConnect(): void;
    simulateMessage(topic: string, payload: Buffer | string): void;
    simulateError(err: Error): void;
    simulateDisconnect(): void;
    reconnect(): this;
    simulateReconnect(): void;
}
export declare function connect(url: string, opts?: unknown): MockMqttClient;
export declare function getMockClient(): MockMqttClient | null;
export declare function resetMock(): void;
declare const _default: {
    connect: typeof connect;
    getMockClient: typeof getMockClient;
    resetMock: typeof resetMock;
};
export default _default;
//# sourceMappingURL=mqtt.d.ts.map