import type { MqttConfig } from "./config-schema.js";
export interface MqttClientManager {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    publish(topic: string, message: string, qos?: 0 | 1 | 2): Promise<void>;
    subscribe(topic: string, handler: MessageHandler): void;
    isConnected(): boolean;
}
export type MessageHandler = (topic: string, payload: Buffer) => void;
interface Logger {
    debug(msg: string): void;
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
}
/**
 * MQTT Client Manager
 *
 * Handles connection lifecycle, reconnection, and message routing.
 */
export declare function createMqttClient(rawConfig: Partial<MqttConfig>, logger: Logger): MqttClientManager;
export {};
//# sourceMappingURL=client.d.ts.map