import test from "node:test";
import assert from "node:assert";
import { createWorkerLogger, serializeError } from "../../lib/ops/logger";

test("logger standard outputs JSON", () => {
    const logger = createWorkerLogger("test-worker");

    // Intercept stdout
    const originalLog = console.log;
    let logOutput = "";
    console.log = (msg) => { logOutput = msg; };

    try {
        logger.info("Hello world", { claimId: 123 });
        const parsed = JSON.parse(logOutput);
        assert.strictEqual(parsed.worker, "test-worker");
        assert.strictEqual(parsed.level, "info");
        assert.strictEqual(parsed.msg, "Hello world");
        assert.deepStrictEqual(parsed.context, { claimId: 123 });
        assert.ok(parsed.timestamp);
    } finally {
        console.log = originalLog;
    }
});

test("logger scrubs secrets from context", () => {
    const logger = createWorkerLogger("test-worker");

    const originalLog = console.log;
    let logOutput = "";
    console.log = (msg) => { logOutput = msg; };

    try {
        logger.info("Connecting", {
            host: "example.com",
            providerCredentials: { secret: "12345", public_key: "abc" },
            apiKey: "secret-abc",
            some_tokenValue: "hidden"
        });

        const parsed = JSON.parse(logOutput);
        assert.strictEqual(parsed.context.host, "example.com");
        assert.strictEqual(parsed.context.providerCredentials.secret, "[REDACTED]");
        assert.strictEqual(parsed.context.providerCredentials.public_key, "[REDACTED]");
        assert.strictEqual(parsed.context.apiKey, "[REDACTED]");
        assert.strictEqual(parsed.context.some_tokenValue, "[REDACTED]");
    } finally {
        console.log = originalLog;
    }
});

test("logger serializes errors", () => {
    const logger = createWorkerLogger("test-worker");

    const originalError = console.error;
    let errorOutput = "";
    console.error = (msg) => { errorOutput = msg; };

    try {
        const err = new Error("Something broke");
        (err as any).customData = "custom";
        (err as any).my_secret_key = "should_be_hidden";

        logger.error("Failed to fetch", { error: err });

        const parsed = JSON.parse(errorOutput);
        assert.strictEqual(parsed.level, "error");
        assert.strictEqual(parsed.msg, "Failed to fetch");
        assert.strictEqual(parsed.context.error.message, "Something broke");
        assert.strictEqual(parsed.context.error.name, "Error");
        assert.ok(parsed.context.error.stack.includes("logger.test.ts"));
        assert.strictEqual(parsed.context.error.customData, "custom");
        assert.strictEqual(parsed.context.error.my_secret_key, "[REDACTED]");
    } finally {
        console.error = originalError;
    }
});

test("logger handles null/undefined message and circular context", () => {
    const logger = createWorkerLogger("test-worker");

    const originalLog = console.log;
    let logOutput = "";
    console.log = (msg) => { logOutput = msg; };

    try {
        const circular: any = { a: 1 };
        circular.self = circular;

        logger.info(null, { obj: circular });

        const parsed = JSON.parse(logOutput);
        assert.strictEqual(parsed.msg, "");
        assert.strictEqual(parsed.context.obj.a, 1);
        assert.strictEqual(parsed.context.obj.self, "[CIRCULAR]");
    } finally {
        console.log = originalLog;
    }
});
