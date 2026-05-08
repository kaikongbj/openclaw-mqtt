import { createMqttClient } from "./client.js";
import { mqttOnboardingAdapter } from "./onboarding.js";
import { getMqttRuntime } from "./runtime.js";
// Global client instance (one per gateway lifecycle)
let mqttClient = null;
/**
 * MQTT Channel Plugin for OpenClaw
 *
 * Provides bidirectional messaging via MQTT brokers (Mosquitto, EMQX, etc.)
 * Useful for IoT integration, home automation alerts, and service monitoring.
 */
export const mqttPlugin = {
    id: "mqtt",
    meta: {
        id: "mqtt",
        label: "MQTT",
        selectionLabel: "MQTT (IoT/Home Automation)",
        docsPath: "/channels/mqtt",
        blurb: "Bidirectional messaging via MQTT brokers",
        aliases: ["mosquitto"],
    },
    capabilities: {
        chatTypes: ["direct"],
        supportsMedia: false,
        supportsReactions: false,
        supportsThreads: false,
    },
    config: {
        listAccountIds: (cfg) => {
            return cfg.channels?.mqtt?.brokerUrl ? ["default"] : [];
        },
        resolveAccount: (cfg, accountId) => {
            const mqtt = cfg.channels?.mqtt;
            if (!mqtt)
                return { accountId: accountId ?? "default", enabled: false };
            return {
                accountId: accountId ?? "default",
                enabled: mqtt.enabled !== false,
                brokerUrl: mqtt.brokerUrl,
                config: mqtt,
            };
        },
        isEnabled: (account) => account.enabled !== false,
        isConfigured: (account) => Boolean(account.brokerUrl),
    },
    outbound: {
        deliveryMode: "direct",
        async sendText({ text, cfg }) {
            const mqtt = cfg.channels?.mqtt;
            if (!mqtt?.brokerUrl) {
                return { ok: false, error: "MQTT not configured" };
            }
            if (!mqttClient || !mqttClient.isConnected()) {
                return { ok: false, error: "MQTT not connected" };
            }
            try {
                const topic = mqtt.topics?.outbound ?? "openclaw/outbound";
                await mqttClient.publish(topic, text, mqtt.qos);
                return { ok: true };
            }
            catch (err) {
                const error = err instanceof Error ? err.message : String(err);
                return { ok: false, error };
            }
        },
    },
    gateway: {
        startAccount: async (ctx) => {
            const { cfg, account, accountId, abortSignal, log } = ctx;
            const mqtt = cfg.channels?.mqtt;
            if (!mqtt?.brokerUrl) {
                log?.debug?.("MQTT channel not configured, skipping");
                return;
            }
            const runtime = getMqttRuntime();
            log?.info?.(`[${accountId}] starting MQTT provider (${mqtt.brokerUrl})`);
            // Create and connect client
            mqttClient = createMqttClient(mqtt, {
                debug: (msg) => log?.debug?.(`[MQTT] ${msg}`),
                info: (msg) => log?.info?.(`[MQTT] ${msg}`),
                warn: (msg) => log?.warn?.(`[MQTT] ${msg}`),
                error: (msg) => log?.error?.(`[MQTT] ${msg}`),
            });
            try {
                await mqttClient.connect();
            }
            catch (err) {
                log?.error?.(`MQTT connection failed (will keep retrying): ${err}`);
            }
            // Subscribe to inbound topic
            const inboundTopic = mqtt.topics?.inbound ?? "openclaw/inbound";
            const outboundTopic = mqtt.topics?.outbound ?? "openclaw/outbound";
            mqttClient.subscribe(inboundTopic, async (topic, payload) => {
                await handleInboundMessage({
                    topic,
                    payload,
                    runtime,
                    cfg,
                    accountId,
                    log,
                    outboundTopic,
                    qos: mqtt.qos,
                });
            });
            log?.info?.(`[${accountId}] MQTT channel ready, subscribed to ${inboundTopic}`);
            // Return a promise that resolves when aborted
            return new Promise((resolve) => {
                const cleanup = () => {
                    if (mqttClient) {
                        log?.info?.(`[${accountId}] MQTT channel stopping`);
                        mqttClient.disconnect().finally(() => {
                            mqttClient = null;
                            resolve();
                        });
                    }
                    else {
                        resolve();
                    }
                };
                if (abortSignal) {
                    abortSignal.addEventListener("abort", cleanup, { once: true });
                }
            });
        },
    },
    onboarding: mqttOnboardingAdapter,
};
/**
 * Handle inbound MQTT message - process through OpenClaw agent and deliver reply
 */
async function handleInboundMessage(opts) {
    const { topic, payload, runtime, cfg, accountId, log, outboundTopic, qos } = opts;
    try {
        const text = payload.toString("utf-8");
        log?.info?.(`Inbound MQTT message on ${topic}: ${text.slice(0, 200)}${text.length > 200 ? "..." : ""}`);
        // Parse JSON if possible to extract structured data
        let parsedPayload = null;
        try {
            parsedPayload = JSON.parse(text);
        }
        catch {
            parsedPayload = null;
        }
        // Extract message body and sender from payload
        let messageBody;
        let senderId;
        let correlationId;
        let agentId = "main"; // 默认智能体
        if (parsedPayload && typeof parsedPayload === "object") {
            // Odoo 使用 'content' 字段，优先提取
            messageBody =
                parsedPayload.content ??
                    parsedPayload.message ??
                    parsedPayload.text ??
                    parsedPayload.msg ??
                    parsedPayload.alert ??
                    parsedPayload.body ??
                    text;
            // 发送者信息：优先使用 author_name (Odoo 格式)
            senderId =
                parsedPayload.author_name ??
                    parsedPayload.senderId ??
                    parsedPayload.source ??
                    parsedPayload.sender ??
                    parsedPayload.from ??
                    parsedPayload.service ??
                    topic.replace(/\//g, "-");
            correlationId =
                parsedPayload.correlationId ??
                    parsedPayload.requestId ??
                    undefined;
            // 支持 agentId 路由：从 payload 中提取 agentId 或 agent_id，用于多智能体路由
            // 兼容两种字段命名：agentId (camelCase) 和 agent_id (snake_case)
            const agentIdValue = parsedPayload.agentId ?? parsedPayload.agent_id;
            if (agentIdValue && typeof agentIdValue === "string") {
                agentId = agentIdValue;
                log?.info?.(`MQTT: routing to agent ${agentId}`);
            }
        }
        else {
            messageBody = text;
            senderId = topic.replace(/\//g, "-");
        }
        // 确定 ChatType：从 payload 提取 is_group_chat 或 message_type
        const isGroupChat = (parsedPayload?.is_group_chat === true) ||
            (parsedPayload?.message_type === 'discuss_group_chat') ||
            (parsedPayload?.chat_type === 'group');
        const chatType = isGroupChat ? "group" : "direct";
        // 群聊使用 channelId，私聊使用 senderId
        const chatSuffix = isGroupChat ? "g" : "p";
        let sessionKeyPart;
        if (isGroupChat && parsedPayload?.channel_id) {
            // 群聊：使用 channel_id 作为 SessionKey 的一部分，确保同一群聊共享上下文
            sessionKeyPart = String(parsedPayload.channel_id);
        }
        else {
            // 私聊：使用 senderId
            sessionKeyPart = senderId;
        }
        // Build the inbound context using OpenClaw's standard format
        const ctxPayload = runtime.channel.reply.finalizeInboundContext({
            Body: messageBody,
            RawBody: text,
            CommandBody: messageBody,
            CommandAuthorized: true,
            From: `odoo:${senderId}`,
            To: `odoo:${accountId}`,
            SessionKey: `agent:${agentId}:mqtt:${sessionKeyPart}:${chatSuffix}`,
            AccountId: accountId,
            ChatType: chatType,
            ConversationLabel: `odoo:${sessionKeyPart}`,
            SenderName: senderId,
            SenderId: senderId,
            Provider: "mqtt",
            Surface: "mqtt",
            MessageSid: `mqtt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            Timestamp: Date.now(),
        });
        // inbound context logging removed
        // Dispatch through OpenClaw's reply system and publish replies
        await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
            ctx: ctxPayload,
            cfg,
            dispatcherOptions: {
                deliver: async (payload, info) => {
                    if (!payload.text) {
                        log?.debug?.(`MQTT: skipping empty ${info.kind} reply`);
                        return;
                    }
                    log?.info?.(`MQTT reply (${info.kind}) [${payload.text.length} chars]`);
                    if (mqttClient?.isConnected()) {
                        try {
                            const outboundPayload = JSON.stringify({
                                senderId: "openclaw",
                                text: payload.text,
                                kind: info.kind,
                                ts: Date.now(),
                                ...(correlationId ? { correlationId } : {}),
                            });
                            await mqttClient.publish(outboundTopic, outboundPayload, qos);
                            log?.info?.(`MQTT: sent reply to ${outboundTopic}`);
                        }
                        catch (err) {
                            log?.error?.(`MQTT: failed to send reply: ${err}`);
                        }
                    }
                    else {
                        log?.warn?.(`MQTT: not connected, cannot send reply`);
                    }
                },
                onSkip: (_payload, info) => {
                    log?.debug?.(`MQTT: skipped reply (${info.reason})`);
                },
                onError: (err, info) => {
                    log?.error?.(`MQTT: ${info.kind} reply error: ${err}`);
                },
            },
            replyOptions: {
                disableBlockStreaming: true,
            },
        });
        // dispatch complete
        log?.info?.(`MQTT message processed from ${senderId}`);
    }
    catch (err) {
        log?.error?.(`Failed to process MQTT message: ${err}`);
    }
}
