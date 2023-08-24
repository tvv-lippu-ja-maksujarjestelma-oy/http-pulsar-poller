import fs from "node:fs";
import type pino from "pino";
import Pulsar from "pulsar-client";

export interface HttpPollerConfig {
  url: string;
  username?: string;
  password?: string;
  sleepDurationInSeconds: number;
  requestTimeoutInSeconds: number;
  isUrlInPulsarMessageProperties: boolean;
  logIntervalInSeconds: number;
  userAgent: string;
}

export interface PulsarOauth2Config {
  // pulsar-client requires "type" but that seems unnecessary
  type: string;
  issuer_url: string;
  client_id?: string;
  client_secret?: string;
  private_key?: string;
  audience?: string;
  scope?: string;
}

export interface PulsarConfig {
  oauth2Config: PulsarOauth2Config;
  clientConfig: Pulsar.ClientConfig;
  producerConfig: Pulsar.ProducerConfig;
}

export interface HealthCheckConfig {
  port: number;
}

export interface Config {
  httpPoller: HttpPollerConfig;
  pulsar: PulsarConfig;
  healthCheck: HealthCheckConfig;
}

const getRequired = (envVariable: string) => {
  const variable = process.env[envVariable];
  if (variable === undefined) {
    throw new Error(`${envVariable} must be defined`);
  }
  return variable;
};

const getOptional = (envVariable: string) => process.env[envVariable];

const getOptionalBooleanWithDefault = (
  envVariable: string,
  defaultValue: boolean
) => {
  let result = defaultValue;
  const str = getOptional(envVariable);
  if (str !== undefined) {
    if (!["false", "true"].includes(str)) {
      throw new Error(`${envVariable} must be either "false" or "true"`);
    }
    result = str === "true";
  }
  return result;
};

const getOptionalFloat = (envVariable: string): number | undefined => {
  const string = getOptional(envVariable);
  return string !== undefined ? parseFloat(string) : undefined;
};

const getOptionalNonNegativeFloat = (
  envVariable: string
): number | undefined => {
  const float = getOptionalFloat(envVariable);
  if (float != null && (!Number.isFinite(float) || float < 0)) {
    throw new Error(
      `${envVariable} must be a non-negative, finite float if given. Instead, ${float} was given.`
    );
  }
  return float;
};

const getHttpAuth = () => {
  let result;
  const usernameKey = "HTTP_USERNAME_PATH";
  const passwordKey = "HTTP_PASSWORD_PATH";
  const usernamePath = process.env[usernameKey];
  const passwordPath = process.env[passwordKey];
  const isUsernamePath = usernamePath !== undefined;
  const isPasswordPath = passwordPath !== undefined;
  if (isUsernamePath !== isPasswordPath) {
    throw new Error(
      `Either both or neither of ${usernameKey} and ${passwordKey} ` +
        "must be defined"
    );
  }
  if (isUsernamePath && isPasswordPath) {
    result = {
      username: fs.readFileSync(usernamePath, "utf8"),
      password: fs.readFileSync(passwordPath, "utf8"),
    };
  }
  return result;
};

const getHttpPollerConfig = () => {
  const url = getRequired("HTTP_URL");
  const usernameAndPassword = getHttpAuth();
  const sleepDurationInSeconds =
    getOptionalNonNegativeFloat("HTTP_SLEEP_DURATION_IN_SECONDS") ?? 0.1;
  const requestTimeoutInSeconds =
    getOptionalNonNegativeFloat("HTTP_REQUEST_TIMEOUT_IN_SECONDS") ?? 5;
  // The environment variable has been named weirdly because for someone who
  // does not read the code, the variable is probably more associated with the
  // Pulsar client than the HTTP client. Yet in the code we use this variable
  // only after creating the Pulsar client and producer.
  const isUrlInPulsarMessageProperties = getOptionalBooleanWithDefault(
    "PULSAR_IS_URL_IN_MESSAGE_PROPERTIES",
    false
  );
  const logIntervalInSeconds =
    getOptionalNonNegativeFloat("LOG_INTERVAL_IN_SECONDS") ?? 60;
  const userAgent = process.env["HTTP_USER_AGENT"] ?? "http-pulsar-poller";
  return {
    url,
    ...usernameAndPassword,
    sleepDurationInSeconds,
    requestTimeoutInSeconds,
    isUrlInPulsarMessageProperties,
    logIntervalInSeconds,
    userAgent,
  };
};

const getPulsarOauth2Config = () => ({
  // pulsar-client requires "type" but that seems unnecessary
  type: "client_credentials",
  issuer_url: getRequired("PULSAR_OAUTH2_ISSUER_URL"),
  private_key: getRequired("PULSAR_OAUTH2_KEY_PATH"),
  audience: getRequired("PULSAR_OAUTH2_AUDIENCE"),
});

const createPulsarLog =
  (logger: pino.Logger) =>
  (
    level: Pulsar.LogLevel,
    file: string,
    line: number,
    message: string
  ): void => {
    switch (level) {
      case Pulsar.LogLevel.DEBUG:
        logger.debug({ file, line }, message);
        break;
      case Pulsar.LogLevel.INFO:
        logger.info({ file, line }, message);
        break;
      case Pulsar.LogLevel.WARN:
        logger.warn({ file, line }, message);
        break;
      case Pulsar.LogLevel.ERROR:
        logger.error({ file, line }, message);
        break;
      default: {
        const exhaustiveCheck: never = level;
        throw new Error(String(exhaustiveCheck));
      }
    }
  };

const getPulsarCompressionType = (): Pulsar.CompressionType => {
  const compressionType = getOptional("PULSAR_COMPRESSION_TYPE") ?? "ZSTD";
  // tsc does not understand:
  // if (!["Zlib", "LZ4", "ZSTD", "SNAPPY"].includes(compressionType)) {
  if (
    compressionType !== "Zlib" &&
    compressionType !== "LZ4" &&
    compressionType !== "ZSTD" &&
    compressionType !== "SNAPPY"
  ) {
    throw new Error(
      "If defined, PULSAR_COMPRESSION_TYPE must be one of 'Zlib', 'LZ4', " +
        "'ZSTD' or 'SNAPPY'. Default is 'ZSTD'."
    );
  }
  return compressionType;
};

const getPulsarConfig = (logger: pino.Logger): PulsarConfig => {
  const oauth2Config = getPulsarOauth2Config();
  const serviceUrl = getRequired("PULSAR_SERVICE_URL");
  const tlsValidateHostname = getOptionalBooleanWithDefault(
    "PULSAR_TLS_VALIDATE_HOSTNAME",
    true
  );
  const log = createPulsarLog(logger);
  const topic = getRequired("PULSAR_TOPIC");
  const blockIfQueueFull = getOptionalBooleanWithDefault(
    "PULSAR_BLOCK_IF_QUEUE_FULL",
    true
  );
  const compressionType = getPulsarCompressionType();
  return {
    oauth2Config,
    clientConfig: {
      serviceUrl,
      tlsValidateHostname,
      log,
    },
    producerConfig: {
      topic,
      blockIfQueueFull,
      compressionType,
    },
  };
};

const getHealthCheckConfig = () => {
  const port = parseInt(getOptional("HEALTH_CHECK_PORT") ?? "8080", 10);
  return { port };
};

export const getConfig = (logger: pino.Logger): Config => ({
  httpPoller: getHttpPollerConfig(),
  pulsar: getPulsarConfig(logger),
  healthCheck: getHealthCheckConfig(),
});
