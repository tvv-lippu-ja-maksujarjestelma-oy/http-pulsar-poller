import util from "node:util";
import http from "node:http";
import https from "node:https";
import got from "got";
import type pino from "pino";
import type Pulsar from "pulsar-client";
import type { HttpPollerConfig } from "./config.js";

const sleep = util.promisify(setTimeout);

const keepPollingAndSending = async (
  logger: pino.Logger,
  pulsarProducer: Pulsar.Producer,
  {
    url,
    username,
    password,
    sleepDurationInSeconds,
    requestTimeoutInSeconds,
    isHttp2Used,
    isUrlInPulsarMessageProperties,
    warningThresholdInSeconds,
    logIntervalInSeconds,
  }: HttpPollerConfig
) => {
  // There is only one URL so the cache will not grow beyond size of 1.
  // Therefore we can use a simple Map.
  const cache = new Map();
  logger.info(
    {
      sleepDurationInSeconds,
      requestTimeoutInSeconds,
      warningThresholdInSeconds,
      logIntervalInSeconds,
    },
    "Print some configuration values to ease monitoring"
  );
  let nRecentPulsarMessages = 0;

  setInterval(() => {
    logger.info({ nRecentPulsarMessages }, "messages forwarded to Pulsar");
    nRecentPulsarMessages = 0;
  }, logIntervalInSeconds * 1e3);

  const send = async (message: Pulsar.ProducerMessage) => {
    try {
      await pulsarProducer.send(message);
      nRecentPulsarMessages += 1;
    } catch (err) {
      logger.error(
        { err, message: JSON.stringify(message) },
        "Sending to Pulsar failed"
      );
    }
  };

  let httpClient = got.extend({
    retry: { limit: 0 },
    timeout: { request: requestTimeoutInSeconds * 1e3 },
    responseType: "buffer",
    cache,
    // With the default value of true, the request header Authorization would
    // prevent caching by default.
    cacheOptions: { shared: false },
    agent: {
      http: new http.Agent({ keepAlive: true }),
      https: new https.Agent({ keepAlive: true }),
    },
    headers: {
      // FIXME: Switch to name and version from package.json.
      "user-agent": "waltti-apc/dev",
    },
  });
  if (username && password) {
    httpClient = httpClient.extend({ username, password });
  }
  if (isHttp2Used) {
    httpClient = httpClient.extend({ http2: true });
  }
  const pulsarMessageProperties = isUrlInPulsarMessageProperties ? { url } : {};
  /* eslint-disable no-await-in-loop */
  for (;;) {
    try {
      const response = await httpClient.get(url);
      if (!response.isFromCache) {
        // For some reason timings is only available for responses not from the
        // cache, even if the server responded to If-None-Match to affirm the
        // freshness of the cache.
        if (
          warningThresholdInSeconds !== undefined &&
          response.timings.phases.total !== undefined &&
          response.timings.phases.total > warningThresholdInSeconds * 1e3
        ) {
          logger.warn(
            { timings: response.timings },
            `The HTTP request took over ${warningThresholdInSeconds} seconds ` +
              "to finish"
          );
        }
        const buffer = response.rawBody;
        if (!response.ok) {
          logger.warn(
            { response: JSON.stringify(response) },
            "HTTP response was not OK. Sending to Pulsar anyway."
          );
        }
        const producerMessage = {
          data: buffer,
          properties: {
            ...pulsarMessageProperties,
            ...{ statusCode: response.statusCode.toString() },
          },
          eventTimestamp: Date.now(),
        };
        // Send Pulsar messages in the background instead of blocking until the
        // Pulsar cluster has acked.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        send(producerMessage);
      }
    } catch (err) {
      logger.error({ err }, "HTTP request failed");
    }
    // For utmost simplicity, we do not send parallel HTTP requests. Instead we
    // sleep. The downside is that the rate of requests is more unpredictable.
    await sleep(sleepDurationInSeconds * 1e3);
  }
  /* eslint-enable no-await-in-loop */
};

export default keepPollingAndSending;
