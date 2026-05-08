import type { MqttConfig } from "./config-schema.js";
/**
 * Environment variable names for MQTT config.
 * These override values from openclaw.json for sensitive data.
 */
export declare const ENV_VARS: {
    readonly BROKER_URL: "MQTT_BROKER_URL";
    readonly USERNAME: "MQTT_USERNAME";
    readonly PASSWORD: "MQTT_PASSWORD";
    readonly CLIENT_ID: "MQTT_CLIENT_ID";
    readonly CA_PATH: "MQTT_CA_PATH";
};
/**
 * Merge config from openclaw.json with environment variables.
 * Environment variables take precedence (recommended for secrets).
 */
export declare function mergeWithEnv(config: Partial<MqttConfig>): MqttConfig;
//# sourceMappingURL=env.d.ts.map