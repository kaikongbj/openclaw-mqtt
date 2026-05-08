let runtime;
export function setMqttRuntime(r) {
    runtime = r;
}
export function getMqttRuntime() {
    if (!runtime) {
        throw new Error("MQTT runtime not initialized");
    }
    return runtime;
}
