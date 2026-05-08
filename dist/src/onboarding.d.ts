/**
 * MQTT Channel Onboarding Adapter
 * Provides interactive setup via `openclaw configure channels`
 */
interface MqttConfig {
    channels?: {
        mqtt?: {
            enabled?: boolean;
            brokerUrl?: string;
            username?: string;
            password?: string;
            topics?: {
                inbound?: string;
                outbound?: string;
            };
            tls?: {
                enabled?: boolean;
                rejectUnauthorized?: boolean;
            };
            qos?: 0 | 1 | 2;
        };
    };
}
interface Prompter {
    text(opts: {
        message: string;
        placeholder?: string;
        initialValue?: string;
        validate?: (value: string | undefined) => string | undefined;
    }): Promise<string>;
    confirm(opts: {
        message: string;
        initialValue?: boolean;
    }): Promise<boolean>;
    select<T>(opts: {
        message: string;
        options: Array<{
            value: T;
            label: string;
            hint?: string;
        }>;
        initialValue?: T;
    }): Promise<T>;
    note(message: string, title?: string): Promise<void>;
}
interface OnboardingStatus {
    channel: string;
    configured: boolean;
    statusLines: string[];
    selectionHint: string;
    quickstartScore: number;
}
interface ConfigureParams {
    cfg: MqttConfig;
    prompter: Prompter;
    accountOverrides?: Record<string, string>;
    shouldPromptAccountIds?: boolean;
    forceAllowFrom?: boolean;
}
interface ConfigureResult {
    cfg: MqttConfig;
    accountId: string;
}
export declare const mqttOnboardingAdapter: {
    channel: string;
    getStatus: ({ cfg }: {
        cfg: MqttConfig;
    }) => Promise<OnboardingStatus>;
    configure: ({ cfg, prompter, }: ConfigureParams) => Promise<ConfigureResult>;
    disable: (cfg: MqttConfig) => MqttConfig;
};
export {};
//# sourceMappingURL=onboarding.d.ts.map