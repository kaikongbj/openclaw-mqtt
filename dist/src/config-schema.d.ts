import { z } from "zod";
/**
 * MQTT Configuration Schema
 *
 * Values can come from:
 * 1. ~/.openclaw/openclaw.json (channels.mqtt.*)
 * 2. Environment variables (MQTT_*)
 *
 * Environment variables take precedence for secrets.
 */
export declare const mqttConfigSchema: z.ZodObject<{
    brokerUrl: z.ZodString;
    username: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
    clientId: z.ZodOptional<z.ZodString>;
    topics: z.ZodDefault<z.ZodObject<{
        inbound: z.ZodDefault<z.ZodString>;
        outbound: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        inbound: string;
        outbound: string;
    }, {
        inbound?: string | undefined;
        outbound?: string | undefined;
    }>>;
    qos: z.ZodDefault<z.ZodUnion<[z.ZodLiteral<0>, z.ZodLiteral<1>, z.ZodLiteral<2>]>>;
    tls: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        rejectUnauthorized: z.ZodDefault<z.ZodBoolean>;
        ca: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        rejectUnauthorized: boolean;
        ca?: string | undefined;
    }, {
        enabled?: boolean | undefined;
        rejectUnauthorized?: boolean | undefined;
        ca?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    brokerUrl: string;
    topics: {
        inbound: string;
        outbound: string;
    };
    qos: 0 | 1 | 2;
    username?: string | undefined;
    password?: string | undefined;
    clientId?: string | undefined;
    tls?: {
        enabled: boolean;
        rejectUnauthorized: boolean;
        ca?: string | undefined;
    } | undefined;
}, {
    brokerUrl: string;
    username?: string | undefined;
    password?: string | undefined;
    clientId?: string | undefined;
    topics?: {
        inbound?: string | undefined;
        outbound?: string | undefined;
    } | undefined;
    qos?: 0 | 1 | 2 | undefined;
    tls?: {
        enabled?: boolean | undefined;
        rejectUnauthorized?: boolean | undefined;
        ca?: string | undefined;
    } | undefined;
}>;
export type MqttConfig = z.infer<typeof mqttConfigSchema>;
export declare const defaultConfig: Partial<MqttConfig>;
//# sourceMappingURL=config-schema.d.ts.map